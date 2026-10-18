---
title: 'A Two-Stage Cascade for Intrusion Detection: Isolation Forest, Then XGBoost'
description: 'Why I split network intrusion detection into a cheap anomaly filter and an expensive classifier, what CICIDS2017 taught me about class imbalance, and why the cascade saved far less than I designed it to.'
tags: ["Machine Learning", "Security", "Python"]
pubDate: '2025-11-10'
updatedDate: '2026-10-18'
coverImage: './cover.jpg'
---

> **Read the headline number with care.** The 0.95 F1-macro below comes from a stratified random split over rows, and the project report already flagged that as optimistic: near-identical flows from the same attack burst land in both train and test. When I later rebuilt this cascade with a chronological split, the figure dropped a long way. That story is in [Your temporal split is probably measuring something else](/2026-08-10-temporal-split-measures-something-else/) and [The validation set lies the moment you stop shuffling](/2026-08-11-validation-set-lies/). This post describes the original design and its numbers as measured.

A single classifier over network traffic looks fine until you check what it is actually optimising. In the sample I trained on, about 83% of flows are benign, and the rarest attack class, Botnet, has 541 training rows against 581,776 benign ones. A model that predicts "benign" for everything scores well on accuracy and is worthless.

So I built the detector as a cascade: a cheap unsupervised stage that discards traffic that is clearly benign, and an expensive supervised stage that only sees what survives.

## Stage one: Isolation Forest as a filter, not a detector

Isolation Forest isolates points by randomly splitting features. Anomalies need fewer splits, so they end up with shorter average path lengths. It's unsupervised and fast, and crucially it doesn't need to know what an attack looks like.

I did not use it to classify anything. Its only job is to answer one question: is this flow boring enough to drop?

```python
self._model = IsolationForest(
    n_estimators=200,
    max_samples="auto",      # min(256, n_samples) per tree
    contamination=0.15,      # only sets sklearn's internal offset; unused below
    n_jobs=-1,
    random_state=self.random_seed,
)
self._model.fit(X_train[y_train == BENIGN_LABEL])   # benign traffic only
```

Two decisions worth spelling out.

**Fit on benign traffic only.** Isolation Forest is often fitted on everything and left to sort it out. Fitting it on benign rows turns it into a model of normality, which is the thing I actually want to compare against.

**Choose the threshold yourself, and choose it for recall.** `contamination` only moves the offset behind sklearn's own `predict()`, which the pipeline never calls. The real threshold comes from sweeping 300 candidates over the validation scores and keeping the one that maximises F-beta with β = 2:

```python
candidates = np.linspace(scores.min(), scores.max(), num=300)
for t in candidates:
    y_pred = (scores < t).astype(int)          # below t → anomaly
    fb = fbeta_score(y_binary, y_pred, beta=2.0)
```

β = 2 weights recall above precision. That is a deliberate statement: I would rather forward benign flows to stage two than drop an attack at stage one, because a flow that stage one drops never gets a second look.

## Stage two: XGBoost, and a NumPy network to keep it honest

The surviving flows go to a gradient-boosted classifier. Tabular data with mixed scales and non-linear feature interactions is where XGBoost is strong, and it handles the remaining imbalance through per-sample class weights. The defaults are 300 trees, depth 6 and learning rate 0.1, and a `RandomizedSearchCV` over 20 configurations picks the final ones.

I also implemented a feed-forward network from scratch in NumPy, with forward pass, backprop and Adam written by hand, and trained it on the same filtered set. I didn't expect it to beat XGBoost on tabular data, and it didn't. I wrote it because I wanted to see exactly what the gradients were doing to the rare classes, and a framework would have hidden that.

What it showed was not flattering. Class weights alone weren't enough, so I kept adding mechanisms: focal loss with γ = 2, balanced batches, oversampling of the minority classes, and label smoothing. Recall on the rare classes went up to 0.99 and precision collapsed. Botnet ended at 0.09 precision, because the balanced batches showed the network the same 541 Botnet flows over and over, and it learned to call anything resembling them Botnet. Seeing *how* it failed taught me more than a third library call would have.

## Results

Test set of 150,001 flows, stratified random split:

| Metric | IF + XGBoost | IF + NumPy network |
| --- | --- | --- |
| Accuracy | **0.9936** | 0.9696 |
| F1-macro | **0.9516** | 0.7508 |
| F1-weighted | **0.9936** | 0.9747 |
| Botnet F1 | **0.76** | 0.16 |

F1-weighted is dominated by the benign class, which was never the hard part. F1-macro is the honest summary, because it weights every attack class equally however rare it is. Even so, it only holds under the random split. Between the two, the column that matters is Botnet.

## The cascade didn't buy what I designed it for

The point of stage one was to keep most traffic away from the expensive model. Benign is ~83% of flows, so an ideal filter would discard roughly that much. Here is what it actually did on test:

| Stage one | Value |
| --- | --- |
| Attack recall | 0.968 |
| Benign flows flagged as anomalous (FPR) | 0.601 |
| Share of all traffic dropped | **33.2%** |

β = 2 pushed the threshold so far towards recall that 60% of benign traffic gets forwarded anyway. Stage two ends up processing two thirds of all flows, close to what a plain multi-class classifier would see without any cascade. The architecture works as a recall guarantee. As a cost saving it barely works, and I didn't see that until I measured the drop rate directly rather than the end-to-end F1.

## What I'd do differently

**Treat the stage-one threshold as an operational knob, not a hyperparameter.** It decides both the attack ceiling and the compute bill, and on live traffic it would need recalibrating as normal behaviour drifts.

**Monitor the drop rate as a first-class metric.** It's the number that told me the cascade wasn't saving much, and in production a sudden change in it would be the first sign that something upstream had changed.

**Never trust a random split on a continuous capture.** The report says so in its limitations section. The follow-up work measured how much it mattered, and that turned out to be more interesting than the cascade itself.
