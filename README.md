# Guideline Layer for ETA Prediction — Local Proof of Concept

A runnable implementation of the **Guideline Layer** proposed in your IEEE paper
*"Guideline Layer for ETA Prediction in Smart Transportation Based on Resource
Awareness"* (source: `corrected.docx` in this folder).

The Guideline Layer is **not** an ETA model. It is a modular layer that runs
*alongside* any ETA model and enforces resource-aware design via four modules
(paper Section VI):

| Paper module                | File                                              | Role |
|-----------------------------|---------------------------------------------------|------|
| Monitoring Engine           | `guideline_layer/monitoring.py`                   | Samples CPU / RAM / battery / bandwidth for every inference cycle |
| Threshold Checker           | `guideline_layer/thresholds.py`                   | Compares usage against the paper's benchmarks (CPU ≤ 30%, RAM ≤ 500 MB, battery ≤ 20%/hr, bandwidth ≤ 1 MB/min) |
| Warning System              | `guideline_layer/warnings.py`                     | Alerts on breaches with remediation hints (prune, quantize, …), cooldown + escalation |
| Logging Module              | `guideline_layer/logging_module.py`               | Lightweight JSONL records + periodic sync to a simulated fleet cloud |
| Closed-loop orchestrator    | `guideline_layer/layer.py`                        | Observe → compare → escalate → log (paper Fig. 2) |

The workflow mirrors paper Section VI-B: GPS/traffic/weather features enter a
prediction model (we ship *linear* = traditional ML, *gradient_boosting* =
XGBoost-class, *mlp* = deep-model stand-in for the LSTM/GRU class), and each
inference cycle is profiled by the layer, which emits both the **ETA
prediction** and a **resource report** (paper: Output Stage).

---

## 1. Setup in VSCode (once)

