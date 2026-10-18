---
title: 'The validation set lies the moment you stop shuffling'
description: 'Reporting the operating point of the same set you picked the threshold on is correct by accident under a random split. Under a temporal one it stops being correct, and the most safety-critical figure in the design was off by a factor of 14.'
tags: ["Machine Learning", "Security", "Python"]
pubDate: '2026-08-11'
updatedDate: '2026-10-18'
coverImage: './cover.jpg'
---

> **Update, October 2026.** The bug and the fix described here stand, and the gap reappeared when I re-measured: under `sub-label`, Stage 1 recall is 0.760 on validation against 0.560 on test, and under `random` the gap is +0.001. Two things changed. The decomposition this post calls sound in "What doesn't change" did not survive a later re-measurement with the files in real capture order (see the note on [the previous post](/2026-08-10-temporal-split-measures-something-else/)). And with that order, the share of attacks Stage 1 cannot recover under the default protocol is 44.0%, not 19.6%.

Picking a threshold on validation and **reporting the operating point of that same set** is harmless
under a random split. It stops being harmless the moment the split is temporal. The shortcut wasn't
an oversight: it was correct by accident, under an assumption nobody had written down because it had
never been needed. Hardening the splitting protocol invalidated it, and the most safety-critical
figure in the design turned out to be wrong by a factor of 14.

This is the second bug in a series of two in Sentinel's flow track (intrusion detection over
CICIDS2017, Isolation Forest → XGBoost cascade, 78 CICFlowMeter features). The first one put the
*split* boundary in the wrong place; this one put the *reporting* boundary there. You don't need to
know the first to follow this one, but the relationship between them is the conclusion.

## The architecture, and why one number matters more than the rest

The cascade has two stages:

- **Stage 1** — an Isolation Forest trained **exclusively on BENIGN flows**. It decides whether a
  flow is anomalous. Since it never sees an attack during fitting, anything structurally different
  from normal traffic scores low, whether or not its family has been seen.
- **Stage 2** — an XGBoost that names the attack family. **It only sees what Stage 1 flagged.**

From that comes a structural property that governs the entire design: **Stage 1 recall is a hard
ceiling**. Whatever Stage 1 doesn't flag comes out as BENIGN and Stage 2 never sees it; no Stage 2
success can recover it. That's why the forest threshold is not optimised with F1 but with **F-beta
at β = 2**, which penalises false negatives above false positives. The decision is explicit and it
lives in the configuration, not buried in sklearn's `contamination`:

```
score(x) <  t  →  anomaly (positive class, 1)
score(x) >= t  →  BENIGN  (negative class, 0)
```

When you report "X% of attacks never clear Stage 1", that X is the figure a security engineer reads
to decide whether the system is deployable. It's the number you have to measure correctly.

## The code

`optimize_threshold()` sweeps every operating point the validation set offers, keeps the one that
maximises F-beta, and records the operating point **of that same set**:

```python
scores = self._model.decision_function(X_val)
y_binary = (y_val != BENIGN_LABEL).astype(int)

best_t, best_fbeta = best_fbeta_threshold(scores, y_binary, beta=beta, ...)

self._threshold = best_t
y_pred_best = (scores < best_t).astype(int)
self._threshold_info = self._compute_operating_info(y_binary, y_pred_best, beta)
```

Nothing wrong so far: that record is a legitimate note of *where the threshold came from*. The bug
was one layer up. `evaluate()` copied that note into the test metrics dict, next to accuracy and
f1_macro, which really were test figures:

```python
# BEFORE
y_pred = self.predict(X_test)
metrics = {
    "accuracy":    accuracy_score(y_test, y_pred),
    "f1_macro":    f1_score(y_test, y_pred, average="macro"),
    "f1_weighted": f1_score(y_test, y_pred, average="weighted"),
}
try:
    op = self._if_model.get_operating_point_info()   # ← validation
except RuntimeError:
    pass                                             # no threshold search happened
else:
    metrics["if_precision"] = op["precision"]
    metrics["if_recall"]    = op["recall"]           # ← next to test accuracy
```

