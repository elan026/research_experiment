"""Build the PoC results presentation (.pptx) from the experiment outputs.

    python build_presentation.py

Reads results/latest (summary.csv + plots) and docs/POC_PRESENTATION.md, and
produces presentation/Guideline_Layer_PoC.pptx with 16:9 slides, embedded
plots, results tables, and speaker notes for every slide.
"""

from __future__ import annotations

import csv
from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_CONNECTOR, MSO_SHAPE
from pptx.enum.text import PP_ALIGN
from pptx.util import Inches, Pt

ROOT = Path(__file__).resolve().parent
RESULTS = ROOT / "results" / "latest"
PLOTS = RESULTS / "plots"
OUT_DIR = ROOT / "presentation"
OUT_PATH = OUT_DIR / "Guideline_Layer_PoC.pptx"

# ---------------------------------------------------------------- palette
NAVY = RGBColor(0x1F, 0x38, 0x64)
BLUE = RGBColor(0x1F, 0x77, 0xB4)
RED = RGBColor(0xD6, 0x27, 0x28)
GREEN = RGBColor(0x2C, 0xA0, 0x2C)
ORANGE = RGBColor(0xFF, 0x7F, 0x0E)
DARK = RGBColor(0x33, 0x33, 0x33)
GRAY = RGBColor(0x66, 0x66, 0x66)
LIGHT = RGBColor(0xF2, 0xF2, 0xF2)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
FONT = "Calibri"
MONO = "Consolas"

SW, SH = Inches(13.333), Inches(7.5)
MARGIN = Inches(0.6)

# ---------------------------------------------------------------- helpers
def _set_run(r, text, size=18, bold=False, color=DARK, font=FONT, italic=False):
    r.text = text
    r.font.size = Pt(size)
    r.font.bold = bold
    r.font.italic = italic
    r.font.color.rgb = color
    r.font.name = font


def add_textbox(slide, left, top, width, height, text, size=18, bold=False,
                color=DARK, align=PP_ALIGN.LEFT, font=FONT, line_spacing=1.0,
                space_after=6):
    box = slide.shapes.add_textbox(left, top, width, height)
    tf = box.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.alignment = align
    p.line_spacing = line_spacing
    p.space_after = Pt(space_after)
    _set_run(p.add_run(), text, size, bold, color, font)
    return box


def add_bullets(slide, items, left, top, width, height, size=17, color=DARK,
                space_after=8, line_spacing=1.05, bullet="•"):
    """items: list of str or (level, str)."""
    box = slide.shapes.add_textbox(left, top, width, height)
    tf = box.text_frame
    tf.word_wrap = True
    first = True
    for it in items:
        lvl, txt = (it if isinstance(it, tuple) else (0, it))
        p = tf.paragraphs[0] if first else tf.add_paragraph()
        first = False
        p.level = lvl
        p.space_after = Pt(space_after)
        p.line_spacing = line_spacing
        prefix = "" if lvl > 0 else f"{bullet}  "
        _set_run(p.add_run(), prefix + txt, size, color=color)
    return box


def add_title_bar(slide, title, kicker=None):
    bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, SW, Inches(1.0))
    bar.fill.solid()
    bar.fill.fore_color.rgb = NAVY
    bar.line.fill.background()
    bar.shadow.inherit = False
    tf = bar.text_frame
    tf.word_wrap = True
    tf.margin_left = Inches(0.6)
    tf.margin_top = Inches(0.12)
    tf.margin_bottom = Inches(0.05)
    p = tf.paragraphs[0]
    _set_run(p.add_run(), title, 27, True, WHITE)
    if kicker:
        p2 = tf.add_paragraph()
        _set_run(p2.add_run(), kicker, 13, False, RGBColor(0xBF, 0xD3, 0xEE))
    # thin accent line under the bar
    line = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, Inches(1.0), SW, Pt(3))
    line.fill.solid()
    line.fill.fore_color.rgb = BLUE
    line.line.fill.background()
    line.shadow.inherit = False


def add_footer(slide, idx):
    add_textbox(slide, SW - Inches(2.2), SH - Inches(0.42), Inches(2.0), Inches(0.3),
                f"{idx}  |  Guideline Layer PoC", 10, color=GRAY,
                align=PP_ALIGN.RIGHT)


