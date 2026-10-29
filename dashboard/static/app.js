/* Guideline Layer Live Simulator — client logic (vanilla JS, no framework).
 * State comes from two places:
 *   - the WebSocket: a continuous stream of {events, lite} messages; `lite` is
 *     the authoritative counter snapshot so we never double-count after a
 *     reconnect, `events` drive the feed / narrator / route animation.
 *   - /api/state (full snapshot incl. time series) for the Results tab.
 */
"use strict";

/* ------------------------------------------------------------- helpers */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
/* light markdown: **bold** only */
function fmt(s) {
  const e = esc(s);
  return e.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
}
const now = () => new Date().toLocaleTimeString("en-GB");
const f1 = (x, d = 1) => (x === null || x === undefined || isNaN(x) ? "—" : Number(x).toFixed(d));
const f0 = (x) => (x === null || x === undefined || isNaN(x) ? "—" : Math.round(x).toLocaleString());

/* ----------------------------------------------------------- app state */
const S = {
  lite: null,            // authoritative counters from the server
  registry: [],          // models the backend can run
  presets: {},
  preset: "real",
  modelsOn: new Set(),
  running: false,
  lastModel: null,       // most recently streamed model
  trips: {},             // model -> current trip visuals {trip_id, stops, trip_index, trips_total, preds, acts}
  feed: [],              // {cls, html, raw}
  feedFilter: "all",
  logTab: "inferences",
  charts: [],
};

const THR_KEYS = ["cpu_percent", "ram_mb", "battery_drain_pct_hr", "bandwidth_kb_per_min"];
const METRIC_META = {
  cpu_percent:               { short: "CPU",      unit: "%",        full: "CPU load" },
  ram_mb:                    { short: "Memory",   unit: "MB",       full: "model memory" },
  battery_drain_pct_hr:      { short: "Battery",  unit: "%/hr",     full: "battery drain" },
  bandwidth_kb_per_min:      { short: "Network",  unit: "KB/min",   full: "network bandwidth" },
};

/* ------------------------------------------------------------ DOM refs */
const el = {
  pill: $("#runpill"), pillText: $("#runpill-text"),
  statusLine: $("#statusline"), statusText: $("#status-text"),
  stepper: $("#stepper"),
  kInf: $("#k-inf"), kViol: $("#k-viol"), kAlert: $("#k-alert"),
  kLogs: $("#k-logs"), kSync: $("#k-sync"),
  nowModel: $("#now-model"), maePill: $("#mae-pill"),
  route: $("#route"), stops: $("#stops"), stopLabels: $("#stop-labels"), bus: $("#bus"), busLabel: $("#bus-label"),
  routeSub: $("#route-sub"), routeTripno: $("#route-tripno"),
  spark: $("#spark"),
  hudStop: $("#hud-stop"), hudDist: $("#hud-dist"), hudSpeed: $("#hud-speed"),
  hudEta: $("#hud-eta"), hudActual: $("#hud-actual"),
  meters: $("#meters"), meterModelHint: $("#meter-model-hint"),
  narrator: $("#narrator"), feed: $("#feed"),
  presetSeg: $("#preset-seg"), presetHint: $("#preset-hint"),
  modelChips: $("#model-chips"), speed: $("#speed"), speedLabel: $("#speed-label"),
  inDays: $("#in-days"), inTrips: $("#in-trips"), inSeed: $("#in-seed"),
  btnRun: $("#btn-run"), btnStop: $("#btn-stop"),
};

/* ------------------------------------------------------------ tabs */
function activateTab(name) {
  $$(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === "tab-" + name));
  $$("#tabnav .tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  if (name === "results") loadResults();
  if (name === "logs") loadLogs();
}
$$("#tabnav .tab").forEach((b) => b.addEventListener("click", () => activateTab(b.dataset.tab)));
$$("[data-goto]").forEach((b) => b.addEventListener("click", () => activateTab(b.dataset.goto)));