The result in `training_summary.json` was a `metrics` block where four figures came from test and
four from validation, with no marking of any kind:

```json
"metrics": {
  "cascade_xgb": {
    "accuracy":  0.9612,
    "f1_macro":  0.7721,
    "if_recall": 0.985991   ← validation
  }
}
```

Nobody lied and nobody skipped a review. The suite was green, because every
function did exactly what its test checked.

## How it was caught: arithmetic, not intuition

There was no methodological suspicion. There was a sum that didn't add up. The operating point block
carries the raw confusion matrix counts:

```
tp + fp + tn + fn  =  4997 + 11912 + 13021 + 71  =  30001
```

and in the `data` block of the same file:

```
"val_size":  30001,
"test_size": 30008,
```

30,001 is not 30,008. The confusion matrix `if_recall` came from was counting the validation set.
Worth pointing out that this was only detectable because the summary stored `tp`, `fp`, `tn`, `fn`
alongside the derived rates: with only `recall: 0.986` there would have been nothing to add up.
Persisting the raw counts next to the ratios costs four integers, and it is what turned a conceptual
error into an arithmetic one.

## The measurement

With the threshold **frozen** and measured on both sets, across the three available splitting
protocols (`random` is the original random split; `sub-label` and `class` are two definitions of a
temporal block):

| Protocol | S1 recall (validation) | S1 recall (test) | Δ |
|---|---|---|---|
| `random` | 0.978 | 0.979 | **+0.001** |
| `sub-label` | 0.986 | **0.804** | **−0.182** |
| `class` | 0.626 | **0.393** | **−0.233** |

## Why the `random` row does all the diagnostic work

There are two candidate causes for a gap between validation and test:

**(a) Selection bias.** The threshold is the argmax of F-beta over the operating points that one
specific set offers. An argmax over a finite sample overfits that sample by construction, without
anything needing to drift.

**(b) Temporal drift.** Validation and test are different moments of the capture, and the score
distribution changes between them.

The search is **literally the same code** across all three protocols: same `best_fbeta_threshold`,
same β, same candidates, comparable set sizes. If the cause were (a), the gap would show up in all
three rows. It shows up only in the temporal ones, and in the random one it comes to +0.001 — noise,
and of the opposite sign.

So it's (b), and the mechanism is structural, not statistical. Under the temporal protocol the cut
is 70/15/15 **by position within each block**: validation is the **middle** 15% of each block and
test the **final** 15%. Validation is systematically closer to train in time. The Isolation Forest
score drifts along the attack burst — a twenty-minute PortScan campaign does not produce identical
flows at minute 2 and at minute 18 — and that drift is exactly what the temporal protocol was
designed to expose.

Under a random split, validation and test are interchangeable **by construction**: two i.i.d.
samples from the same distribution. Substituting one for the other is free, and that's why the
shortcut had been working forever. The temporal protocol turns them into two different moments, and
that's where the substitution starts lying.

There's an irony worth keeping: **the temporal split didn't create this problem, it made it
visible.** The bug had been in the code long before, producing a number that was correct by accident.

## The impact

The complement of Stage 1 recall is the fraction of attacks the cascade **cannot recover by design**:

| | published | actual |
|---|---|---|
| `sub-label` (default) | 1.4% | **19.6%** |
| `class` | 37% | **61%** |

A factor of 14 on the most safety-critical figure in the design, and in the secondary protocol the
reading goes from "more than a third is lost" to "almost two thirds are lost". Both are bad news;
the difference between them is the difference between a system you deploy under watch and one you
don't deploy.

## What doesn't change, and why it has to be said

`accuracy`, `f1_macro` and `f1_weighted` **always** came out of `predict(X_test)`. They are byte for
byte identical before and after the fix. The bug affected exclusively the four `if_*` figures in the
metrics block.

