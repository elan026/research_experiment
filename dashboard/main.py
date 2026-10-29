"""FastAPI application for the Guideline Layer live dashboard.

Endpoints
---------
GET  /            -> the single-page dashboard UI
GET  /api/state   -> full JSON snapshot of the current run/state
GET  /api/presets -> dataset presets offered in the UI
POST /api/run     -> start a simulation (real Python pipeline in a worker thread)
POST /api/stop    -> request a clean stop of the running simulation
GET  /api/logs    -> tail the actual log/cloud files written by the run
WS   /ws          -> live event stream of the running simulation

Run with:  python run_dashboard.py   (or uvicorn dashboard.main:app)
"""

from __future__ import annotations

import asyncio
import csv
import json
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from dashboard.engine import PRESETS, RunEngine
from models import MODEL_REGISTRY

STATIC_DIR = Path(__file__).resolve().parent / "static"
INDEX_HTML = STATIC_DIR / "index.html"

engine = RunEngine()

app = FastAPI(title="Guideline Layer - Live Simulator Dashboard")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# ---------------------------------------------------------------- websockets
_subscribers: set[asyncio.Queue] = set()


def _lite_snapshot() -> dict:
    """Small authoritative counter snapshot sent with each WS batch, so the
    UI never double-counts (e.g. after a reconnect mid-run). Series arrays are
    deliberately excluded - the full snapshot is available via /api/state."""
    s = engine.state
    models = {}
    for name, m in s["models"].items():
        models[name] = {k: v for k, v in m.items()
                        if k not in ("cpu_series", "err_series", "profile", "desc")}
    return {
        "status": s["status"], "stage": s["stage"], "message": s["message"],
        "current_model": s["current_model"], "trained": list(s["trained"]),
        "expected_inferences": s["expected_inferences"],
        "data": s["data"], "totals": dict(s["totals"]), "models": models,
        "thresholds": s["thresholds"], "config": s["config"],
    }


async def _broadcast(payload: str) -> None:
    dead = []
    for q in _subscribers:
        try:
            q.put_nowait(payload)
        except asyncio.QueueFull:
            dead.append(q)
    for q in dead:
        _subscribers.discard(q)


async def _pump() -> None:
    """Drain engine events on the asyncio loop, reduce into engine.state and
    fan the events out to every connected WebSocket client."""
    last_sent = asyncio.get_running_loop().time()
    while True:
        await asyncio.sleep(0.025)
        events = engine.drain(max_n=250)
        if events:
            for ev in events:
                engine.apply(ev)
            payload = json.dumps({"events": events, "lite": _lite_snapshot()},
                                 default=_json_default)
            await _broadcast(payload)
            last_sent = asyncio.get_running_loop().time()
        elif asyncio.get_running_loop().time() - last_sent > 15.0:
            await _broadcast(json.dumps({"hb": True}))
            last_sent = asyncio.get_running_loop().time()


@app.on_event("startup")
async def _start_pump() -> None:
    app.state.pump_task = asyncio.create_task(_pump())


@app.on_event("shutdown")
async def _stop_pump() -> None:
    task = getattr(app.state, "pump_task", None)
    if task:
        task.cancel()


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket) -> None:
    await ws.accept()
    q: asyncio.Queue = asyncio.Queue(maxsize=2000)
    _subscribers.add(q)
    try:
        await q.put(json.dumps({"hello": engine.snapshot()}, default=_json_default))
        while True:
            msg = await q.get()
            await ws.send_text(msg)
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        _subscribers.discard(q)


def _json_default(o):
    import numpy as np
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating,)):
        return float(o)
    return str(o)


# ------------------------------------------------------------------- REST
@app.get("/")
async def index() -> FileResponse:
    return FileResponse(INDEX_HTML)


@app.get("/api/state")
async def api_state() -> dict:
    return engine.snapshot()


@app.get("/api/presets")
async def api_presets() -> dict:
    return {"presets": PRESETS,
            "registry": [{"name": n, "kind": MODEL_REGISTRY[n].kind,
                          "desc": MODEL_REGISTRY[n].description}
                         for n in MODEL_REGISTRY]}


class RunParams(BaseModel):
    preset: Optional[str] = None
    dataset: Optional[str] = None
    models: Optional[list[str]] = None
    days: Optional[int] = None
    trips: Optional[int] = None
    seed: Optional[int] = 42
    speed_ms: Optional[int] = None


@app.post("/api/run")
async def api_run(params: RunParams) -> JSONResponse:
    preset_key = params.preset if params.preset in PRESETS else "real"
    base = dict(PRESETS[preset_key])
    if params.dataset is not None:
        base["dataset"] = params.dataset
    if params.models:
        base["models"] = params.models
    if params.days is not None:
        base["days"] = params.days
    if params.trips is not None:
        base["trips"] = params.trips
    if params.seed is not None:
        base["seed"] = params.seed
    if params.speed_ms is not None:
        base["speed_ms"] = params.speed_ms

    models = [m.strip() for m in base["models"] if m.strip()]
    unknown = [m for m in models if m not in MODEL_REGISTRY]
    if not models:
        return JSONResponse({"ok": False, "error": "Select at least one model."}, status_code=400)
    if unknown:
        return JSONResponse({"ok": False,
                             "error": f"Unknown model(s): {', '.join(unknown)}"}, status_code=400)
    base["models"] = list(dict.fromkeys(models))
    if base.get("dataset") != "real":
        base["days"] = max(1, min(int(base.get("days", 10)), 60))
        base["trips"] = max(1, min(int(base.get("trips", 10)), 40))
    else:
        base["days"] = int(base.get("days", 0))
        base["trips"] = int(base.get("trips", 9))
    base["seed"] = max(0, int(base["seed"]))
    base["speed_ms"] = max(0, min(int(base.get("speed_ms", 0)), 2000))

    ok, err = engine.start(base)
    if not ok:
        return JSONResponse({"ok": False, "error": err}, status_code=409)
    return JSONResponse({"ok": True, "state": engine.snapshot()})


@app.post("/api/stop")
async def api_stop() -> JSONResponse:
    engine.request_stop()
    return JSONResponse({"ok": True, "message": "Stop requested."})


@app.get("/api/logs")
async def api_logs(limit: int = 60) -> dict:
    """Tail the real files written by the Logging Module of the run."""
    out: dict = {}
    for key, path in (("inferences", engine.state["artifacts"]["inferences_path"]),
                      ("warnings", engine.state["artifacts"]["warnings_path"])):
        p = Path(path)
        rows, count = [], 0
        if p.exists():
            lines = p.read_text(encoding="utf-8").splitlines()
            count = len(lines)
            for line in lines[-limit:]:
                try:
                    rows.append(json.loads(line))
                except json.JSONDecodeError:
                    rows.append({"raw": line[:200]})
        out[key] = {"count": count, "path": str(p), "rows": rows}

    p = Path(engine.state["artifacts"]["cloud_path"])
    cloud = {"count": 0, "path": str(p), "rows": []}
    if p.exists():
        with p.open(encoding="utf-8", newline="") as f:
            reader = list(csv.reader(f))
        cloud["count"] = max(len(reader) - 1, 0)
        hdr = reader[0] if reader else []
        cloud["rows"] = [dict(zip(hdr, row)) for row in reader[1:][-limit:]]
    out["cloud"] = cloud
    return out
