"""One-command launcher for the Guideline Layer live dashboard.

    python run_dashboard.py            # http://127.0.0.1:8000
    python run_dashboard.py --port 9000

Serves the FastAPI app (dashboard.main:app): a single-page UI that runs the
real Python simulation pipeline in a worker thread and streams every step
(training, profiling, per-stop inference with the Guideline Layer closed loop)
over a WebSocket. Static files are served from dashboard/static.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--no-reload", action="store_true",
                        help="disable auto-reload (default: on for dev)")
    args = parser.parse_args()

    print(f"Guideline Layer dashboard -> http://{args.host}:{args.port}")
    print("Stop with Ctrl+C. Open the Live Run tab and press Start.")

    import uvicorn
    uvicorn.run(
        "dashboard.main:app",
        host=args.host,
        port=args.port,
        reload=not args.no_reload,
        log_level="info",
    )


if __name__ == "__main__":
    main()
