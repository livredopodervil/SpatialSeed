#!/data/data/com.termux/files/usr/bin/python
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import os

PROJECT = Path.home() / "storage/shared/SpatialSeed-monorepo"
PORT = 8082

class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

os.chdir(PROJECT)
print(f"Spatial Seed sem cache: http://127.0.0.1:{PORT}/apps/web/")
ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