/* ------------------------------------------------------- boot: presets */
async function bootPresets() {
  try {
    const res = await fetch("/api/presets");
    const j = await res.json();
    S.presets = j.presets; S.registry = j.registry;
    S.registry.forEach((m) => S.modelsOn.add(m.name));
    renderModelChips();
    applyPreset(S.presets["real"] ? "real" : "demo", true);
  } catch (e) { /* backend not up? */ }
}
function renderModelChips() {
  el.modelChips.innerHTML = "";
  S.registry.forEach((m) => {
    const b = document.createElement("button");
    b.className = "chipm" + (S.modelsOn.has(m.name) ? " on" : "");
    b.dataset.model = m.name;
    b.title = m.desc;
    b.innerHTML = `${m.name} <small>· ${m.kind}</small>`;
    b.addEventListener("click", () => {
      if (S.running) return;
      if (S.modelsOn.has(m.name)) S.modelsOn.delete(m.name); else S.modelsOn.add(m.name);
      b.classList.toggle("on");
    });
    el.modelChips.appendChild(b);
  });
}
function applyPreset(name, silent) {
  S.preset = name;
  $$("#preset-seg .seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.preset === name));
  const p = S.presets[name];
  if (!p) return;
  el.inDays.value = p.days; el.inTrips.value = p.trips; el.inSeed.value = p.seed;
  el.speed.value = p.speed_ms; updateSpeedLabel();
  if (p.models) {
    S.modelsOn = new Set(p.models);
    renderModelChips();
  }
  if (!silent) {
    if (p.dataset === "real" || name === "real") {
      el.presetHint.textContent =
        "Real Data — 36 empirical bus trips along the ISCON-PDPU corridor (457 stop-observations), testing on held-out trips.";
    } else {
      el.presetHint.textContent =
        p.label + " — " + p.days + " days × " + p.trips + " trips/day" +
        (p.models.includes("mlp") ? ", including the deep MLP" : " (no deep MLP on purpose: too little data for it)");
    }
  }
}
$$("#preset-seg .seg-btn").forEach((b) => b.addEventListener("click", () => applyPreset(b.dataset.preset)));
el.speed.addEventListener("input", updateSpeedLabel);
function updateSpeedLabel() {
  const v = +el.speed.value;
  el.speedLabel.textContent = v === 0 ? "as fast as possible" : v + " ms / prediction";
}

/* ------------------------------------------------------------- websocket */
let ws = null, wsRetry = 0;
function connectWS() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen = () => { wsRetry = 0; };
  ws.onmessage = (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch (_) { return; }
    if (msg.hello) { onHello(msg.hello); return; }
    if (msg.lite) onLite(msg.lite);
    (msg.events || []).forEach(onEvent);
  };
  ws.onclose = () => {
    if (!S.running && S.lite && S.lite.status === "running") { /* server died */ }
    setTimeout(connectWS, Math.min(8000, 1000 * 2 ** wsRetry++));
  };
}

/* ------------------------------------------- applying server messages */
function onHello(state) {
  // thresholds drive the meters; (re)build them once per page session
  if (!$("#meters").children.length) buildMeters(state.thresholds);
  setLite(state);
  if (state.status === "running") setRunning(true); else setRunning(false);
}
function onLite(lite) {
  if (lite.status !== S.lite?.status && lite.status === "running") setRunning(true);
  if (lite.status !== S.lite?.status && lite.status !== "running") setRunning(false);
  setLite(lite);
}
function setLite(lite) {
  S.lite = lite;
  updateCounters();
  updatePill();
  updateStepper();
  el.statusText.innerHTML = fmt(lite.message || "");
  el.statusLine.classList.toggle("err", lite.status === "error");
  if (lite.current_model) {
    S.lastModel = lite.current_model;
  }
  if (S.lastModel) updateModelUI(S.lastModel, lite);
  else if (Object.keys(lite.models || {}).length) {
    // after finish there is no current model - show the last streamed one
    updateModelUI(S.lastModel || Object.keys(lite.models).at(-1), lite);
  }
}

function onEvent(ev) {
  pushNarrator(ev);
  pushFeed(ev);
  if (ev.kind === "model_start") {
    S.lastModel = ev.model;
    S.trips[ev.model] = null; // fresh visuals
  }
  if (ev.kind === "trip_start" && S.trips[ev.model] === undefined) S.trips[ev.model] = null;
  if (ev.kind === "trip_start") startTripVisual(ev);
  if (ev.kind === "inference") {
    const tv = S.trips[ev.model] || startTripVisual(ev);
    if (tv) { tv.preds.push(ev.pred_min); tv.acts.push(ev.actual_min); drawSpark(tv); }
    if ((S.lite?.current_model === ev.model) || !S.lite?.current_model) drawRoute(ev);
    updateMeters(ev.model, S.lite);
  }
  if (ev.kind === "profile") { flashMod("mod-monitor"); updateMeters(ev.model, S.lite); }
  if (ev.kind === "trip_start") flashMod("mod-monitor");
  if (ev.kind === "inference") flashMod("mod-monitor");
  if ((ev.violations || []).length) flashMod("mod-threshold", "warn");
  if ((ev.alerts || []).length) flashMod("mod-warning", "bad");
  if (ev.synced) flashMod("mod-log");
  if (ev.kind === "model_done") { S.lastModel = ev.model; if (S.lite) updateModelUI(ev.model, S.lite); }
  if (ev.kind === "run_done") {
    flashMod("mod-log");
    setRunning(false);
  }
  if (ev.kind === "stopped" || ev.kind === "error") setRunning(false);
}

function setRunning(r) {
  S.running = r;
  el.btnRun.disabled = r;
  el.btnStop.disabled = !r;
  $$("#card-settings input, #card-settings .seg-btn, #card-settings .chipm").forEach(
    (n) => { if (n !== el.btnRun && n !== el.btnStop && n.id !== "btn-run") n.disabled = r; });
}
function updatePill() {
  const st = S.lite?.status || "idle";
  el.pill.className = "runpill " + st;
  el.pillText.textContent = ({ idle: "Idle", running: "Running", done: "Done", error: "Error", stopped: "Stopped" }[st] || st);
}
function updateStepper() {
  const stage = S.lite?.stage || 0;
  $$("#stepper .step").forEach((s) => {
    const n = +s.dataset.s;
    s.classList.toggle("active", n === stage && S.lite?.status === "running");
    s.classList.toggle("done", n < stage || (n === stage && S.lite?.status === "done"));
  });
}
function updateCounters() {
  const l = S.lite;
  if (!l) return;
  const t = l.totals || {};
  el.kInf.textContent = (l.expected_inferences && l.stage >= 3)
    ? `${f0(t.inferences)} / ${f0(l.expected_inferences)}` : f0(t.inferences);
  el.kViol.textContent = f0(t.violations);
  el.kAlert.textContent = f0(t.alerts);
  el.kLogs.textContent = f0(t.log_records);
  el.kSync.textContent = f0(t.syncs);
}

