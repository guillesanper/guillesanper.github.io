---
title: 'Your temporal split is probably measuring something else'
description: 'Changing a single grouping key moved an intrusion detector from 0.2809 to 0.7721 F1-macro, without touching the chronological guarantee or the model. An anatomy of a published result that was wrong by a factor of ~4.'
tags: ["Machine Learning", "Security", "Python"]
pubDate: '2026-08-10'
coverImage: './cover.jpg'
---

A chronological cut is not leakage-proof because it is chronological. It is leakage-proof with
respect to the **unit** it cuts over. If that unit aggregates processes that ran in series, the cut
stops separating "before" from "after" within a scenario and starts separating **one process from
another** — it becomes a holdout of those processes, and it doesn't warn you.

This article measures what that confusion costs in a concrete case: the headline figure of an
intrusion detection track moved from 0.2809 to 0.7721 F1-macro when a single grouping key changed,
with neither the chronological guarantee nor the model touched. The published result was wrong by a
factor of ~4, and the interesting part isn't that it got fixed but that it took a third protocol to
know that it was wrong.

## The dataset, and why it constrains everything

Sentinel has two parallel tracks: log events (an ensemble of three detectors, 25 features) and
network flows (an Isolation Forest → XGBoost cascade, 78 CICFlowMeter features). The flow track was
integrated from earlier work on CICIDS2017 that reported 0.9516 F1-macro and that admitted, in its
own §10.1, a methodological flaw: a stratified random per-row split over a continuous capture.
CICIDS2017 is real traffic captured over five days; the flows of a single attack burst — same host,
same scenario, milliseconds apart — are near-identical. A random split spreads them across train and
test. `drop_duplicates()` removes exact copies, not near-duplicates. The 0.95 was an optimistic
bound and it was labelled as such.

Fixing that was the point of the integration. And here is the constraint that governs everything
else: the `MachineLearningCVE` distribution of CICIDS2017 has 79 columns and **does not include
`Timestamp`**. The only carrier of time is the filename (`Monday-WorkingHours.csv`,
`Friday-Afternoon-DDos.csv`). The rows do preserve chronological order within each file, so time
exists as *position*, not as a value.

The loader materialises that into three provenance columns, and marks them as poison:

```python
LABEL_COL: Final[str] = "Label"
CAPTURE_DAY_COL: Final[str] = "capture_day"   # from the filename
ORDER_IDX_COL: Final[str] = "order_idx"       # monotonic position in load order
RAW_LABEL_COL: Final[str] = "raw_label"       # label before the canonical collapse

# Everything that must never reach the model. Consumed by get_feature_columns.
META_COLUMNS: Final[tuple[str, ...]] = (
    LABEL_COL, CAPTURE_DAY_COL, ORDER_IDX_COL, RAW_LABEL_COL,
)
```

If `capture_day` sneaks into the feature matrix, the model learns to detect Friday. Nothing raises.

## The two obvious solutions don't work

**A global positional cut** (first 70% train, last 15% test): useless over this distribution. In
`Friday-WorkingHours-Afternoon-DDos.pcap_ISCX.csv` the last decile is 100% BENIGN. The test set
wouldn't contain a single attack.

**A per-day holdout** ("let's hold out Friday"): it kills training. In CICIDS2017 every class lives
on exactly one day — Tuesday is BruteForce, Wednesday DoS, Thursday morning WebAttack, Friday Bot,
PortScan and DDoS. Holding out Friday leaves DDoS, Scan and Botnet with **zero training samples**.
It is a valid protocol for a different question ("does it generalise to an unseen day?"), and it is
kept as such, but it cannot be the reference protocol.

What got implemented is a **block-wise split**: within each block the rows are sorted by `order_idx`
and cut 70/15/15 by position. No test flow precedes a train flow within its own scenario, every
class survives in all three partitions, and the near-duplicates of a burst stay contiguous.

One decision is left, and it is the whole substance of the matter: **what a block is**.

## The result that looked like the conclusion

The first version defined a block as `(capture_day, canonical class)`. The numbers:

| Split | Accuracy | F1-macro |
|---|---|---|
| `random` | 0.9934 | **0.9166** |
| `temporal` | 0.8783 | **0.2809** |

and the reading that got published was:

> The drop from 0.9166 to 0.2809 in F1-macro is not a regression: it is the magnitude of the leak.

It's a sentence shaped like a conclusion: it quantifies exactly what the earlier work admitted it
had not controlled for. It was the most cited result of the branch for weeks.

It is wrong by a factor of ~4.

## Why it was wrong

