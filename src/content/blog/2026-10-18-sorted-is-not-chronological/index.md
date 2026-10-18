---
title: 'sorted() is not chronological: the third time my temporal split was wrong'
description: 'A file-loading order that sorted Friday afternoon before Friday morning moved an intrusion detector from 0.7721 to 0.6467 F1-macro, and took down the result of a post I had already published. The control experiment, what survives, and a sampling option that raised the headline for the wrong reason.'
tags: ["Machine Learning", "Security", "Python"]
pubDate: '2026-10-18'
coverImage: './cover.jpg'
---

In August I published two posts about the flow track of Sentinel, an intrusion detector trained on
CICIDS2017 with an Isolation Forest → XGBoost cascade. The [first](/2026-08-10-temporal-split-measures-something-else/)
showed that the chronological split I was using had been cutting by attack *tool* rather than by
time. Its headline claim was that, of the F1-macro lost between a random and a temporal split, 24%
was near-duplicate leakage and **76% was an artefact of the taxonomy**. The
[second](/2026-08-11-validation-set-lies/) found a reporting bug and stated, in bold, that this
decomposition "holds up in full".

It doesn't. This post is about the line of code that broke it:

```python
csv_files = sorted(data_path.glob("*.csv"))
```

## Time as a position, not a value

The distribution of CICIDS2017 I use has no `Timestamp` column. Time only exists in two places: the
filename, which says which day and roughly which part of the day, and the row order inside each
file, which is chronological. The loader turns that into a provenance column, `order_idx`, as a
running offset over the rows in the order it reads them. The temporal split sorts each block by
`order_idx` and cuts 70/15/15 by position.

So the order in which the files are read *is* the time axis. And the files are read in
alphabetical order:

```
Friday-WorkingHours-Afternoon-DDos.pcap_ISCX.csv
Friday-WorkingHours-Afternoon-PortScan.pcap_ISCX.csv
Friday-WorkingHours-Morning.pcap_ISCX.csv
...
Thursday-WorkingHours-Afternoon-Infilteration.pcap_ISCX.csv
Thursday-WorkingHours-Morning-WebAttacks.pcap_ISCX.csv
```

"Afternoon" sorts before "Morning". On Thursday and Friday, the afternoon captures got smaller
`order_idx` values than the morning ones. The docstring of `order_idx` promised it was monotonic
*within a file*, and it was. Between files, it encoded the alphabet instead of the clock, and
nothing in the code ever asked for more than the docstring promised.

## Why only BENIGN was affected, and why that was enough

Here is what each file contains, counted over the raw CSVs, in real capture order:

| File | Raw labels |
|---|---|
| `Monday-WorkingHours` | BENIGN 529,918 |
| `Tuesday-WorkingHours` | BENIGN 432,074 · FTP-Patator 7,938 · SSH-Patator 5,897 |
| `Wednesday-workingHours` | BENIGN 440,031 · DoS Hulk 231,073 · GoldenEye 10,293 · slowloris 5,796 · Slowhttptest 5,499 · Heartbleed 11 |
| `Thursday-Morning-WebAttacks` | BENIGN 168,186 · Brute Force 1,507 · XSS 652 · Sql Injection 21 |
| `Thursday-Afternoon-Infilteration` | BENIGN 288,566 · Infiltration 36 |
| `Friday-Morning` | BENIGN 189,067 · Bot 1,966 |
| `Friday-Afternoon-DDos` | BENIGN 97,718 · DDoS 128,027 |
| `Friday-Afternoon-PortScan` | BENIGN 127,537 · PortScan 158,930 |

**No attack label appears in more than one file.** Every attack block lives inside a single file,
where row order is real time, so every attack was cut correctly despite the bug. The benign blocks
for Thursday (two files) and Friday (three) were not: the 70/15/15 cut ran over an invented order,
and "the last 15% of Friday's benign traffic" meant the end of the *morning* capture.

That sounds like a contained problem. It isn't, because of how the cascade works. Stage 1 is an
Isolation Forest trained **only on benign flows**, and its threshold is picked by maximising F-beta
on a validation set whose benign part came from those same mis-ordered cuts. Everything Stage 1
doesn't flag is reported as BENIGN and never reaches Stage 2. The second August post was entirely
about how much that one threshold governs. The bug sat right where it would do the most damage.