/* ------------------------------------------------------- module activity */
function flashMod(id, state) {
  const m = $("#" + id);
  m.classList.remove("on", "warn", "bad");
  void m.offsetWidth; // restart CSS animation
  m.classList.add(state || "on");
  setTimeout(() => m.classList.remove("on", "warn", "bad"), 700);
}

/* ------------------------------------------------------------ route vis */
const N_MAX_STOPS = 18;
const CORRIDOR_STOPS_NB = [
  "ISCON", "Pakwaan", "GuruDwara", "Thaltej", "Zydus",
  "Kargil", "Sola", "Gota", "Vaishnodevi", "Khoraj",
  "Adalaj", "Sargasan", "Raksha-Shakti", "Bhaijipura", "PDPU"
];
const CORRIDOR_STOPS_SB = [
  "PDPU", "Bhaijipura", "Raksha-Shakti", "Sargasan", "Adalaj",
  "Khoraj", "Vaishnodevi", "Gota", "Sola", "Kargil",
  "Zydus", "Thaltej", "GuruDwara", "Pakwaan", "ISCON"
];

function routeCoords(i, n, pad = 60) {
  const w = 940;
  const x = n > 1 ? pad + (w - pad * 2) * i / (n - 1) : w / 2;
  return { x, y: 90 };
}
function startTripVisual(ev) {
  const tv = { trip_id: ev.trip_id, stops: ev.n_stops || N_MAX_STOPS,
               trip_index: ev.trip_index, trips_total: ev.trips_total,
               preds: [], acts: [] };
  S.trips[ev.model] = tv;
  if ((!S.lite || !S.lite.current_model || S.lite.current_model === ev.model)) {
    el.routeSub.textContent = `Model "${ev.model}" · trip ${ev.trip_index}/${ev.trips_total} in progress`;
  }
  return tv;
}
function drawRoute(ev) {
  const tv = S.trips[ev.model];
  const n = tv ? tv.stops : N_MAX_STOPS;
  const i = ev.stop_index;
  const isRealCorridor = (n === 15 || S.preset === "real");
  const stopsList = (ev.direction === "SB") ? CORRIDOR_STOPS_SB : CORRIDOR_STOPS_NB;

  // stops
  let html = "";
  let lblHtml = "";
  for (let k = 0; k < n; k++) {
    const c = routeCoords(k, n);
    html += `<circle cx="${c.x.toFixed(1)}" cy="${c.y}" r="6"
      class="${k < i ? "passed" : ""} ${k === i ? "current" : ""}"/>`;
    if (isRealCorridor && stopsList[k]) {
      const yOffset = (k % 2 === 0) ? c.y + 24 : c.y + 38;
      lblHtml += `<text x="${c.x.toFixed(1)}" y="${yOffset}" class="stop-label">${stopsList[k]}</text>`;
    }
  }
  el.stops.innerHTML = html;
  if (el.stopLabels) el.stopLabels.innerHTML = lblHtml;

  const here = routeCoords(i, n);
  el.bus.setAttribute("cx", here.x.toFixed(1));
  el.bus.setAttribute("cy", here.y);
  el.busLabel.setAttribute("x", here.x.toFixed(1));

  const currName = (isRealCorridor && stopsList[i]) ? stopsList[i] : `Stop ${i + 1}`;
  const nextName = (isRealCorridor && i + 1 < n && stopsList[i + 1]) ? stopsList[i + 1] : (i + 1 < n ? `Stop ${i + 2}` : "Terminal");

  el.busLabel.textContent = `Trip ${ev.trip_index}/${ev.trips_total} · ${currName} (${i + 1}/${n})`;

  // Update Live Telemetry HUD Bar
  if (el.hudStop) {
    el.hudStop.textContent = `${currName} ➔ ${nextName}`;
    el.hudDist.textContent = (ev.dist_remaining_km !== undefined) ? `${f1(ev.dist_remaining_km)} km` : "— km";
    el.hudSpeed.textContent = (ev.avg_speed_kmh !== undefined) ? `${f1(ev.avg_speed_kmh)} km/h` : "— km/h";
    el.hudEta.textContent = (ev.pred_min !== undefined) ? `${f1(ev.pred_min)} min` : "— min";
    el.hudActual.textContent = (ev.actual_min !== undefined) ? `${f1(ev.actual_min)} min` : "— min";
  }

  const nViol = (ev.violations || []).length, nAlert = (ev.alerts || []).length;
  el.routeTripno.textContent =
    [nViol && `${nViol} violation${nViol > 1 ? "s" : ""}`, nAlert && `${nAlert} alert${nAlert > 1 ? "s" : ""}`]
      .filter(Boolean).join(" · ") || "no limits broken ✓";
}