`ATTACK_GROUPS` collapses 15 raw CICIDS2017 labels into 8 canonical classes. That is a perfectly
reasonable **reporting** decision: nobody wants a 15×15 confusion matrix where three cells hold 20
samples. The problem is that the tools collapsed together **ran sequentially within the same capture
day**. Wednesday goes Hulk → slowloris → Slowhttptest → GoldenEye, all labelled `DoS`. Tuesday goes
FTP-Patator → SSH-Patator, both `BruteForce`.

Cutting by position inside a block like that does not separate phases of a scenario: it separates
tools. Actual composition of each block under the 70/15/15 cut, measured over the full dataset
(2,520,798 rows after cleaning, unsampled):

| Block | Tools | train (first 70%) | test (last 15%) |
|---|---|---|---|
| `wednesday/DoS` | 5 | Hulk 125,016 · slowloris 5,385 · Slowhttptest 5,228 | Hulk 18,767 · **GoldenEye 10,286** · **Heartbleed 11** |
| `thursday/WebAttack` | 3 | Brute Force 1,470 · XSS 30 | **XSS 301** · **Sql Injection 21** |
| `tuesday/BruteForce` | 2 | FTP-Patator 5,931 · SSH-Patator 474 | **SSH-Patator 1,373 (100%)** |
| `friday/DDoS` | 1 | DDoS 89,609 | DDoS 19,203 |
| `friday/Scan` | 1 | PortScan 63,485 | PortScan 13,605 |
| `friday/Botnet` | 1 | Bot 1,363 | Bot 293 |
| `thursday/Infiltration` | 1 | Infiltration 25 | Infiltration 6 |

In the first three rows the test set is not measuring the same thing as the train set:

- **`wednesday/DoS`**: 35.4% of test is GoldenEye and Heartbleed, which do not appear **even once**
  in train.
- **`thursday/WebAttack`**: Sql Injection never appears in train; XSS appears 30 times against 301 in
  test. The classifier sees 9% of the evidence it is asked to reproduce.
- **`tuesday/BruteForce`**: the test set is **entirely** SSH-Patator, against 474 SSH-Patator rows in
  a train set of 6,405.

That is not a leakage-proof split. It is an unseen-attack-tool holdout, dressed up as a
leakage-proof split. It is a legitimate and hard question — probably harder than the one we meant to
answer — but it is **a different question**, and nobody had chosen it.

## The experiment that isolates the factor

A third protocol, with exactly the same chronological guarantee, changing only the block key:
`(capture_day, raw label)` instead of `(capture_day, canonical class)`. Each tool gets cut along its
own timeline. The whole signature fits in two branches:

```python
def _resolve_block_columns(df: pd.DataFrame, temporal_block: str) -> list[str]:
    """Pick the columns that define a temporal block."""
    if temporal_block == "class":
        return [CAPTURE_DAY_COL, LABEL_COL]

    if RAW_LABEL_COL not in df.columns:
        logger.warning("temporal_block_fallback_to_class", requested=temporal_block)
        return [CAPTURE_DAY_COL, LABEL_COL]

    return [CAPTURE_DAY_COL, RAW_LABEL_COL]
```

Three lines of decision. Results over 200,000 sampled flows, `xgb` pipeline, no tuning:

| Protocol | Accuracy | F1-macro | F1-weighted | Stage 1 P / R / FPR (test) |
|---|---|---|---|---|
| `--split random` | 0.9944 | **0.9197** | 0.9945 | 0.251 / 0.979 / 0.593 |
| `temporal --temporal-block sub-label` *(new default)* | 0.9612 | **0.7721** | 0.9597 | 0.250 / 0.804 / 0.491 |
| `temporal --temporal-block class` *(previous default)* | 0.8807 | **0.2973** | 0.8483 | 0.679 / 0.393 / 0.038 |

*(The `random`/`class` figures in this table differ in the third decimal from the ones originally
published — 0.9166 and 0.2809 — because they were re-measured after pulling `Infiltration` out of the
`Scan` class, an adjacent fix found in the same review. The argument does not depend on that
difference.)*

The decomposition:

```
F1-macro   random 0.9197  →  sub-label 0.7721  →  class 0.2973
           └──── 0.1476 ────┘└──────── 0.4748 ────────┘
              leakage (23.7%)   taxonomy × time artefact (76.3%)
```

**Near-duplicate leakage is worth 0.148 of F1-macro, not 0.622.** The remaining 76% is produced by a
taxonomy decision that leaked into the definition of the split.

This is worth stating explicitly, because the change runs in the uncomfortable direction: **the
correction improves the headline number**, from 0.28 to 0.77. A result that gets better when you fix
the protocol demands more justification than one that gets worse, not less, because the reviewer's
bias is working in its favour. The justification is this: both temporal protocols carry the same
chronological guarantee and the same prohibition on a test flow preceding a train flow within its
scenario. The only thing that changes is that under `sub-label` no tool ends up entirely outside
train. If the drop to 0.28 were leakage, `sub-label` — which removes exactly the same leakage —
would drop too. It doesn't.

