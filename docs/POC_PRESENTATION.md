# Presenting the Guideline Layer PoC — Final-Year Project Guide

This document turns the implementation into a convincing proof of concept for
your final-year project presentation. It covers what a PoC must demonstrate,
a 5-minute live demo script, a slide outline, likely examiner questions, and a
timeline for turning the PoC into the full project.

---

## 1. What your PoC must demonstrate (examiner checklist)

A proof of concept answers "does the proposed mechanism actually work?" For
your paper, the mechanism is the closed loop:

1. **Monitoring** — every inference cycle produces a resource profile
   (CPU, RAM, battery, bandwidth). ✅ `logs/inferences.jsonl`
2. **Threshold enforcement** — breaches of the paper's four benchmarks are
   detected automatically. ✅ `guideline_layer/thresholds.py`
3. **Actionable warnings** — alerts name the remedy (prune / quantize /
   reduce frequency), not just the symptom. ✅ `logs/warnings.jsonl`
4. **Logging + fleet sync** — lightweight on-device records, periodic
   aggregation cloud-side. ✅ `cloud/fleet_log.csv`
5. **Model-agnostic** — the layer runs beside linear, XGBoost-class, and deep
   models *unchanged* (the paper's central claim). ✅ 3 models, same layer.
6. **Negligible overhead** — the layer adds ~0% wall time (measured ON vs OFF).
7. **Accuracy preserved** — adding the layer does not touch ETA accuracy.

Be ready to say which item you are showing and *why it matters* for each demo
step. The "why" is the paper's research gap: the literature reports accuracy
but almost never resource cost, so deployments fail on constrained devices.

## 2. Live demo script (5–7 minutes)

**Setup beforehand:** run `python run_experiment.py` once so `results/latest/`
is populated, then re-run it *during* the demo for the "live" effect (it takes
~30 s; fill the time by narrating).

| # | What you do | What you say (1–2 sentences) |
|---|---|---|
| 0 | Open the live dashboard: `python run_dashboard.py`, then http://127.0.0.1:8000 | "Before the numbers, let me show you *what the system does*, live. This is the same Python pipeline — data, three models, the four-module layer — but every inference is visualised as it happens and explained in plain language." Press **Start simulation** and let it stream while you talk. |
| 1 | Live Run tab: point at the route + resource meters | "Watch the bus: at every stop the model predicts the remaining minutes, and the layer samples CPU, RAM, battery and bandwidth. The deep model's CPU meter sits above the red 30% limit — see it? Every one of those predictions is logged as a violation." |
| 2 | Live Run tab: “What just happened?” panel + event feed | "The dashboard translates each event into plain English. Here is the Warning System alerting with a concrete fix — prune or quantize — and here are the cooldown-deduplicated alerts and cloud syncs." |
| 3 | Results tab | "When the run finishes, the Results tab answers the real question: *which model should go on the bus?* Gradient boosting gives the same accuracy as the deep net at 1.5% CPU; the deep net is accurate but breaches the ceiling on every prediction, so the layer flags it. The interpretation panel is written so you don't need to read charts." |
| 4 | Open `guideline_layer/config.py` | "These four numbers are the paper's profiling benchmarks — CPU 30%, RAM 500 MB, battery 20%/hr, bandwidth 1 MB/min. Every model in the system is judged against them." |
| 5 | Run `python run_experiment.py` (CLI, optional) | "The same pipeline runs headlessly for reproducible numbers — one command, seeded, ~8,600 stop-observations." |
| 6 | Open `results/latest/report.html` | "The layer outputs two things per inference: the ETA and a resource report. Here the deep model matches the lightweight model's accuracy — 34.8 vs 33.6 s MAE — but breaches the 30% CPU ceiling on the embedded-device model." |
| 7 | Point at `resource_time_series.png` | "This is the Monitoring Engine in action, every inference cycle. Red triangles mark every threshold breach the Threshold Checker caught." |
| 8 | Open `logs/warnings.jsonl` | "The Warning System turns breaches into actionable alerts — 'CPU sustained load too high: consider pruning, reducing inference frequency, or switching to a lighter architecture.' Alerts are deduplicated by cooldown and escalate if they persist." |
| 9 | Point at `cloud/fleet_log.csv` | "The Logging Module syncs lightweight aggregates to the fleet cloud periodically — the paper's fleet-wide analysis seam, and the natural hook for federated learning." |
| 10 | Close | "So: the Guideline Layer is a *policy layer*, not a model — it enforces resource-aware design without touching the underlying predictor, which is the gap the paper identified in the literature." |
| 2 | Run `python run_experiment.py` | "One command runs the whole pipeline: generate a synthetic bus corridor, train three ETA models — a traditional linear baseline, an XGBoost-class model, and a deep network standing in for LSTM/GRU — then replay hundreds of trips with the Guideline Layer running beside each model." |
| 3 | Open `results/latest/report.html` | "The layer outputs two things per inference: the ETA and a resource report. Here the deep model matches the lightweight model's accuracy — 34.8 vs 33.6 s MAE — but breaches the 30% CPU ceiling on the embedded-device model." |
| 4 | Point at `resource_time_series.png` | "This is the Monitoring Engine in action, every inference cycle. Red triangles mark every threshold breach the Threshold Checker caught." |
| 5 | Open `logs/warnings.jsonl` | "The Warning System turns breaches into actionable alerts — 'CPU sustained load too high: consider pruning, reducing inference frequency, or switching to a lighter architecture.' Alerts are deduplicated by cooldown and escalate if they persist." |
| 6 | Point at `cloud/fleet_log.csv` | "The Logging Module syncs lightweight aggregates to the fleet cloud periodically — the paper's fleet-wide analysis seam, and the natural hook for federated learning." |
| 7 | `--quick` variant (optional) | "Everything is configurable — thresholds, device calibration, models — so the layer can be re-tuned per device class, exactly as the paper proposes (smartphone vs ESP32)." |
| 8 | Close | "So: the Guideline Layer is a *policy layer*, not a model — it enforces resource-aware design without touching the underlying predictor, which is the gap the paper identified in the literature." |

**Golden rule:** never let the demo run silently. Every 5 seconds you should be
pointing at an artifact and explaining which module produced it.

## 3. Slide outline (10 slides)

1. **Problem** — ETA models get accurate (MAE ~16–18 s), but nobody reports
   CPU/RAM/battery/bandwidth → prototypes don't deploy. (Your paper's
   Research Gaps, Section V.)