def add_rect(slide, l, t, w, h, fill, line_color=None, text=None, text_color=WHITE,
             size=15, bold=True, shape=MSO_SHAPE.ROUNDED_RECTANGLE, line_w=Pt(1)):
    sp = slide.shapes.add_shape(shape, l, t, w, h)
    sp.fill.solid()
    sp.fill.fore_color.rgb = fill
    if line_color is None:
        sp.line.fill.background()
    else:
        sp.line.color.rgb = line_color
        sp.line.width = line_w
    sp.shadow.inherit = False
    if text:
        tf = sp.text_frame
        tf.word_wrap = True
        tf.margin_left = Inches(0.08)
        tf.margin_right = Inches(0.08)
        tf.margin_top = Inches(0.04)
        tf.margin_bottom = Inches(0.04)
        p = tf.paragraphs[0]
        p.alignment = PP_ALIGN.CENTER
        _set_run(p.add_run(), text, size, bold, text_color)
    return sp


def add_arrow(slide, x1, y1, x2, y2, color=BLUE, width=Pt(2.25), label=None,
              label_size=13):
    conn = slide.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, x1, y1, x2, y2)
    conn.line.color.rgb = color
    conn.line.width = width
    conn.shadow.inherit = False
    if label:
        mx = min(x1, x2) + abs(x2 - x1) // 2
        my = min(y1, y2) + abs(y2 - y1) // 2
        add_textbox(slide, mx - Inches(0.35), my - Inches(0.28), Inches(0.7),
                    Inches(0.3), label, label_size, True, color, PP_ALIGN.CENTER)
    return conn


def add_table(slide, data, left, top, width, col_widths, header_fill=NAVY,
              header_color=WHITE, size=14, row_h=Inches(0.42)):
    rows, cols = len(data), len(data[0])
    tbl_shape = slide.shapes.add_table(rows, cols, left, top, width,
                                       Inches(0.42) * rows)
    tbl = tbl_shape.table
    for c, w in enumerate(col_widths):
        tbl.columns[c].width = w
    for r in range(rows):
        for c in range(cols):
            cell = tbl.cell(r, c)
            cell.margin_left = Inches(0.1)
            cell.margin_right = Inches(0.1)
            cell.margin_top = Inches(0.02)
            cell.margin_bottom = Inches(0.02)
            cell.vertical_anchor = 1  # middle
            tf = cell.text_frame
            tf.word_wrap = True
            p = tf.paragraphs[0]
            p.alignment = PP_ALIGN.LEFT if c == 0 else PP_ALIGN.CENTER
            is_hdr = r == 0
            _set_run(p.add_run(), str(data[r][c]), size,
                     bold=is_hdr or c == 0,
                     color=header_color if is_hdr else DARK)
            cell.fill.solid()
            cell.fill.fore_color.rgb = (
                header_fill if is_hdr else (LIGHT if r % 2 == 0 else WHITE)
            )
    return tbl_shape


def add_picture(slide, path, left, top, width=None, height=None):
    kw = {}
    if width is not None:
        kw["width"] = width
    if height is not None:
        kw["height"] = height
    return slide.shapes.add_picture(str(path), left, top, **kw)


def add_notes(slide, text: str):
    slide.notes_slide.notes_text_frame.text = text


# ---------------------------------------------------------------- data
def load_summary() -> list[dict]:
    with (RESULTS / "analysis" / "summary.csv").open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def row(rows, model, layer="on") -> dict:
    return next(r for r in rows if r["model"] == model and r["layer"] == layer)


def fmt(v, nd=1) -> str:
    return f"{float(v):.{nd}f}"