## The control experiment

The fix is three lines: a canonical `CAPTURE_FILE_ORDER` tuple, a sort key that uses it, and the
resolved order written into the run log so it can be audited without reading code:

```python
csv_files = sorted(
    data_path.glob("*.csv"),
    key=lambda p: (capture_file_rank(p.name), p.name),
)
logger.info(
    "cicids_load_started",
    n_files=len(csv_files),
    data_path=str(data_path),
    file_order=[p.name for p in csv_files],
)
```

But it moved the headline, and a fix that moves the headline has to be attributed, not just
asserted. So the control is the *current* code with `capture_file_rank` neutralised, so the sort
falls back to the alphabet:

| Run | Accuracy | F1-macro | F1-weighted | Stage 1 test P / R / FPR |
|---|---|---|---|---|
| Published in August | 0.9612 | **0.7721** | 0.9597 | 0.250 / 0.804 / 0.491 |
| Control: current code, alphabetical order | 0.9612 | **0.7721** | 0.9597 | 0.250 / 0.804 / 0.491 |
| Current code, capture order | 0.9194 | **0.6467** | 0.9052 | 0.335 / 0.560 / 0.226 |

The control reproduces August to the last published decimal. That settles two things at once: the
August runs were reproducible, and the move has a single cause. The Isolation Forest threshold
drops from 0.0911 to 0.0655, and Stage 1 recall on test from 0.804 to 0.560.

There is a second, smaller channel, and I'd rather say so than hide it. Reading the files in a
different order also changes which rows `groupby().sample()` draws. The random-split row bounds
that effect, because a random split has no temporal cut at all, yet its F1-macro still moves by
+0.0256 (0.9197 → 0.9453). The channel that matters is the first one, but the second isn't zero,
and I haven't separated them more finely than that.

## What's left of the decomposition

```
August, alphabetical order_idx
F1-macro   random 0.9197  →  sub-label 0.7721  →  class 0.2973
           └──── 0.1476 ────┘└──────── 0.4748 ────────┘
              leakage (23.7%)   taxonomy × time artefact (76.3%)

Capture-order order_idx
F1-macro   random 0.9453  →  sub-label 0.6467  →  class 0.6547
           └──── 0.2986 ────┘└──────── −0.0080 ────────┘
                protocol        artefact no longer measurable
```

The taxonomy artefact was never a direct effect on the classifier. Its only path was Stage 1's
shared threshold: blocking by canonical class changed what validation contained, which moved the
threshold, which moved every class. With capture order fixed, both protocols land on almost the
same threshold (Stage 1 recall 0.560 vs 0.573). When the mediator stops moving, the effect
disappears. `class` even ends up 0.008 *above* `sub-label`, and `BruteForce` now scores better
under the protocol that holds out a whole tool (0.969) than under the one that doesn't (0.934).

What survives from August is the dataset fact, not the metric. Under the `class` key, Tuesday's
test block is still 100% SSH-Patator, and 35% of Wednesday's is still GoldenEye and Heartbleed. That
is a bad property for a split to have. It just turned out not to cost 0.475 of F1-macro.

The 0.2986 that remains between random and temporal is also not "leakage" without qualification.
Under the random split, Stage 1 flags at least 95% of every attack class. Under the temporal one,
it flags 11% of `Scan` and none of `Botnet`. Part of the gap is near-duplicates that Stage 2 had
been memorising. Part is a Stage 1 threshold that doesn't transfer forward in time. I don't
separate the two, and I'm not going to pretend a number does.

The most important figure changed too. Stage 1 recall caps the whole cascade, so its complement is
the fraction of attacks that **cannot be recovered by design**. It was 19.6% when I published the
second post. With the files in capture order it is **44.0%**.

## The option that raised the headline for the wrong reason

