---
title: 'A Two-Stage Cascade for Intrusion Detection: Isolation Forest, Then XGBoost'
description: 'Why I split network intrusion detection into a cheap anomaly filter and an expensive classifier, and what CICIDS2017 taught me about class imbalance.'
tags: ["Machine Learning", "Security", "Python"]
pubDate: '2025-11-10'
coverImage: './cover.jpg'
---

A single classifier over network traffic looks fine until you check what it is actually optimising. CICIDS2017 is roughly 80% benign traffic, and some attack classes appear a few hundred times against 2.2 million flows. A model that predicts "benign" for everything scores well on accuracy and is worthless.

So I built the detector as a cascade instead: a cheap unsupervised stage that discards obvious benign traffic, and an expensive supervised stage that only sees what survives.

## Stage one: Isolation Forest as a filter, not a detector

Isolation Forest isolates points by randomly splitting features — anomalies need fewer splits, so they end up with shorter average path lengths. It's unsupervised, it's fast, and crucially it doesn't need to know what an attack looks like.

I did not use it to classify anything. Its only job is to answer "is this flow boring enough to drop?"

```python
from sklearn.ensemble import IsolationForest

iso = IsolationForest(
    n_estimators=200,
    contamination=0.25,   # deliberately loose
    max_samples=256,
    random_state=42,
)
iso.fit(X_train_benign)          # fitted on benign traffic only
scores = -iso.score_samples(X)   # higher = more anomalous
```

Two decisions worth spelling out.

**Fit on benign traffic only.** Isolation Forest is often fitted on everything and left to sort it out. Fitting it on a clean benign sample turns it into a model of normality, which is the thing I actually want to compare against.

**Set contamination far above the real attack rate.** 0.25 is not an estimate of how much of the traffic is malicious. It is a threshold choice that says: I would rather forward four benign flows than drop one attack. The filter is tuned for recall and nothing else. Precision is stage two's problem.

At that setting the filter drops about 62% of traffic while retaining 99.1% of attack flows. Everything downstream gets a much less imbalanced problem to work on.

## Stage two: XGBoost, and a NumPy network to keep it honest

The surviving flows go to a gradient-boosted classifier. Tabular data with mixed scales and non-linear feature interactions is exactly where XGBoost is strong, and it handles the residual imbalance well with class weighting.

```python
import xgboost as xgb

clf = xgb.XGBClassifier(
    n_estimators=400,
    max_depth=8,
    learning_rate=0.08,
    subsample=0.8,
    colsample_bytree=0.8,
    objective="multi:softprob",
    eval_metric="mlogloss",
)
clf.fit(X_filtered, y_filtered, sample_weight=weights)
```

I also implemented a feed-forward network from scratch in NumPy — forward pass, backprop, Adam, the whole thing — and trained it on the same filtered set. Not because I expected it to beat XGBoost on tabular data. It didn't. I wrote it because I wanted to know exactly what the gradients were doing to the rare classes, and a framework would have hidden that from me.

What it showed: with plain cross-entropy the network essentially ignores classes under ~500 samples. The gradient contribution from those classes is a rounding error against the benign majority. Class-weighted loss fixed it, and seeing *why* it needed fixing was worth the two evenings of writing backprop by hand.

## Results

Final numbers on the held-out test set:

| Metric | Single XGBoost | Cascade |
| --- | --- | --- |
| F1-macro | 0.87 | **0.95** |
| F1-weighted | 0.98 | 0.99 |
| Inference cost | 1.0x | 0.41x |

F1-weighted barely moves — it's dominated by the benign class, which was never the hard part. F1-macro is the honest number here, because it weights every attack class equally regardless of how rare it is, and that jumped 8 points.

The cost reduction is a side effect: most traffic never reaches the expensive model.

## What I'd do differently

CICIDS2017 is a lab capture. The traffic is generated, the attacks are scripted, and the benign baseline is far cleaner than anything real. A cascade tuned on it will need its stage-one threshold recalibrated against live traffic, and probably re-tuned regularly as normal behaviour drifts. Treating that threshold as a fixed hyperparameter rather than an operational knob would be the first thing to break in production.

I'd also want the filter's drop rate monitored as a first-class metric. If stage one suddenly starts forwarding 90% of traffic, something upstream changed, and I'd rather know that from a dashboard than from a stage-two latency alert.