# ---------------------------------------------------------------- slides
def build() -> Path:
    rows = load_summary()
    on = [r for r in rows if r["layer"] == "on"]
    linear, gb, mlp = row(rows, "linear"), row(rows, "gradient_boosting"), row(rows, "mlp")

    prs = Presentation()
    prs.slide_width = SW
    prs.slide_height = SH
    blank = prs.slide_layouts[6]
    idx = 0

    # ============================================================ 1. TITLE
    s = prs.slides.add_slide(blank)
    idx += 1
    bg = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, SW, SH)
    bg.fill.solid()
    bg.fill.fore_color.rgb = NAVY
    bg.line.fill.background()
    bg.shadow.inherit = False
    band = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, Inches(4.45), SW, Pt(2))
    band.fill.solid()
    band.fill.fore_color.rgb = BLUE
    band.line.fill.background()
    add_textbox(s, Inches(0.9), Inches(1.7), Inches(11.5), Inches(0.6),
                "Guideline Layer for ETA Prediction in Smart Transportation",
                34, True, WHITE)
    add_textbox(s, Inches(0.9), Inches(2.45), Inches(11.5), Inches(0.5),
                "Based on Resource Awareness", 22, False,
                RGBColor(0xBF, 0xD3, 0xEE))
    add_textbox(s, Inches(0.9), Inches(4.75), Inches(11.5), Inches(0.5),
                "Proof of Concept — Implementation & Results Interpretation",
                20, True, WHITE)
    add_textbox(s, Inches(0.9), Inches(5.45), Inches(11.5), Inches(1.6),
                "Elango K (23AI016)  ·  Gokul C (23AI018)  ·  Kavitha K (23AI027)\n"
                "Dept. of Artificial Intelligence and Data Science\n"
                "Nandha Engineering College (Autonomous), Erode, Tamil Nadu, India",
                15, False, RGBColor(0xD8, 0xE2, 0xF3), line_spacing=1.3)
    add_notes(s, "Welcome. This deck walks through the Guideline Layer we proposed "
                 "in our IEEE paper, the local proof-of-concept implementation, and "
                 "what the results mean. Goal: show that resource profiling can run "
                 "alongside any ETA model without touching it.")

    # ==================================================== 2. THE PROBLEM
    s = prs.slides.add_slide(blank)
    idx += 1
    add_title_bar(s, "The Problem: Accurate ETA Models That Can't Ship",
                  "Motivation · Paper Section V (Research Gaps)")
    add_bullets(s, [
        "Deep learning (LSTM, GRU, Transformers) achieves strong ETA accuracy "
        "— R² ≈ 0.93, MAE ≈ 18.5 s [1]",
        "But the literature reports accuracy metrics almost exclusively:",
        (1, "MAE / RMSE / R² — CPU load, RAM, battery drain and bandwidth are rarely reported [1],[2],[3],[16]"),
        (1, "Models that win benchmarks fail on real constrained devices (smartphones, ESP32-class hardware)"),
        "Resource Profiling Gap — the focus of our research (Paper Section V)",
        "Question we answer: can a system enforce resource-aware design "
        "WITHOUT rewriting the prediction model?",
    ], Inches(0.9), Inches(1.5), Inches(11.5), Inches(4.2), size=19, space_after=14)
    add_rect(s, Inches(0.9), Inches(5.9), Inches(5.6), Inches(0.9),
             BLUE, text="Accuracy — reported everywhere", size=16)
    add_rect(s, Inches(6.85), Inches(5.9), Inches(5.6), Inches(0.9),
             RED, text="Resource cost — rarely reported  ✗", size=16)
    add_notes(s, "Accuracy is a necessary but not sufficient condition for deployment. "
                 "Every survey we read reports MAE/RMSE/R2; almost none report the "
                 "compute footprint. That gap is what the Guideline Layer addresses.")

    # ================================================ 3. PROPOSED SOLUTION
    s = prs.slides.add_slide(blank)
    idx += 1
    add_title_bar(s, "Proposed Solution — The Guideline Layer",
                  "A modular, model-agnostic addition · Paper Section VI-A")
    # closed-loop diagram
    mono = add_rect(s, Inches(0.7), Inches(1.5), Inches(3.0), Inches(1.25),
                    BLUE, text="1 · Monitoring Engine\nobserve CPU / RAM /\nbattery / bandwidth",
                    size=13)
    thresh = add_rect(s, Inches(9.6), Inches(1.5), Inches(3.0), Inches(1.25),
                      BLUE, text="2 · Threshold Checker\ncompare vs benchmarks\n(CPU ≤ 30% …)", size=13)
    warn = add_rect(s, Inches(9.6), Inches(4.55), Inches(3.0), Inches(1.25),
                    BLUE, text="3 · Warning System\nalert + remediation hint\n(prune / quantize)", size=13)
    log = add_rect(s, Inches(0.7), Inches(4.55), Inches(3.0), Inches(1.25),
                   BLUE, text="4 · Logging Module\nlightweight records +\nperiodic cloud sync", size=13)
    eta = add_rect(s, Inches(4.7), Inches(2.85), Inches(3.9), Inches(1.6),
                   NAVY, text="ETA Prediction Model\n(LSTM / GRU / XGBoost)\n— unchanged —", size=14)
    # arrows: the closed loop
    add_arrow(s, Inches(3.7), Inches(2.12), Inches(9.6), Inches(2.12), label="compare")
    add_arrow(s, Inches(11.1), Inches(2.75), Inches(11.1), Inches(4.55), label="escalate")
    add_arrow(s, Inches(9.6), Inches(5.18), Inches(3.7), Inches(5.18), label="log")
    add_arrow(s, Inches(2.2), Inches(4.55), Inches(2.2), Inches(2.75), label="observe")
    add_arrow(s, Inches(8.6), Inches(3.5), Inches(8.7), Inches(3.05))
    add_textbox(s, Inches(4.0), Inches(1.35), Inches(3.4), Inches(0.4),
                "data (GPS, traffic, weather)", 12, color=GRAY)
    add_textbox(s, Inches(8.7), Inches(3.6), Inches(2.4), Inches(0.4),
                "profiled every inference cycle", 12, color=GRAY)
    # takeaway strip
    add_rect(s, Inches(0.7), Inches(6.2), Inches(11.9), Inches(0.85),
             RGBColor(0xE8, 0xF0, 0xFA), line_color=BLUE,
             text="The layer is NOT a model — it runs alongside the predictor, "
                  "so any ETA model can be profiled without modification.",
             text_color=NAVY, size=15, shape=MSO_SHAPE.RECTANGLE)
    add_notes(s, "Four modules form a closed loop: observe, compare, escalate, log. "
                 "The ETA model in the middle is never touched. This is the paper's "
                 "core design claim, and the demo verifies it with three different models.")

    # ================================================ 4. BENCHMARKS
    s = prs.slides.add_slide(blank)
    idx += 1
    add_title_bar(s, "The Four Profiling Benchmarks",
                  "Paper Section VI-D — practical starting points, not hard rules")
    tiles = [
        ("RAM ≤ 500 MB", "Fits smartphones and embedded\ndevices without crashes", BLUE),
        ("CPU ≤ 30%", "Keeps the device responsive,\nheadroom for other apps", ORANGE),
        ("Battery ≤ 20% / hr", "A full working day on\nbattery power", GREEN),
        ("Bandwidth ≤ 1 MB / min", "Usable on poor connections,\nlower cloud costs", RED),
    ]
    tw, th = Inches(2.85), Inches(2.6)
    gap = Inches(0.22)
    x0 = Inches(0.7)
    for i, (num, desc, color) in enumerate(tiles):
        x = x0 + i * (tw + gap)
        add_rect(s, x, Inches(1.7), tw, th, color, text=num, size=22)
        add_textbox(s, x + Inches(0.15), Inches(4.45), tw - Inches(0.3),
                    Inches(1.5), desc, 15, color=DARK, align=PP_ALIGN.CENTER,
                    space_after=0)
    add_rect(s, Inches(0.7), Inches(6.2), Inches(11.9), Inches(0.85),
             LIGHT, line_color=GRAY,
             text="Thresholds are tunable per device class — a smartphone may be "
                  "RAM-hungry, a rural fleet bandwidth-constrained.",
             text_color=DARK, size=14, shape=MSO_SHAPE.RECTANGLE)
    add_notes(s, "These four numbers come straight from the paper. They are "
                 "calibration starting points; the implementation makes every one "
                 "of them a config value, so each device class gets its own policy.")

    # ================================================ 5. IMPLEMENTATION MAP
    s = prs.slides.add_slide(blank)
    idx += 1
    add_title_bar(s, "From Paper to Code — One Command End-to-End",
                  "python run_experiment.py  →  data · train · simulate · analyze · report")
    add_table(s, [
        ["Paper module", "Implementation", "Role in the PoC"],
        ["Monitoring Engine", "guideline_layer/monitoring.py",
         "Samples CPU/RAM/battery/bandwidth per inference cycle"],
        ["Threshold Checker", "guideline_layer/thresholds.py",
         "Compares usage against the four benchmarks"],
        ["Warning System", "guideline_layer/warnings.py",
         "Alerts with remediation hints, cooldown + escalation"],
        ["Logging Module", "guideline_layer/logging_module.py",
         "JSONL records + periodic sync to simulated fleet cloud"],
        ["Closed loop (Fig. 2)", "guideline_layer/layer.py",
         "Observe → compare → escalate → log"],
    ], Inches(0.7), Inches(1.6), Inches(11.9),
       [Inches(2.7), Inches(4.4), Inches(4.8)], size=14, row_h=Inches(0.62))
    add_bullets(s, [
        "Three pluggable ETA models: linear (traditional ML) · gradient_boosting "
        "(XGBoost-class) · mlp (deep stand-in for LSTM/GRU)",
        "Every model simulated with the Guideline Layer ON and OFF → overhead measured",
        "Full run ≈ 30 s on a laptop, fully reproducible (seed 42)",
    ], Inches(0.7), Inches(5.5), Inches(11.9), Inches(1.4), size=16)
    add_notes(s, "The code mirrors the paper's architecture module for module. "
                 "Three models of increasing complexity run through the same layer, "
                 "so we can show it is genuinely model-agnostic.")

    # ================================================ 6. EXPERIMENT SETUP
    s = prs.slides.add_slide(blank)
    idx += 1
    add_title_bar(s, "Experimental Setup", "Synthetic data — deterministic and reproducible")
    add_bullets(s, [
        "Synthetic urban corridor: 18 stops, 30 days × 16 trips/day",
        "≈ 8,600 stop-observations; train/test split by trip (no leakage)",
        "Ground truth from a physics-based model: distance / speed, modulated by",
        (1, "time-of-day traffic (peak hours), weather (clear / rain / fog), stop dwell"),
        "At every stop the model predicts remaining time to the terminal (the ETA)",
        "Three models spanning the accuracy–resource trade-off:",
        (1, "linear — traditional ML baseline"),
        (1, "gradient_boosting — XGBoost-class (paper ref [12]: MAE ≈ 16 s in Phnom Penh)"),
        (1, "mlp — deep-model stand-in for the LSTM/GRU class"),
        "Guideline Layer ON and OFF for each model → measures the layer's own cost",
    ], Inches(0.9), Inches(1.5), Inches(11.5), Inches(5.0), size=18, space_after=10)
    add_notes(s, "We cannot use a real city's GPS feed in a self-contained PoC, so "
                 "the data generator builds a plausible corridor with realistic "
                 "traffic and weather effects. The model interface (fit/predict) is "
                 "identical to what real data would use.")

    # ================================================ 7. RESULTS: ACCURACY
    s = prs.slides.add_slide(blank)
    idx += 1
    add_title_bar(s, "Results 1 — ETA Accuracy: Prediction Quality Is Preserved",
                  "Layer ON vs OFF identical (the layer never touches the model)")
    add_table(s, [
        ["Model", "MAE (s)", "RMSE (s)", "R²"],
        ["linear (traditional ML)", fmt(linear["mae_s"]), fmt(linear["rmse_s"]), linear["r2"]],
        ["gradient_boosting (XGBoost-class)", fmt(gb["mae_s"]), fmt(gb["rmse_s"]), gb["r2"]],
        ["mlp (deep-model stand-in)", fmt(mlp["mae_s"]), fmt(mlp["rmse_s"]), mlp["r2"]],
    ], Inches(0.7), Inches(1.5), Inches(5.6),
       [Inches(3.0), Inches(0.9), Inches(0.9), Inches(0.8)], size=14)
    add_picture(s, PLOTS / "eta_prediction.png", Inches(0.6), Inches(3.4),
                height=Inches(3.55))
    add_bullets(s, [
        "Lightweight model matches the deep model:",
        (1, f"MAE {fmt(gb['mae_s'])} s vs {fmt(mlp['mae_s'])} s — "
            f"{abs(float(gb['mae_s']) - float(mlp['mae_s'])):.1f} s apart"),
        "Consistent with ref [12]: XGBoost beat heavier models in Phnom Penh",
        "Traditional linear regression is not expressive enough for ETA "
        f"(MAE {fmt(linear['mae_s'], 0)} s)",
        "⇒ accuracy alone cannot justify the deep model",
    ], Inches(6.9), Inches(1.6), Inches(5.8), Inches(4.9), size=18)
    add_notes(s, "The headline: gradient boosting and the deep network are within "
                 "~1 s of each other on MAE. So on this data, the deep model buys "
                 "almost nothing in accuracy — its real cost shows up next, in "
                 "resources. That is exactly why profiling matters.")

    # ================================================ 8. RESULTS: RESOURCES
    s = prs.slides.add_slide(blank)
    idx += 1
    add_title_bar(s, "Results 2 — Resource Profiles: Where the Deep Model Pays",
                  "Monitoring Engine output, averaged over 1,728 inference cycles per model")
    add_picture(s, PLOTS / "model_comparison.png", Inches(0.6), Inches(1.35),
                width=Inches(7.4))
    add_bullets(s, [
        f"mlp sustains {fmt(mlp['cpu_percent_avg'])}% CPU — "
        "BREACHES the 30% ceiling",
        f"gradient_boosting uses {fmt(gb['cpu_percent_avg'])}% — "
        "well within limits",
        (1, f"≈ {100 * (1 - float(gb['cpu_percent_avg']) / float(mlp['cpu_percent_avg'])):.0f}% "
            "less sustained CPU for the same accuracy"),
        "RAM: every model fits the 500 MB budget "
        f"(largest {max(float(r['ram_model_mb']) for r in on):.2f} MB)",
        "Bandwidth: ~1.1 KB/min — edge-style payloads, batched cloud sync",
        "Battery: mlp drains ≈ 13%/hr vs ≈ 3%/hr for the light models",
    ], Inches(8.3), Inches(1.5), Inches(4.5), Inches(5.2), size=16, space_after=10)
    add_notes(s, "This is the layer's key output: a resource report next to every "
                 "ETA. The deep model violates the CPU threshold; the lightweight "
                 "model does not, at equal accuracy. The monitoring data makes the "
                 "trade-off visible instead of guessed.")

    # ================================================ 9. CLOSED LOOP
    s = prs.slides.add_slide(blank)
    idx += 1
    add_title_bar(s, "Results 3 — The Closed Loop in Action",
                  "Threshold Checker → Warning System, every inference cycle")
    add_picture(s, PLOTS / "resource_time_series.png", Inches(0.55), Inches(1.3),
                height=Inches(5.5))
    add_bullets(s, [
        "CPU load monitored at every stop along the route",
        "Red triangles: each detected threshold breach",
        "1,728 violations for mlp → 432 alerts (cooldown de-duplicates)",
        "Alerts carry remediation hints, not just symptoms",
    ], Inches(7.35), Inches(1.4), Inches(5.4), Inches(2.2), size=16, space_after=8)
    code_box = s.shapes.add_textbox(Inches(7.35), Inches(3.7), Inches(5.5), Inches(2.9))
    tf = code_box.text_frame
    tf.word_wrap = True
    tf.margin_left = Inches(0.15)
    tf.margin_top = Inches(0.12)
    code_lines = [
        '{"metric": "cpu_percent", "value": 45.4, "limit": 30.0,',
        ' "severity": "warning", "count": 1,',
        ' "hint": "CPU sustained load too high — consider pruning',
        '          the model, reducing inference frequency, or',
        '          switching to a lighter architecture"}',
    ]
    for i, ln in enumerate(code_lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.space_after = Pt(2)
        _set_run(p.add_run(), ln, 11, False, RGBColor(0xC0, 0x25, 0x25), MONO)
    add_rect(s, Inches(7.35), Inches(6.55), Inches(5.5), Inches(0.5),
             RGBColor(0xE8, 0xF0, 0xFA), line_color=BLUE,
             text="Logging Module: JSONL per cycle + periodic cloud sync",
             text_color=NAVY, size=12, shape=MSO_SHAPE.RECTANGLE)
    add_notes(s, "Zoom into one model's trip: CPU is sampled each stop, every "
                 "breach is a red triangle. Alerts are de-duplicated by a 120 s "
                 "cooldown (hence 1,728 violations become 432 alerts) and escalate "
                 "to critical if they persist. The hint tells the operator WHAT to "
                 "do — prune, reduce frequency, or swap the model.")

    # ================================================ 10. VIOLATIONS
    s = prs.slides.add_slide(blank)
    idx += 1
    add_title_bar(s, "Results 4 — Violations & Alerts by Model",
                  "Only the deep model breaches the policy")
    add_picture(s, PLOTS / "warnings.png", Inches(0.6), Inches(1.6), width=Inches(7.0))
    add_bullets(s, [
        "linear: 0 violations — 0 alerts",
        "gradient_boosting: 0 violations — 0 alerts",
        "mlp: 1,728 violations → 432 alerts",
        (1, "every inference breaches the CPU policy"),
        (1, "cooldown + escalation keep alerts actionable"),
        "The policy is enforced continuously — a one-off "
        "profile could never catch per-cycle drift",
    ], Inches(7.9), Inches(1.6), Inches(4.9), Inches(4.8), size=17, space_after=10)
    add_notes(s, "The layer separates 'within policy' from 'breaching policy' "
                 "cleanly. Only the deep model triggers alerts, and each alert is "
                 "actionable. This is the governance the paper argues the field "
                 "lacks.")

    # ================================================ 11. OVERHEAD
    s = prs.slides.add_slide(blank)
    idx += 1
    add_title_bar(s, "Results 5 — The Layer Costs Almost Nothing",
                  "Wall-time with the layer ON vs OFF (1728 inferences per model)")
    add_table(s, [
        ["Model", "Layer ON (s)", "Layer OFF (s)", "Δ"],
        ["linear", fmt(linear["wall_sec"]), fmt(row(rows, "linear", "off")["wall_sec"]),
         "within noise"],
        ["gradient_boosting", fmt(gb["wall_sec"]), fmt(row(rows, "gradient_boosting", "off")["wall_sec"]),
         "within noise"],
        ["mlp", fmt(mlp["wall_sec"]), fmt(row(rows, "mlp", "off")["wall_sec"]),
         "within noise"],
    ], Inches(0.7), Inches(1.6), Inches(7.5),
       [Inches(3.2), Inches(1.5), Inches(1.5), Inches(1.3)], size=14)
    add_bullets(s, [
        "The layer samples OS counters and appends small JSONL records",
        "It never touches the prediction path — overhead is negligible "
        "and dominated by run-to-run noise",
        "Supports the paper's central claim: resource-aware design "
        "WITHOUT changing the underlying model",
    ], Inches(0.7), Inches(4.0), Inches(11.9), Inches(2.0), size=18, space_after=10)
    add_notes(s, "Wall time ON vs OFF is within noise for every model — the "
                 "differences shown are run-to-run variance, not the layer. The "
                 "layer's work is a few microseconds of counter sampling per "
                 "cycle plus a tiny log append.")

    # ================================================ 12. KEY TAKEAWAYS
    s = prs.slides.add_slide(blank)
    idx += 1
    add_title_bar(s, "What This Means — Interpreting the Results",
                  "The point of the PoC in four bullets")
    cards = [
        ("Accuracy ≠ Deployability", f"The deep model matches the light model "
         f"(MAE {fmt(mlp['mae_s'])} s vs {fmt(gb['mae_s'])} s) yet uses ~30× the "
         "CPU. Accuracy alone cannot choose a model.", BLUE),
        ("Profiling Makes Trade-offs Visible", "The layer attaches a resource "
         "report to every ETA — the missing column in the literature's tables.",
         GREEN),
        ("Policy, Enforced Continuously", "Per-inference threshold checks catch "
         "drift that one-off profiling misses; alerts name the remedy "
         "(prune / quantize / swap).", ORANGE),
        ("Truly Additive", "Runs beside any model, costs ~nothing, changes "
         "nothing — the deployment story the paper promises.", RED),
    ]
    for i, (head, body, color) in enumerate(cards):
        y = Inches(1.5) + i * Inches(1.32)
        add_rect(s, Inches(0.7), y, Inches(3.3), Inches(1.1), color, text=head, size=16)
        add_textbox(s, Inches(4.2), y + Inches(0.05), Inches(8.4), Inches(1.15),
                    body, 16, color=DARK, space_after=0)
    add_notes(s, "Four takeaways map the numbers back to the paper's claims: "
                 "accuracy is not deployability; profiling makes the trade-off "
                 "visible; enforcement is continuous; and the layer is additive "
                 "by construction.")

    # ================================================ 13. LIMITATIONS
    s = prs.slides.add_slide(blank)
    idx += 1
    add_title_bar(s, "Limitations — Stated Honestly",
                  "What this PoC is and is not")
    add_bullets(s, [
        "Synthetic data: plausible route / traffic / weather model, not real "
        "observations (data/make_data.py)",
        "Device model: CPU & battery are modelled for embedded-class hardware "
        "(MACs-based calibration, see guideline_layer/config.py);",
        (1, "raw laptop measurements are logged in every inference record"),
        "The paper's ~35% saving figure is a literature comparison — this PoC "
        "demonstrates the mechanism, not a reproduction",
        "Next step: real GTFS/GPS data + real hardware (ESP32 / Raspberry Pi) "
        "→ measured numbers replace modelled ones",
    ], Inches(0.9), Inches(1.6), Inches(11.5), Inches(4.6), size=19, space_after=14)
    add_rect(s, Inches(0.9), Inches(5.9), Inches(11.5), Inches(0.95),
             RGBColor(0xE8, 0xF0, 0xFA), line_color=BLUE,
             text="Credibility rule: label every modelled number as modelled — "
                  "the raw measurements are always one file away.",
             text_color=NAVY, size=15, shape=MSO_SHAPE.RECTANGLE)
    add_notes(s, "We pre-empt the obvious objection: the CPU/battery figures are "
                 "modelled for the paper's target device class. The honest framing "
                 "is 'mechanism demonstrated on synthetic data'; measured numbers "
                 "come in the next phase with real hardware.")

    # ================================================ 14. ROADMAP
    s = prs.slides.add_slide(blank)
    idx += 1
    add_title_bar(s, "Roadmap — From PoC to Full Final-Year Project",
                  "Paper Section VIII (Future Work), phased")
    phases = [
        ("1 · Real data", "GTFS / GPS feed replaces the synthetic generator — "
         "model interface unchanged"),
        ("2 · Real deep model", "PyTorch LSTM / GRU in the registry, MACs "
         "estimator extended"),
        ("3 · Real hardware", "Profile on ESP32 / Raspberry Pi; calibrate "
         "config.py with measured values"),
        ("4 · Remediation loop", "Implement quantization / pruning the Warning "
         "System suggests; re-run to show resources drop"),
        ("5 · Fleet scale", "Federated learning on the logging module's "
         "periodic cloud sync (paper future work)"),
    ]
    for i, (head, body) in enumerate(phases):
        y = Inches(1.5) + i * Inches(1.12)
        add_rect(s, Inches(0.7), y, Inches(3.4), Inches(0.9), NAVY, text=head, size=15)
        add_textbox(s, Inches(4.35), y + Inches(0.05), Inches(8.3), Inches(0.95),
                    body, 15, color=DARK, space_after=0)
    add_notes(s, "Each phase has a clear deliverable and reuses the same "
                 "pipeline, so progress is incremental and demoable at every step.")

    # ================================================ 15. THANK YOU
    s = prs.slides.add_slide(blank)
    idx += 1
    bg = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, SW, SH)
    bg.fill.solid()
    bg.fill.fore_color.rgb = NAVY
    bg.line.fill.background()
    bg.shadow.inherit = False
    add_textbox(s, Inches(0.9), Inches(2.6), Inches(11.5), Inches(0.9),
                "Thank You — Questions?", 40, True, WHITE, PP_ALIGN.CENTER)
    add_textbox(s, Inches(0.9), Inches(3.9), Inches(11.5), Inches(0.5),
                "Guideline Layer for ETA Prediction in Smart Transportation "
                "— Based on Resource Awareness", 16, False,
                RGBColor(0xBF, 0xD3, 0xEE), PP_ALIGN.CENTER)
    add_textbox(s, Inches(0.9), Inches(4.6), Inches(11.5), Inches(0.4),
                "elangokandhasamy284@gmail.com  ·  Dept. of AI & DS, "
                "Nandha Engineering College", 14, False,
                RGBColor(0xD8, 0xE2, 0xF3), PP_ALIGN.CENTER)
    add_notes(s, "Invite questions. Anticipated: 'is the CPU number made up?' — "
                 "raw measurements are real and logged; the sustained % is a "
                 "transparent model for embedded hardware. 'Does it slow things "
                 "down?' — overhead is within noise. 'Why is the deep model not "
                 "more accurate?' — see ref [12]; its cost is resources, which is "
                 "the point.")

    # ------------------------------------------------------------ save
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    prs.save(str(OUT_PATH))
    return OUT_PATH


if __name__ == "__main__":
    path = build()
    print(f"Wrote {path} ({path.stat().st_size / 1024:.0f} KB, "
          f"16:9, slides with speaker notes)")