## The artefact doesn't stay where it should

This is the finding we didn't expect, and the one that most justifies changing the default.

`Scan` and `DDoS` have **a single tool** each. Their block is split **identically, bit for bit**,
under both protocols: `(friday, Scan)` and `(friday, PortScan)` are the same set of rows in the same
order. And even so:

| Class | Tools | Support (test) | `random` | `sub-label` | `class` |
|---|---|---|---|---|---|
| BENIGN | — | 24,936 | 1.00 | 0.98 | 0.94 |
| Botnet | 1 | 24 | 0.54 | **0.00** | **0.00** |
| BruteForce | 2 | 110 | 0.98 | 0.98 | **0.00** |
| DDoS | 1 | 1,524 | 0.99 | 0.98 | 0.63 |
| DoS | 5 | 2,308 | 0.98 | 0.84 | 0.44 |
| Scan | 1 | 1,080 | 0.99 | 0.80 | **0.01** |
| WebAttack | 3 | 26 | 0.96 | 0.83 | 0.06 |

`Scan` falls from 0.80 to 0.01 and `DDoS` from 0.98 to 0.63 when you change a blocking key that
doesn't touch a single one of their rows.

The vector is **Stage 1's shared operating point**. The architecture is a cascade: an Isolation
Forest trained only on BENIGN flows decides whether a flow is anomalous, and an XGBoost names the
attack family, seeing only what Stage 1 flagged. The Isolation Forest threshold is chosen by
maximising F-beta on validation — and the composition of validation is fixed by **the same blocking
key**. Under `class`, validation contains tools the forest never saw, the search lands on a
radically more conservative threshold, and the result is paid for everywhere:

| Protocol | Stage 1 recall (test) | Stage 1 FPR (test) |
|---|---|---|
| `sub-label` | 0.804 | 0.491 |
| `class` | **0.393** | 0.038 |

With `class`, **61% of attacks never clear Stage 1** and therefore never reach Stage 2. No Stage 2
success can recover them. The single-tool classes pay the bill just like the rest.

The moral generalises beyond this dataset: **in a cascade, contaminating the validation set of three
classes moves the operating point of all seven**. The per-class metrics of a two-stage architecture
are not independent variables, even though `classification_report` prints them on separate rows.

## Why that F1-macro was never a coherent aggregate anyway

Even if the `class` protocol measured what it was meant to, the number still could not be averaged.
`class` only demands generalisation to a new tool **in the classes that have more than one**:

- `BruteForce`, `DoS` and `WebAttack` answer "does it generalise to an unseen tool?".
- `Botnet`, `DDoS` and `Scan` have a single tool and answer "does it detect what it has already
  seen?".

Averaging the six produces a number that answers neither question. That's why the protocol is kept —
it runs behind a flag, `--temporal-block class`, and its result is still published — but it is
reported separately and never as the headline. A bad number was not deleted: it was labelled.

## Where the harsh verdict holds up in full

`Botnet` falls **0.54 → 0.00 under both temporal protocols**.

It has a single sub-label (`Bot`), a single day and ~1,950 rows. Its block splits identically under
both keys, so there is no room here to confuse it with novelty: the model goes from 0.54 to zero the
moment near-duplicates stop crossing the train/test boundary. **That 0.54 was pure memorisation.**
With the 200,000-flow sample it is left with 108 training rows and 24 test rows; there is nothing to
learn the class from once you can't memorise it.

It is the one point where the original harsh reading holds up without caveats, and it is still
broken today. The real weak point of the design is there — in minority classes concentrated on a
single day — not in a global F1-macro of 0.28. Fixing the split didn't fix Botnet; it left it in
plain sight without the surrounding noise.

## How to make it auditable

The structural fix fits in one idea: **keep the raw label as a provenance column**, decoupling the
*reporting* decision (collapse 15 labels into 8 classes) from the *splitting* decision (what a block
is). The collapse still exists for the metrics; it no longer governs the cut.

The second part is emitting the per-sub-label breakdown in the run log, not just the per-class one:

```
split_class_distribution     label=BruteForce   train=6405 val=1373 test=1373
split_sublabel_distribution  label=FTP-Patator  train=5931 val=1272 test=0      ← warning
split_sublabel_distribution  label=SSH-Patator  train=474  val=101  test=1373
```

The first line looks perfectly healthy. The two below it, with `FTP-Patator test=0`, are the ones
that give away that the cut held out an entire tool. The logger emits `warning` instead of `info` as
soon as any partition comes out at zero, so the problem shows up at the default log level without
anyone having to go looking for it.