/* -------------------------------------------------------------- sparkline */
function drawSpark(tv) {
  const svg = el.spark;
  const W = 600, H = 170, pad = 26;
  const pts = tv.preds.map((p, k) => ({ p, a: tv.acts[k] })).filter((x) => x.a !== undefined && x.a !== null);
  if (pts.length < 2) { svg.innerHTML = ""; return; }
  const all = pts.flatMap((x) => [x.p, x.a]);
  let lo = Math.min(...all), hi = Math.max(...all);
  const span = Math.max(hi - lo, 1); lo -= span * 0.08; hi += span * 0.08;
  const n = pts.length;
  const X = (k) => pad + (W - pad * 2) * k / (n - 1);
  const Y = (v) => pad + (H - pad * 2) * (1 - (v - lo) / (hi - lo));
  const poly = (get) => pts.map((_, k) => `${X(k).toFixed(1)},${Y(get(k)).toFixed(1)}`).join(" ");
  svg.innerHTML =
    `<polyline points="${poly((k) => pts[k].p)}" fill="none" stroke="#0ea5e9" stroke-width="3" stroke-linejoin="round"/>` +
    `<polyline points="${poly((k) => pts[k].a)}" fill="none" stroke="#4f46e5" stroke-width="3" stroke-linejoin="round"/>`;
  // axes labels
  svg.innerHTML += `<text x="8" y="${pad + 12}" font-size="12" fill="#94a3b8">${hi.toFixed(0)} min</text>
    <text x="8" y="${H - 8}" font-size="12" fill="#94a3b8">${lo.toFixed(0)} min</text>
    <text x="${W - 8}" y="${H - 8}" font-size="12" fill="#94a3b8" text-anchor="end">stop ${n}</text>`;
}

/* --------------------------------------------------------------- meters */
function buildMeters(thresholds) {
  if (!thresholds) return;
  const units = { cpu_percent: "%", ram_mb: "MB", battery_drain_pct_hr: "%/hr", bandwidth_kb_per_min: "KB/min" };
  const limitScale = { cpu_percent: 1.5, ram_mb: 2, battery_drain_pct_hr: 2, bandwidth_kb_per_min: 2 };
  const why = {
    cpu_percent: "load the model would keep the embedded device at. Above it the device slows down or overheats.",
    ram_mb: "space the stored model takes. Above it the model may not fit in device memory.",
    battery_drain_pct_hr: "how fast the model would drain the battery per hour. Above it the bus radio dies mid-shift.",
    bandwidth_kb_per_min: "data the device sends per minute (payloads + log syncs). Above it the data plan is the problem.",
  };
  el.meters.innerHTML = "";
  THR_KEYS.forEach((k) => {
    const t = thresholds[k] || {};
    const div = document.createElement("div");
    div.className = "meter";
    div.dataset.metric = k;
    div.innerHTML = `
      <div class="mrow"><span><b>${esc(METRIC_META[k].full)}</b> <span class="muted">(limit ${f1(t.limit, 0)} ${units[k]})</span></span>
        <span class="mval">—</span></div>
      <div class="track"><div class="fill"></div><div class="tick" style="left:${(100 / (limitScale[k])).toFixed(1)}%"></div></div>
      <div class="why">${esc(why[k])}</div>`;
    el.meters.appendChild(div);
  });
}
function updateModelUI(name, lite) {
  const m = lite?.models?.[name];
  el.nowModel.textContent = m ? `${name} · ${m.kind}` : name;
  el.meterModelHint.textContent = m
    ? `Live values for the “${name}” model (${m.kind}) as reported by the layer.`
    : "Waiting for the first model to be profiled…";
  if (m && m.inferences) el.maePill.textContent = `MAE ${f1(m.rolling_mae_s, 0)} s`;
  else el.maePill.textContent = "MAE —";
  updateMeters(name, lite);
}
function updateMeters(name, lite) {
  const m = lite?.models?.[name];
  if (!m) return;
  const vals = { cpu_percent: m.cpu_last, ram_mb: m.ram_last,
                 battery_drain_pct_hr: m.battery_last, bandwidth_kb_per_min: m.bw_last };
  const thr = (lite.thresholds || {});
  $$("#meters .meter").forEach((row) => {
    const k = row.dataset.metric;
    const meta = METRIC_META[k];
    const v = vals[k], limit = thr[k]?.limit;
    if (v === undefined || limit === undefined) return;
    const scale = { cpu_percent: 1.5, ram_mb: 2, battery_drain_pct_hr: 2, bandwidth_kb_per_min: 2 }[k];
    const pct = Math.min(100, v / (limit * scale) * 100);
    const ok = v <= limit;
    const valEl = row.querySelector(".mval"), fillEl = row.querySelector(".fill");
    valEl.textContent = f1(v) + " " + meta.unit;
    valEl.className = "mval " + (ok ? "ok" : "bad");
    fillEl.style.width = pct.toFixed(1) + "%";
    fillEl.className = "fill " + (ok ? "ok" : "bad");
  });
}

