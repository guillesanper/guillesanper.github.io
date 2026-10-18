---
title: 'Alert Generation for a Simulated Nuclear Reactor: Ground Truth First'
description: 'Before an ML layer can decide what deserves to wake someone up, it needs data where the right answer is known. A physics simulation of a pressurised water reactor, instrument-fault detectors on a Kafka stream, and the alerting design that comes next.'
tags: ["Machine Learning", "Simulation", "Python"]
pubDate: '2026-05-12'
updatedDate: '2026-10-18'
coverImage: './cover.jpg'
---

> **Correction.** An earlier version of this post described a regime classifier, per-regime anomaly models and an alerting policy as if they were built. They aren't yet. They are the design for the next phase. This version describes what exists in the repository today and marks the rest as planned.

ReactorGuard is meant to end with a machine learning layer that decides when a reactor's state deserves an alert. It doesn't start there. You can't evaluate a detector without data where you know which samples are faults, and real reactor fault data is neither public nor plentiful. So the work so far has gone into three things: a stream of sensor readings, detectors for broken instruments, and a physics simulation that can generate faults on demand with the right answer attached.

## Instrument faults first, on a real process

Before simulating anything, the pipeline ran on the Tennessee Eastman Process (TEP), a chemical-plant benchmark with 52 sensor channels and labelled fault runs. Readings go through Kafka (Strimzi on GKE, with a local Docker setup that's verified for now), and a validation consumer runs five detectors over every reading: stuck value, rate of change, out of range, cross-correlation and a Kalman-based drift detector. Each detected fault becomes an event on an `anomaly-alerts` topic.

Two design choices did most of the work.

**No detector reads the `quality` flag.** `quality` describes whether the transmitter can be trusted, which is exactly what the validator is deciding. Reading it as an input would make the evaluation circular. The validator writes it and never reads it.

**Thresholds are fractions of each channel's alarm band, not engineering units.** One absolute threshold shared by 52 channels measured in kg/s, bar and mol% means something different on every one of them.

Measured on TEP with injected faults:

| Detector | Precision | Recall | False-positive rate |
| --- | --- | --- | --- |
| stuck | 1.000 | 0.814 | 0.0000 |
| out of range | 1.000 | 1.000 | 0.0000 |
| noise spike | 1.000 | 0.778 | 0.0000 |
| drift | 0.993 | 0.930 | 0.0001 |

The most useful finding was a negative one. TEP samples every 180 seconds, not every second, and that broke three defaults I had inherited from the design document: the Kalman process noise, the drift threshold, which at its original value fired on 48% of normal operation, and feature windows sized in seconds rather than samples. At that cadence a slow instrument drift is **not detectable** with this mechanism. The usable band is only about 10–18 alarm-band widths per hour. That limit is written into the code as a named constant, so nobody tunes the detector expecting it to see something it can't.

Alert events carry a deterministic UUID5 built from the fault and its source reading. Kafka delivers at least once, so a reprocessed reading produces the same `alert_id` and can be deduplicated downstream instead of paging twice.

## The simulation

TEP has no reactor physics, and the alerting layer needs physically coupled signals. So the second half is a simplified model of a generic 3000 MWt pressurised water reactor, which isn't a real plant:

- point kinetics with six delayed-neutron precursor groups
- three thermal nodes: fuel, core outlet and steam generator
- primary pressure, void fraction, coolant flow, and a PI rod controller
- reactivity feedback from fuel temperature (Doppler), moderator temperature and void

It's simplified enough to make a nuclear engineer wince, and the neutronic coefficients are literature placeholders. What matters is that its signals are coupled: cut coolant flow and fuel temperature rises, reactivity responds through the negative temperature coefficient, and power settles at a new point. A detector trained on independently perturbed signals learns noise thresholds. A detector trained on coupled ones can learn that a *combination* of readings is impossible even when each reading is in range.

Three properties I insisted on, each with a measurement behind it:

- **Equilibrium is derived, not typed in.** Initial temperatures and heat-transfer coefficients come from power, flow and inlet temperature. After 24 simulated hours at nominal power the maximum relative derivative is 6e-17.
- **Energy is conserved by construction.** The same heat-capacity term appears on both sides of each transport equation, so the three node equations sum to exactly generated minus removed heat. Over a 2,000-step ramp the energy closes to 2e-15.
- **The solver is checked against a second one.** Integration uses scipy's LSODA, which switches between stiff and non-stiff methods on its own. Radau agrees with it to 6.5e-8, and the trace is byte-identical across processes.

On top of the model sits a fault catalogue on two separate axes. **Process faults** change the plant: a thermal excursion from inserted reactivity, a coolant flow reduction, void formation after a leak. **Instrument faults** change only the reading: drift, stuck, spike, bias, intermittent. A scenario planner draws runs from both against a severity budget and tracks how well the space is covered. Every sample comes out labelled with its true state and whether the reading is corrupted.

## The alerting layer: planned design

The ML layer isn't built yet. The training script and API routes are scaffolding. But the design is clear enough to write down, because it came from getting simple versions wrong on paper first.

**Thresholding an anomaly score doesn't work.** A reactor isn't in one steady state. It starts up, ramps, follows load and shuts down, and every transition looks like a deviation. A detector trained on steady full-power operation would fire throughout a routine ramp.

**A debounce window trades false positives for slow detection,** and the transients that matter most are the fast ones.

The plan is to separate detection from notification:

- Condition detection on the **operating regime** (startup, ramp, steady, load-follow, shutdown), so a pressure trajectory that is alarming at steady state isn't flagged during startup.
- Log every anomaly to a complete, quiet stream. The `anomaly-alerts` topic already plays that role for instrument faults.
- Derive **severity from proximity to a safety limit,** not from the size of the anomaly score. A small deviation in a parameter near its limit should outrank a large one with plenty of margin.
- Gate notification on **persistence,** and escalate faster when **coupled signals drift together,** because coupling makes sensor noise an unlikely explanation.

That last rule is the reason for building the physics instead of generating synthetic noise. Whether it holds up is something the simulator will now let me measure: time to alert, alerts per hour during normal transients, and recall over the fault scenarios.

## The thing I'd tell myself at the start

I assumed the interesting work was the anomaly model. So far, everything that mattered has been about ground truth: which samples are really faults, which faults a detector can physically see at a given cadence, and whether the simulated plant conserves energy. Without those answers an alerting policy is just a set of opinions.
