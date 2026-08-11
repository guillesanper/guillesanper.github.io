---
title: 'Alert Generation for a Simulated Nuclear Reactor'
description: 'Building an ML alerting layer on top of a physics simulation, and why the hard problem was deciding what deserves to wake someone up.'
tags: ["Machine Learning", "Simulation", "Python"]
pubDate: '2026-05-12'
coverImage: './cover.jpg'
---

This project has two halves: a physics simulation of a pressurised water reactor, and a machine learning layer that decides when its state warrants an alert. The second half was much harder than I expected, and not for modelling reasons.

## The simulation

The reactor model is a simplified point-kinetics core coupled to a thermal-hydraulic loop. Neutron population, delayed neutron precursors, fuel and coolant temperature, primary loop pressure and flow. It's a stiff system of ODEs, integrated with an implicit solver because explicit methods either blow up or force absurdly small timesteps.

Simplified in the sense that it would make an actual nuclear engineer wince. It is not a licensing-grade model and it isn't meant to be. What matters for the ML layer is that it produces *physically coupled* signals — when coolant flow drops, fuel temperature rises, reactivity responds through the negative temperature coefficient, and power settles at a new point. Those correlations are what an anomaly detector has to learn.

This turned out to be the whole reason for simulating rather than generating synthetic data directly. Randomly perturbed signals give you a detector that learns noise thresholds. Physically coupled signals give you one that can notice a *combination* is impossible even when no individual reading is out of range.

## What counts as an anomaly

The obvious framing is: learn normal operation, flag deviations. That produces an unusable system, and the reason is worth stating plainly.

A reactor is not in one steady state. It ramps, it follows load, it goes through startup and shutdown, control rods move, xenon builds up and burns off over hours. All of that is deviation from any given "normal", and all of it is expected. A detector trained on steady-state full-power operation fires continuously during a routine ramp.

So the model is conditioned on operating regime. A classifier assigns the current state to one of five regimes — startup, ramp-up, steady, load-follow, shutdown — and separate anomaly models are trained per regime. A pressure trajectory that is alarming at steady state is entirely normal during startup, and the system needs to know which one it's looking at.

## The alerting layer, which is where the actual difficulty was

Getting a detector to score anomalies is a modelling exercise. Turning scores into alerts is a design problem, and I did it badly twice before it worked.

**Attempt one: threshold the anomaly score.** Alerts fired constantly during transients. Every regime boundary produced a burst. Unusable within minutes.

**Attempt two: threshold with a debounce window.** Better, but it introduced a delay that scaled with the window, and the transients that mattered most were exactly the fast ones. I had traded false positives for slow detection of the real thing.

**What worked: separate detection from notification, and make severity a function of persistence and physical consequence.**

The detector runs continuously and writes every anomaly to a log. That log is complete and quiet — nothing pages anyone. On top of it sits an alerting policy:

- **Severity** is derived from which physical quantity is drifting and how close it is to a safety limit, not from the magnitude of the anomaly score. A small deviation in a parameter near its limit outranks a large deviation in one with plenty of margin.
- **Persistence** gates notification. A single anomalous sample is logged; sustained anomaly across a window escalates.
- **Correlated anomalies escalate faster than isolated ones.** Three coupled signals drifting together is a much stronger signal of a real fault than one signal drifting alone — the coupling means it's unlikely to be sensor noise.

That last rule is only possible because the simulation produces physically coupled data. It's the payoff for building the physics properly.

## The thing I'd tell myself at the start

I assumed the interesting work was the anomaly detection model, and that alerting was plumbing on top. It's the other way around. The detector was a few days. The alerting policy took weeks, because it encodes a judgement — what is worth a human's attention, and what is merely unusual — and no amount of model tuning produces that judgement for you.

Most of the failures in monitoring systems I've read about are not detection failures. They're alerting failures: the signal was in the logs, and it was buried under a thousand other alerts nobody trusted anymore.