1. Open this folder in VSCode (`File > Open Folder`).
2. Open a terminal in VSCode (`Ctrl+``) and create a virtual environment:

   ```bash
   python -m venv .venv
   ```

3. Activate it (`Windows PowerShell`: `.venv\Scripts\Activate.ps1`, or in the
   VSCode terminal pick the interpreter via `Ctrl+Shift+P > Python: Select
   Interpreter` → `.venv`).
4. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

   (numpy, pandas, scikit-learn, psutil, matplotlib — no GPU, no PyTorch needed)

## 2. Run the experiment

```bash
python run_experiment.py            # full run (~30 s, ~8,600 stop-observations)
python run_experiment.py --quick    # small run for fast iteration
```

`--quick` uses a tiny dataset and runs only `linear,gradient_boosting` — the
deep model needs the full dataset to train meaningfully (add `--models mlp` to
force it anyway). Use `--quick` to verify plumbing, and the full run for
results you'll present.

Everything lands in `results/latest/`:

- `report.md` — the full analysis (accuracy + resource profiles + violations)
- `report.html` — same story as a single-page gallery with the plots
- `logs/inferences.jsonl` — one profiling record per inference cycle
- `logs/warnings.jsonl` — every alert raised, with remediation hints
- `cloud/fleet_log.csv` — simulated cloud-side fleet aggregation (periodic sync)
- `analysis/summary.csv` — machine-readable summary table
- `plots/` — 4 figures (ETA accuracy, monitoring time series, model
  comparison, violations)

### Live dashboard (FastAPI) — for audiences who don't read tables

There is also an interactive, browser-based simulator that runs the **same
Python pipeline live** and explains each step in plain language:

```bash
python run_dashboard.py            # http://127.0.0.1:8000  (Ctrl+C to stop)
python run_dashboard.py --port 9000
```

Then open the URL. Four tabs:

1. **Learn** — what the Guideline Layer is, the four modules, the paper's
   four limits, and a plain-English glossary (MAE, cooldown, pruning…).
2. **Live run** — press *Start simulation* and watch the real pipeline
   stream: dataset generation → model training → profiling → a bus moving
   stop-by-stop while the layer monitors every prediction. Resource meters,
   module activity, per-trip prediction-vs-reality plot, and a live event
   feed with violations / alerts / cloud syncs.
3. **Results** — accuracy-vs-resources verdict cards, three interactive
   charts (error vs CPU with the 30% ceiling, model scatter, what the layer
   caught), a report table, and a plain-English interpretation you can read
   aloud.
4. **Logs** — the actual files the Logging Module wrote
   (`results/dashboard/logs/*.jsonl`, `cloud/fleet_log.csv`) for the run you
   just watched.

The dashboard runs the simulation in a background thread (same code as the
CLI, `simulation/simulate.py` + `guideline_layer/layer.py`) and streams every
inference over a WebSocket, so the numbers are real, not mocked. Runs write
to `results/dashboard/` and never touch `results/latest/`.

Backend: FastAPI + uvicorn. Frontend: vanilla HTML/CSS/JS + Chart.js from a
CDN (works offline except the charts). Code lives in `dashboard/`.

## 3. What the results show

On the default run (synthetic data, seed 42):

| Model | MAE (s) | CPU% (device) | RAM (MB) | Violations | Alerts |
|---|---|---|---|---|---|
| linear (traditional ML) | ~194 | ~0 | ~0 | 0 | 0 |
| gradient_boosting (XGBoost-class) | ~34 | ~1.5 | 0.72 | 0 | 0 |
| mlp (deep-model stand-in) | ~35 | **~45** | 0.86 | ~1,728 | ~432 |

Reading: the deep model matches the lightweight one on accuracy but breaches
the 30% CPU ceiling on the embedded-device model — the layer detects every
breach and raises cooldown-deduplicated alerts that recommend pruning /
quantization / model swap. This is the paper's core mechanism, demonstrated
end-to-end.

> **Honesty note:** all numbers come from a deterministic simulation on
> synthetic data with a modelled device class (see `guideline_layer/config.py`).
> The PoC demonstrates the *mechanism* (profiling → thresholding → alerting →
> logging) that enables the ~35% resource savings the paper cites from the
> literature; it is not a reproduction of field measurements. Keep this framing
> when you present it.

## 4. Experiment ideas (what to tweak)

| You want to... | Command / knob |
|---|---|
| See more/fewer alerts | `--cpu-threshold 50` or `--cpu-threshold 10` |
| Simulate faster/slower device | `--macs-scale 0.5` (fast) … `3.0` (slow) |
| Change the models | `--models linear,gradient_boosting` |
| Change the data | `--days 60 --trips 20 --seed 7` |
| Tighten bandwidth (trip a bandwidth alert) | edit `gps_payload_bytes` / `log_sync_every` in `guideline_layer/config.py` |
| Lower RAM threshold (trip a RAM alert) | `Thresholds.ram_mb` in `guideline_layer/config.py` |

To *really* break a metric and watch the layer react, try `--cpu-threshold 1`
— every model will violate, and the cooldown/escalation behaviour becomes
visible in `logs/warnings.jsonl`.

## 5. How the resource numbers are computed (read before presenting)

- **RAM** — real: serialized size of the trained model (MB), plus process RSS
  in every log record.
- **Inference time / CPU ms** — real, measured on this laptop (per-inference
  burst timing).
- **CPU% (device)** — *modelled*: sustained load on the paper's target
  embedded-class device, estimated from the model's per-inference compute
  (MACs) via `models/eta_models.estimate_macs()` and a calibration constant
  (`cpu_macs_scale`). A laptop's BLAS makes a matrix multiply microseconds
  fast, which would hide the deep model's true on-device cost; the MACs proxy
  is the standard way edge-ML papers compare model cost.
- **Battery** — modelled linearly from CPU load (idle 3%/hr → full load
  25%/hr), or the physical battery if one exists.
- **Bandwidth** — real bytes: GPS + feature payloads per inference plus
  periodic cloud sync, converted to KB/min over simulated time.

All raw measured values are kept in `logs/inferences.jsonl` next to the
modelled ones, so nothing is hidden.

## 6. Project layout

```
run_experiment.py            entry point (data → train → simulate → analyze → report)
run_dashboard.py             launches the live FastAPI dashboard (see §2)
dashboard/                   FastAPI app: engine (worker thread) + main.py + static UI
data/make_data.py            synthetic bus corridor: traffic, weather, dwell, ground truth
models/eta_models.py         pluggable ETA models + MACs estimator
guideline_layer/             the four paper modules + orchestrator + config
simulation/simulate.py       stop-by-stop trip replay with the layer ON/OFF
analysis/                    summaries, plots, markdown + HTML reports
docs/POC_PRESENTATION.md     how to present this as your final-year PoC
results/latest/              generated outputs (CLI runs)
results/dashboard/           log files written by live dashboard runs
```

## 7. Roadmap to a full final-year project

1. **Real data** — replace `data/make_data.py` with actual GTFS / GPS feeds
   (e.g., a city's public transport open data); the rest of the pipeline is
   unchanged because the model interface is `fit(X, y)` / `predict(X)`.
2. **A real deep model** — drop a PyTorch LSTM/GRU into `MODEL_REGISTRY`
   (interface is identical) and extend `estimate_macs` for it.
3. **Real hardware** — profile an ESP32 or Raspberry Pi running the model
   (paper's target hardware); the calibration constants in `config.py` are
   designed for exactly this.
4. **Quantization/pruning** — apply the remediation the Warning System
   suggests (e.g., `torch.quantization` / `sklearn` + int8) and re-run to show
   the closed loop actually reduces measured resources.
5. **Federated learning** — the logging module's periodic cloud sync is the
   natural seam for a federated aggregation step (paper future work).

See `docs/POC_PRESENTATION.md` for the demo script and slide outline.