That matters because the flow track has another published result that depends on those end-to-end
metrics: a decomposition attributing the F1-macro drop between protocols to near-duplicate leakage
(0.148) versus taxonomy artefact (0.475). That decomposition **holds up in full** against this bug. *(It did not hold up against a later one; see the note at the top.)* Delimiting which
part of a result a bug invalidates is part of the work, and getting it wrong in either direction has
a cost: overstating the scope throws away valid results and burns credibility; understating it
leaves published what no longer stands. The operative rule is to trace the provenance of each figure
back to the call that produced it, not to reason from proximity in the JSON.

## The fix

Four changes, and none of them touches the model.

**A method that measures the frozen threshold on any set.** The detector already knew how to compute
an operating point; what it didn't know was how to do it outside the selection set:

```python
def measure_operating_point(self, X, y, beta=None) -> dict[str, Any]:
    self._check_fitted()
    if beta is None:
        beta = float(self._threshold_info.get("beta", 1.0))

    scores   = self._model.decision_function(X)
    y_binary = (y != BENIGN_LABEL).astype(int)
    y_pred   = (scores < self._threshold).astype(int)   # FROZEN threshold

    return self._compute_operating_info(y_binary, y_pred, beta)
```

**`_compute_operating_info` recomputes F-beta from the confusion matrix** instead of receiving it
from the search. That's the change that makes the function reusable: on the selection set the two
values match exactly — `best_fbeta_threshold` derives F-beta from the same precision and the same
recall — and outside it there is no search result to carry along. A helper that depends on its
caller is a helper that only works in one place.

**`evaluate()` measures on test.** The validation search is consulted only to know that a threshold
was chosen and with what β:

```python
# AFTER
try:
    # Only for the beta, and to establish that a threshold was in fact chosen.
    selection = self._if_model.get_operating_point_info()
except RuntimeError:
    pass
else:
    op = self._if_model.measure_operating_point(X_test, y_test, beta=selection["beta"])
    metrics["if_precision"] = op["precision"]
    metrics["if_recall"]    = op["recall"]
```

**The summary records both, labelled.** The validation figure isn't removed: it gets a name. The two
answer different questions and both are useful — "where did the threshold come from?" and "what does
it do on unseen data?" — what was not admissible was that they shared a key:

```json
"stage1_operating_point": {
  "cascade_xgb": {
    "selection": {
      "threshold": 0.09108978995918167, "beta": 2.0,
      "recall": 0.985991, "fpr": 0.47776, "fnr": 0.014009,
      "tp": 4997, "fp": 11912, "tn": 13021, "fn": 71
    },
    "test": {
      "threshold": 0.09108978995918167, "beta": 2.0,
      "recall": 0.803628, "fpr": 0.490897, "fnr": 0.196372,
      "tp": 4076, "fp": 12241, "tn": 12695, "fn": 996
    }
  }
}
```

Same `threshold` in both blocks: that's the proof that measuring didn't move it. And
`4076+12241+12695+996 = 30008 = test_size`.

**The tests that pin the property**, because the fix without them is a one-off correction and not an
invariant: `selection` sums to `val_size`; `test` sums to `test_size`; `metrics.if_recall` is the
test one; measuring on the selection set reproduces the stored point exactly; measuring on another
set counts *that* other one; and measuring doesn't move the threshold. The first pair of tests is
the one that would have caught the original bug, and it's interesting that the way to write it is
arithmetic — sum the confusion matrix and compare against a size — and not semantic.

On top of that, the docstring of `get_operating_point_info()` now says explicitly that it returns **a
fit statistic**, not an estimate of performance on unseen data. The method still exists and is still
the right one for its question; what was missing was for its name not to promise the other one.

---

The two bugs in this project are the same bug at two levels. **An honest number over the wrong set is
still a dishonest number.** The first put the *split* boundary in the wrong place; the second, the
*reporting* one. Both survived a green suite, because no test can
check which question you thought you were answering. The only thing that caught them, both times,
was building the control protocol that isolates one factor.