At 200,000 sampled flows, Botnet keeps 108 training rows and 24 test rows, and on 24 rows a 0.00
and a 0.50 are the same measurement. So I added a sampling floor: `--class-sample-floor 2000`
gives every class at least 2,000 rows, or all it has, and spreads the rest of the budget
proportionally.

The headline went up, from 0.6467 to **0.7893**. It would be easy to write that as "fixed the rare
classes". Here is what actually moved:

| Class | train rows, no floor → floor | F1, no floor → floor | Stage 1 recall, no floor → floor |
|---|---|---|---|
| Botnet | 108 → 1,363 | 0.000 → **0.000** | 0.000 → 1.000 |
| Scan | 5,037 → **4,913** | 0.201 → **0.792** | 0.113 → 0.667 |
| DDoS | 7,109 → **6,934** | 0.886 → 0.956 | 0.796 → 0.921 |
| DoS | 10,758 → **10,495** | 0.732 → 0.847 | 0.594 → 0.754 |

`Scan`, `DDoS` and `DoS` improved **with fewer training rows than before**. They didn't learn
anything new. The floor adds 4,897 attack rows, taken mostly from BENIGN, which changes the
benign-to-attack ratio that the F-beta search sees. The Stage 1 threshold rises from 0.0655 to
0.0885, and Stage 1 recall from 0.560 to 0.819. Almost the whole gain is that. The class the floor
was built for is the one that didn't move.

It's the same coupling a third time: anything that changes the composition of validation moves
the single threshold, and the single threshold moves everything. That's why the floor ships
**disabled by default**. It's not a sampling option. It's a change of operating point that looks
like one.

## Botnet, with no excuse left

What the floor does buy is an answer for Botnet:

| Run | Botnet train | Botnet test | Stage 1 recall on Botnet | Stage 2 F1 on Botnet |
|---|---|---|---|---|
| temporal, no floor | 108 | 24 | 0.000 | 0.000 |
| temporal, floor 2,000 | 1,363 | 293 | **1.000** | **0.000** |
| random, floor 2,000 | 1,364 | 292 | 1.000 | 0.973 |

With 12.6× more training data, and with Stage 1 handing Stage 2 every single Botnet test flow,
Stage 2 still scores 0.00 under the temporal split, and 0.97 under the random one with the same
data volume. What's missing isn't support. A botnet captured on one morning with one tool, cut
chronologically, leaves nothing in its first 70% that transfers to its last 15%. The floor doesn't
fix Botnet. It removes the last methodological objection to the zero.

## The same mistake, one level down

While verifying all this I found two more of the same family. Hyperparameter tuning for Stage 2
split its training data with `StratifiedKFold(shuffle=True)`, reintroducing inside the training set
the exact leakage the temporal split exists to remove. It never touched a published metric, since
every reference run used `--skip-tuning`, but it biased which hyperparameters won. It's now an
expanding-window split per block (`ml/flow/cv.py`): fold *k* trains on the first *k* chunks of
every block and validates on the next one.

And the scorer, `scoring="f1_macro"`, averages over the classes present *in that fold*. With
stratified folds every class is always present, so that never mattered. With chronological folds a
missing class goes from impossible to routine, and scores across candidates stop being comparable.
It's the same default (`labels=None`) that had already bitten the headline `f1_macro` one level up,
in a module written months apart. The set a macro average runs over is a decision, and leaving it
out means making it badly.

## What I take from this

Three errors in one track, all from the same family: an honest computation over a set that wasn't
the one I thought it was. The split cut by tool instead of by time. The report read validation as
if it were test. The time axis was the alphabet. In all three cases the correction made the number
*worse*, and in all three the only thing that caught it was a control experiment changing exactly
one factor.

The generalisable lesson is about the third one. **When time is a position rather than a value,
the order you read your data in is data.** It belongs in the run log next to the metrics, where a
reader can check it without opening the code. That's why `file_order` is now in
`cicids_load_started`: if I had been logging it in August, the problem would have been visible
before the posts went out.

The full record, with every run and the reproduction commands, is in
[`docs/ml/PARTICION-TEMPORAL.md`](https://github.com/guillesanper/sentinel-platform/blob/temporal-fix/docs/ml/PARTICION-TEMPORAL.md).