/* ------------------------------------------------------------- narrator */
function pushNarrator(ev) {
  const rows = [];
  const metricWord = (v) => (METRIC_META[v.metric]?.full || v.metric);
  const metricVal = (v) => {
    const u = METRIC_META[v.metric]?.unit || "";
    return `${f1(v.value)} ${u} (limit ${f1(v.limit, 0)} ${u})`;
  };
  if (["status", "train_start", "train_done", "data_done", "data_start", "model_done"].includes(ev.kind)) {
    rows.push({ cls: ev.kind === "model_done" ? "ok" : "blue", who: "System", html: fmt(ev.text || "") });
  } else if (ev.kind === "profile") {
    rows.push({ cls: "blue", who: "Monitoring Engine", html:
      `Profiled <b>${ev.model}</b>: model is <b>${ev.metrics.model_footprint_mb} MB</b> on disk · ` +
      `<b>${ev.metrics.inference_ms} ms</b> per prediction on this laptop · modelled <b>${ev.metrics.cpu_percent}% CPU</b> ` +
      `and <b>${ev.metrics.battery_drain_pct_hr}%/hr battery</b> on the target device.` });
  } else if (ev.kind === "trip_start") {
    rows.push({ cls: "blue", who: "Simulation", html:
      `Trip ${ev.trip_index}/${ev.trips_total} starts — the <b>${ev.model}</b> model will predict the ` +
      `remaining minutes at every one of the ${ev.n_stops} stops.` });
  } else if (ev.kind === "inference") {
    const kindTxt = {
      light: "a simple linear model", medium: "gradient boosting (XGBoost-class)",
      heavy: "a deep neural network (LSTM/GRU stand-in)",
    }[ev.model_kind] || ev.model;
    const err = Math.abs(ev.error_s);
    const dir = ev.pred_min > ev.actual_min ? "late" : "early";
    rows.push({ cls: "info", who: `Spatial Twin · ${ev.model}`,
      html: `At stop ${ev.stop_index + 1}/${ev.n_stops} the twin predicted <b>${f1(ev.pred_min)} min</b> remaining; ` +
            `ground-truth was <b>${f1(ev.actual_min)} min</b> — off by ${f1(err, 0)} s (${dir}).` });
    (ev.alerts || []).slice(0, 3).forEach((a) => {
      rows.push({ cls: "bad", who: `Actuation Directive (${a.severity}) · Warning System`,
        html: `<b>${esc(metricWord(a))}</b> reached ${esc(metricVal(a))} — breached safe hardware limit. ` +
              `Closed-loop directive: ${esc(a.hint)}` });
    });
    (ev.violations || []).slice(0, 2).forEach((v) => {
      const alertFired = (ev.alerts || []).some((a) => a.metric === v.metric);
      if (!alertFired) rows.push({ cls: "warn", who: "Hardware Limit Breach · Threshold Checker",
        html: `<b>${esc(metricWord(v))}</b> at ${esc(metricVal(v))} breaks hardware budget — logged; directive suppressed by cooldown.` });
    });
    if (ev.synced) rows.push({ cls: "ok", who: "Cloud Fleet Twin Sync",
      html: `Telemetry batch synchronized to central cloud fleet twin.` });
  }
  if (!rows.length) return;
  const box = el.narrator;
  if (box.querySelector(".muted")) box.innerHTML = "";
  rows.slice(0, 6).forEach((r) => {
    const p = document.createElement("p");
    p.className = "nrow " + r.cls;
    p.innerHTML = `<span class="who">${esc(r.who)}</span>${r.html}`;
    box.prepend(p);
  });
  while (box.children.length > 7) box.removeChild(box.lastChild);
}

/* ---------------------------------------------------------------- feed */
function pushFeed(ev) {
  const cls = { status: "sys", data_start: "sys", data_done: "sys",
    train_start: "sys", train_done: "sys", model_start: "sys", profile: "sys",
    trip_start: "trip", model_done: "okline", run_done: "okline",
    stopped: "alert", error: "alert" }[ev.kind] || "info";
  const nowT = now();
  let raw;
  if (ev.kind === "inference") {
    const v = (ev.violations || []).length, a = (ev.alerts || []).length;
    raw = `[${nowT}] ${ev.model} · #${ev.trip_id} stop ${String(ev.stop_index + 1).padStart(2, "0")} · ` +
      `pred ${f1(ev.pred_min)} min vs actual ${f1(ev.actual_min)} (${ev.error_s > 0 ? "+" : ""}${f1(ev.error_s, 0)} s)`;
    S.feed.push({ cls, raw, flags: { viol: v, alert: a, sync: ev.synced } });
  } else if (ev.text) {
    raw = `[${nowT}] ${ev.text.replace(/\*\*/g, "")}`;
    S.feed.push({ cls, raw });
  } else return;
  if (S.feed.length > 500) S.feed.splice(0, S.feed.length - 500);
  renderFeed();
}
function feedMatches(f) {
  const k = S.feedFilter;
  if (k === "all") return true;
  if (k === "alert") return f.cls === "alert" || (f.flags && f.flags.alert);
  if (k === "violation") return f.flags && f.flags.viol;
  if (k === "inference") return f.cls === "info";
  if (k === "system") return ["sys", "trip", "okline"].includes(f.cls);
  return true;
}
function renderFeed() {
  const frag = document.createDocumentFragment();
  const items = S.feed.filter(feedMatches).slice(-260);
  const stick = el.feed.scrollTop + el.feed.clientHeight >= el.feed.scrollHeight - 30;
  items.forEach((f) => {
    const p = document.createElement("p");
    p.className = "fline " + f.cls;
    p.innerHTML = esc(f.raw) + (f.flags?.viol ? `<span class="badge">${f.flags.viol} viol.</span>` : "") +
      (f.flags?.alert ? `<span class="badge">${f.flags.alert} alert</span>` : "") +
      (f.flags?.sync ? `<span class="badge sync">sync</span>` : "");
    frag.appendChild(p);
  });
  el.feed.innerHTML = "";
  el.feed.appendChild(frag);
  if (stick || items.length < 30) el.feed.scrollTop = el.feed.scrollHeight;
}
$$("#feed-filters .chipf").forEach((b) => b.addEventListener("click", () => {
  $$("#feed-filters .chipf").forEach((x) => x.classList.remove("active"));
  b.classList.add("active");
  S.feedFilter = b.dataset.f;
  renderFeed();
}));

