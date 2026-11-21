#!/usr/bin/env python3
"""
The Watcher's Map: a parchment-map view of the live picoScan150 data.

Same reader, tracking and static map as lidar/live_reader.py (it is reused, not copied);
only the page is different.

Run (stop lidar/live_reader.py first: only one program can receive the sensor data):
    python3 parchment_map/serve.py
Then open http://localhost:8791
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "lidar"))

import live_reader  # noqa: E402

live_reader.VIEW_FILE = os.path.join(HERE, "index.html")
if "--http-port" not in sys.argv:
    sys.argv += ["--http-port", "8791"]

if __name__ == "__main__":
    live_reader.main()