2. **Proposed solution** — the Guideline Layer: 4 modules, closed loop.
   (Paper Fig. 2.)
3. **Architecture diagram** — layer beside the model, never inside it.
   (Paper Fig. 3 / Section VI-C.)
4. **Benchmarks** — the four thresholds, presented as tunable starting points.
   (Paper Section VI-D.)
5. **Implementation map** — one slide table: paper module → file → what it
   does (use the table in `README.md`).
6. **Demo** — live dashboard run (bus + meters + alerts streaming), then the CLI/report for the reproducible numbers.
7. **Results: accuracy** — MAE/RMSE/R² table; lightweight model matches deep.
8. **Results: resources** — CPU/RAM/battery/bandwidth table + violation
   counts; the deep model breaches the CPU ceiling.
9. **The closed loop, shown** — `warnings.jsonl` excerpt + the cooldown /
   escalation behaviour; overhead ~0%.
10. **Future work** — real GPS/GTFS data, PyTorch LSTM, ESP32 profiling,
    quantization/pruning as the layer's own remediation, federated learning.
    (Paper Section VIII.)

## 4. Anticipated examiner questions (with model answers)

**Q: Isn't the CPU number made up?**
A: The *raw* measurements are real — per-inference time, model footprint, and
bytes sent are measured on this machine and logged in `inferences.jsonl`. The
sustained CPU% is then *modelled* for the paper's target hardware (an
embedded-class device), because a laptop's BLAS hides a deep model's true cost.
The model is transparent: MACs per inference × a calibration constant in
`config.py`, the standard FLOPs-based approach in edge-ML literature.

**Q: What does the layer add over just profiling once?**
A: It's continuous and per-inference — it catches drift (a model that gets
slower or hungrier as conditions change), deduplicates alerts via cooldown,
escalates persistent breaches, and logs everything for fleet-wide analysis.
One-off profiling can't do that.

**Q: Does the layer slow down the system?**
A: Measured overhead is negligible (wall time with the layer ON vs OFF), and
the layer never touches the prediction path — it samples OS counters and
appends small JSONL records.

**Q: Why is your deep model not more accurate?**
A: On tabular route features, gradient boosting typically matches or beats
neural nets — that's precisely what ref [12] found in Phnom Penh (XGBoost
beat heavier models). The deep model's cost is in resources, which is exactly
why resource profiling matters: accuracy alone doesn't tell you a model is
deployable.

**Q: What would you need to make the numbers real?**
A: Three things: real GPS/GTFS data (drop-in, the model interface is
`fit`/`predict`), a real embedded device (ESP32/RPi) replacing the modelled
calibration, and a real deep model (PyTorch LSTM) — all listed in the roadmap.

**Q: How is this different from existing monitoring tools (Prometheus, etc.)?**
A: Those monitor servers, not ML-model resource behaviour per inference cycle,
and they don't tie violations to *model-specific remediation* (prune vs
quantize vs frequency). The layer is model-aware and edge-oriented.

## 5. Timeline to the full project (next year)

| Phase | Deliverable | Approx. effort |
|---|---|---|
| PoC hardening | Add unit tests, config validation, `--seed` reproducibility doc | 1–2 weeks |
| Real data | GTFS/GPS feed ingestion replacing `make_data.py` | 2–4 weeks |
| Real deep model | PyTorch LSTM/GRU in the registry + MACs estimator | 2–3 weeks |
| Real hardware | ESP32/RPi profiling, calibrate `config.py` constants | 3–4 weeks |
| Remediation loop | Implement quantization/pruning, re-run to show the loop closes | 3–4 weeks |
| Federated learning | Aggregate per-device logs cloud-side (paper future work) | 4–6 weeks |

## 6. Academic integrity note

The paper's "up to 35%" figure is a literature comparison, not a measured
result of this PoC. Present the PoC as *mechanism demonstration on synthetic
data*, and label all modelled numbers as such. If you want a defensible claim
in the final thesis, re-run the experiment with real data and hardware (Phase
3–4 above) and report those measurements instead — the PoC's calibration
constants exist precisely to be replaced by measured ones.