/* ---------------------------------------------------------- run controls */
el.btnRun.addEventListener("click", runNow);
el.btnStop.addEventListener("click", async () => {
  await fetch("/api/stop", { method: "POST" });
  el.btnStop.disabled = true;
  el.statusText.textContent = "Stopping… (the simulation finishes the current step, then halts)";
});
async function runNow() {
  if (S.running) return;
  const p = S.presets[S.preset] || {};
  const payload = {
    preset: S.preset,
    dataset: p.dataset || (S.preset === "real" ? "real" : "synthetic"),
    models: [...S.modelsOn],
    days: +el.inDays.value, trips: +el.inTrips.value, seed: +el.inSeed.value,
    speed_ms: +el.speed.value,
  };
  el.btnRun.disabled = true;
  el.statusLine.classList.remove("err");
  el.statusText.innerHTML = "Requesting the Python simulation…";
  try {
    const res = await fetch("/api/run", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await res.json();
    if (!j.ok) {
      el.statusLine.classList.add("err");
      el.statusText.textContent = j.error || "Could not start the run.";
      el.btnRun.disabled = false;
      return;
    }
    // fresh run: clear stale visuals + feed + narrator + trips
    S.trips = {}; S.feed = []; S.lastModel = null;
    el.feed.innerHTML = '<p class="muted feedempty">Starting…</p>';
    el.narrator.innerHTML = "";
    if (j.state?.status === "running") setRunning(true);
    setLite(j.state);
  } catch (e) {
    el.statusLine.classList.add("err");
    el.statusText.textContent = "Could not reach the backend: " + e.message;
    el.btnRun.disabled = false;
  }
}

/* --------------------------------------------------------------- results */
async function loadResults() {
  const st = await fetchState();
  const rows = st?.results;
  if (!rows || !rows.length) {
    $("#results-empty").hidden = false;
    $("#results-body").hidden = true;
    return;
  }
  $("#results-empty").hidden = true;
  $("#results-body").hidden = false;
  const d = st.data;
  const meta = `Run: ${d ? `${d.days} days × ${d.trips} trips/day, seed ${d.seed} — ` : ""}` +
    `${rows.length} model run(s)${st.wall_sec ? ` · wall time ${f1(st.wall_sec, 0)} s` : ""} · ` +
    `CPU ceiling ${f1(st.thresholds.cpu_percent.limit, 0)}% · cooldown ${st.config?.warning_cooldown_sec}s`;
  const metaEl = $("#results-meta");
  if (metaEl) metaEl.textContent = meta;
  renderVerdicts(rows, st);
  renderCharts(rows, st);
  renderTable(rows);
  renderProse(rows, st);
}
async function fetchState() {
  try {
    const res = await fetch("/api/state?ts=" + Date.now());
    return await res.json();
  } catch (e) { return null; }
}
const btnRefresh = $("#btn-refresh-results");
if (btnRefresh) btnRefresh.addEventListener("click", loadResults);

function renderVerdicts(rows, st) {
  const cpuLimit = st.thresholds.cpu_percent.limit;
  const okCpu = rows.filter((r) => r.cpu_percent_avg <= cpuLimit);
  const winner = [...okCpu].sort((a, b) => a.mae_s - b.mae_s)[0];
  const wrap = $("#verdicts");
  wrap.innerHTML = "";
  rows.forEach((r) => {
    const isWinner = winner && r.model === winner.model;
    const tooHungry = r.cpu_percent_avg > cpuLimit;
    const cls = isWinner ? "rec" : tooHungry ? "bad" : "";
    const story = verdictStory(r, rows, cpuLimit, isWinner, tooHungry);
    const card = document.createElement("div");
    card.className = "verdict " + cls;
    card.innerHTML = `
      <div class="v-name">${esc(r.model)} <span class="v-kind">${esc(r.kind || "")}</span></div>
      <div class="v-grid">
        <div class="vv"><b>${f1(r.mae_s, 0)} s</b><span>typical error (MAE)</span></div>
        <div class="vv ${tooHungry ? "badnum" : "oknum"}"><b>${f1(r.cpu_percent_avg)}%</b><span>CPU on device (limit ${f1(cpuLimit, 0)}%)</span></div>
        <div class="vv"><b>${f1(r.ram_model_mb, 2)} MB</b><span>model footprint</span></div>
        <div class="vv"><b>${f0(r.violations)}</b><span>violations · ${f0(r.warnings)} alerts</span></div>
      </div>
      <p class="v-story">${story}</p>`;
    wrap.appendChild(card);
  });
}
function verdictStory(r, rows, cpuLimit, isWinner, tooHungry) {
  const bestMae = Math.min(...rows.map((x) => x.mae_s));
  const rel = r.mae_s / Math.max(bestMae, 1e-9);
  let story;
  if (tooHungry) {
    story = `Just as accurate as the best light model (MAE ${f1(r.mae_s, 0)} s vs ${f1(bestMae, 0)} s), ` +
      `but it needs <b class="badword">${f1(r.cpu_percent_avg)}% CPU</b> — over the ${f1(cpuLimit, 0)}% ceiling on ` +
      `<b class="badword">every single prediction</b>. The layer logged ${f0(r.violations)} violations and sent ` +
      `${f0(r.warnings)} alerts telling the operator to prune or quantize it before it can ship.`;
  } else if (isWinner) {
    story = `Best balance: typical error of <b class="okword">${f1(r.mae_s, 0)} s</b> at ` +
      `<b class="okword">${f1(r.cpu_percent_avg)}% CPU</b>, comfortably under every limit ` +
      `(${r.violations} violations). This is the model the layer would approve for the device.`;
  } else if (rel > 2) {
    story = `Uses almost no resources (<b class="okword">${f1(r.cpu_percent_avg)}% CPU</b>, ${f1(r.ram_model_mb, 2)} MB) ` +
      `but its typical error of <b class="badword">${f1(r.mae_s, 0)} s</b> is ${f1(rel, 0)}× worse than the best model — ` +
      `passengers would get “arrives in X min” answers that are regularly minutes wrong. Accuracy matters too.`;
  } else {
    story = `Solid accuracy (MAE ${f1(r.mae_s, 0)} s) with ${f1(r.cpu_percent_avg)}% CPU and ${r.violations} violations — ` +
      `a reasonable middle ground; it was edged out only on the accuracy-vs-resource balance.`;
  }
  return story;
}

function killCharts() { S.charts.forEach((c) => c.destroy()); S.charts = []; }
function chartOf(canvas) {
  const existing = window.Chart && Chart.getChart(canvas);
  if (existing) existing.destroy();
  return canvas;
}
function renderCharts(rows, st) {
  if (!window.Chart) {
    $("#results-body").insertAdjacentHTML("beforeend",
      '<div class="card note"><b>Chart library not loaded</b> — this page uses Chart.js from a CDN; check the internet connection. The tables above still work.</div>');
    return;
  }
  const cpuLimit = st.thresholds.cpu_percent.limit;
  const names = rows.map((r) => r.model);
  const colors = { linear: "#38bdf8", gradient_boosting: "#10b981", mlp: "#ef4444" };

  // 1) MAE bars + CPU line with ceiling
  const c1 = chartOf($("#chart-acc-cpu"));
  S.charts.push(new Chart(c1, {
    data: {
      labels: names,
      datasets: [
        { type: "bar", label: "Prediction error (MAE, s)", data: rows.map((r) => r.mae_s),
          yAxisID: "y", backgroundColor: "rgba(79,70,229,.85)", borderRadius: 6 },
        { type: "line", label: "CPU on device (%)", data: rows.map((r) => r.cpu_percent_avg),
          yAxisID: "y1", borderColor: "#f59e0b", backgroundColor: "#f59e0b",
          pointRadius: 5, tension: 0 },
        { type: "line", label: `CPU ceiling (${cpuLimit}%)`, data: rows.map(() => cpuLimit),
          yAxisID: "y1", borderColor: "#ef4444", borderDash: [6, 6],
          pointRadius: 0, borderWidth: 2 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: "bottom" } },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: "seconds" }, grid: { color: "#eef2f7" } },
        y1: { position: "right", beginAtZero: true,
              max: Math.max(70, Math.max(...rows.map((r) => r.cpu_percent_avg), 0) * 1.3),
              title: { display: true, text: "% CPU" }, grid: { display: false } },
      },
    },
  }));

  // 2) scatter CPU vs MAE with deployable zone (fixed axes, so the points
  //    are not crushed by the ceiling line's y-extent)
  const maxMae = Math.max(...rows.map((r) => r.mae_s));
  const maxCpu = Math.max(cpuLimit, ...rows.map((r) => r.cpu_percent_avg));
  const yMax = Math.ceil(maxMae * 1.3), xMax = Math.ceil(maxCpu * 1.25);
  const c2 = chartOf($("#chart-scatter"));
  S.charts.push(new Chart(c2, {
    data: { datasets: [
      { type: "line", label: `${cpuLimit}% CPU ceiling`,
        data: [{ x: cpuLimit, y: 0 }, { x: cpuLimit, y: yMax }],
        borderColor: "#ef4444", borderDash: [7, 7], pointRadius: 0, borderWidth: 2 },
      { type: "scatter", label: "models", data: rows.map((r) => ({ x: r.cpu_percent_avg, y: r.mae_s })),
        backgroundColor: rows.map((r) => colors[r.model] || "#64748b"), pointRadius: 12,
        pointBorderColor: "#fff", pointBorderWidth: 2 },
    ] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false },
        tooltip: { callbacks: { label: (c) => {
          const r = rows.find((x) => x.cpu_percent_avg === c.parsed.x && x.mae_s === c.parsed.y);
          return r ? `${r.model}: ${f1(r.cpu_percent_avg)}% CPU, MAE ${f1(r.mae_s, 0)} s` : ""; } } } },
      scales: {
        x: { title: { display: true, text: "CPU load on device (%)" }, min: 0, max: xMax,
             grid: { color: "#eef2f7" } },
        y: { title: { display: true, text: "Prediction error — MAE (s, lower is better)" }, min: 0, max: yMax,
             grid: { color: "#eef2f7" } },
      },
    },
  }));

  // 3) what the layer caught
  const c3 = chartOf($("#chart-caught"));
  S.charts.push(new Chart(c3, {
    type: "bar",
    data: {
      labels: names,
      datasets: [
        { label: "Violations (limits broken)", data: rows.map((r) => r.violations),
          backgroundColor: "rgba(245,158,11,.8)", borderRadius: 6 },
        { label: "Alerts (after cooldown)", data: rows.map((r) => r.warnings),
          backgroundColor: "rgba(239,68,68,.85)", borderRadius: 6 },
        { label: "Predictions made", data: rows.map((r) => r.n_inferences),
          backgroundColor: "rgba(148,163,184,.35)", borderRadius: 6 },
      ],
    },
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: "bottom" } },
      scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { color: "#eef2f7" } } } },
  }));
}
function renderTable(rows) {
  const tb = $("#report-table tbody");
  tb.innerHTML = "";
  rows.forEach((r) => {
    const tr = document.createElement("tr");
    const over = r.cpu_percent_avg > 30;
    tr.innerHTML = `
      <td><b>${esc(r.model)}</b></td>
      <td>${f1(r.mae_s)}</td><td>${f1(r.rmse_s)}</td><td>${f1(r.r2, 3)}</td>
      <td class="${over ? "badnum" : ""}">${f1(r.cpu_percent_avg)}%</td>
      <td>${f1(r.ram_model_mb, 2)}</td><td>${f1(r.battery_pct_hr)}</td>
      <td>${f1(r.bandwidth_kb_per_min)}</td>
      <td class="${r.violations ? "badnum" : "oknum"}">${f0(r.violations)}</td>
      <td class="${r.warnings ? "badnum" : "oknum"}">${f0(r.warnings)}</td>`;
    tb.appendChild(tr);
  });
}
function renderProse(rows, st) {
  const wrap = $("#verdict-prose");
  const on = rows;
  if (!on.length) return;
  const cpuLimit = st.thresholds.cpu_percent.limit;
  const best = [...on].sort((a, b) => a.mae_s - b.mae_s)[0];
  const cheapest = [...on].sort((a, b) => a.cpu_percent_avg - b.cpu_percent_avg)[0];
  const deployable = on.filter((r) => r.cpu_percent_avg <= cpuLimit);
  const winner = [...deployable].sort((a, b) => a.mae_s - b.mae_s)[0] || cheapest;
  wrap.innerHTML = `
    <h3 class="sec" style="margin-top:0">Digital Twin Operational Verdict (Key Takeaway)</h3>
    <p>The Digital Twin evaluated <b>${on.length} model architecture(s)</b> across dual dimensions: <b>Spatial ETA Accuracy</b> on held-out corridor trips and <b>Edge Hardware Viability</b> under the paper’s operational benchmarks.</p>
    <p>Predictive accuracy alone would prioritize the deep model or gradient boosting (typical error: <b>${f1(best.mae_s, 0)} s MAE</b>). However, a Digital Twin models whether the asset can sustainably operate without hardware failure.</p>
    <p>Once edge hardware limits are evaluated, the closed-loop policy triggers: ${deployable.length === on.length
      ? "every model stayed under the 30% CPU ceiling, so the digital twin approves the most accurate candidate."
      : `${deployable.length} of the ${on.length} model(s) remained within the safe ${f1(cpuLimit, 0)}% CPU ceiling. ` +
        "The un-optimized deep model breaches the computing budget on nearly every prediction, triggering critical remediation directives (prune, quantize, or switch architecture)."}</p>
    <p>${winner && winner.model !== best.model
      ? `The Digital Twin officially recommends <b>${esc(winner.model)}</b>: <b>${f1(winner.mae_s, 0)} s</b> error at only ` +
        `<b>${f1(winner.cpu_percent_avg)}% CPU</b> — achieving competitive accuracy while preserving edge battery, thermal headroom, and task responsiveness.`
      : `The <b>${esc(winner.model)}</b> model is the approved digital twin configuration — highly accurate and well within the ${f1(cpuLimit, 0)}% edge CPU ceiling.`}</p>`;
}

/* ----------------------------------------------------------------- logs */
async function loadLogs() {
  try {
    const res = await fetch("/api/logs?limit=80&ts=" + Date.now());
    const j = await res.json();
    const seg = S.logTab;
    $$("#log-seg .seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.log === seg));
    const part = j[seg];
    const view = $("#logview");
    if (!part) { view.textContent = "No log data yet — run a simulation first."; return; }
    $("#log-path").textContent = `${part.count} record(s) → ${part.path}`;
    if (!part.rows.length) { view.textContent = "File is empty so far."; return; }
    let out = "";
    part.rows.forEach((r) => {
      if (seg === "cloud") {
        out += JSON.stringify(r, null, 1).replace(/^/gm, "") + "\n\n";
      } else {
        const { violations, ...rest } = r;
        out += JSON.stringify(rest) + (violations && violations.length
          ? "  " + JSON.stringify({ violations }) : "") + "\n\n";
      }
    });
    view.textContent = out.trim();
  } catch (e) {
    $("#logview").textContent = "Could not read logs: " + e.message;
  }
}
$$("#log-seg .seg-btn").forEach((b) => b.addEventListener("click", () => {
  S.logTab = b.dataset.log;
  loadLogs();
}));

/* ------------------------------------------------------------- the start */
bootPresets();
connectWS();
setInterval(() => { if (S.lite?.status === "running") updateCounters(); }, 1000);
