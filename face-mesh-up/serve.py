# serve.py — a local web server for the photobooth.
#
#   python3 serve.py          then open http://localhost:8000/
#   python3 serve.py 8001     (another port)
#
# Why not "python3 -m http.server"? Two problems with that one:
#   1. It lets the browser keep old copies of the .js files. After a change
#      you can end up with a mix of old and new files, and a screen breaks.
#      This server tells the browser: always fetch the newest file.
#   2. It only lets 5 connections wait at a time. The page asks for about
#      35 files at once, so sometimes one is refused and silently missing
#      (then e.g. "welcomeScreen is not defined"). This server answers many
#      requests at the same time and lets plenty wait.
#
# PRINTING (no dialog, no clicks): a web page can't print by itself without
# showing the print dialog. So the page (print.js) sends the finished case
# file picture HERE, to /print. This server saves it in the prints/ folder
# (the archive) and hands it to macOS's own print command, "lp", which
# sends it straight to the DEFAULT printer (System Settings -> Printers &
# Scanners -> Default printer). Only this computer may print (not other
# computers on the network).
#
#   PRINT_OPTIONS  the paper and scaling, see below
#   DRY_RUN=1 python3 serve.py   saves the pictures but doesn't print (testing)

import http.server
import json
import os
import re
import subprocess
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
PRINTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "prints")
DRY_RUN = os.environ.get("DRY_RUN") == "1"

# The options for "lp" (what this printer offers: lpoptions -l):
#   media=4x6         postcard size, 4 x 6 inches (other sizes: Letter,
#                     Postcard = 100 x 148 mm, 5x7, A6, ...)
#   ColorModel=Gray   black and white (RGB = colour)
#   fit-to-page       the picture scaled to fit the printable area
#                     (it keeps its shape, so a Letter-shaped page gets a
#                     white band at the top and bottom of a 4x6 card)
# Another printer than the default: add "-d", "Printer_Name" (see: lpstat -p).
PRINT_OPTIONS = ["-o", "media=4x6", "-o", "ColorModel=Gray", "-o", "fit-to-page"]


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # "Don't keep a copy, ask me again every time"
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, format, *args):
        pass  # keep the terminal quiet (one line per file is a lot)

    # POST /print?name=mugshot3_case_0002_...  (the body = the PNG picture)
    def do_POST(self):
        if not self.path.startswith("/print"):
            return self.answer(404, {"ok": False, "error": "unknown address"})
        if self.client_address[0] not in ("127.0.0.1", "::1"):
            return self.answer(403, {"ok": False, "error": "only this computer may print"})

        # The file name: only letters, digits, _ and - (nothing that could
        # point somewhere else on the disk)
        match = re.search(r"name=([A-Za-z0-9_-]+)", self.path)
        name = match.group(1) if match else "case_file"
        picture = self.rfile.read(int(self.headers.get("Content-Length", 0)))

        # 1. Save it in the archive
        os.makedirs(PRINTS_DIR, exist_ok=True)
        path = os.path.join(PRINTS_DIR, name + ".png")
        with open(path, "wb") as f:
            f.write(picture)

        # 2. Print it on the default printer
        if DRY_RUN:
            print("Saved (DRY_RUN, not printed): " + path)
            return self.answer(200, {"ok": True, "job": "dry run", "file": path})
        try:
            result = subprocess.run(["lp"] + PRINT_OPTIONS + [path], capture_output=True, text=True, timeout=30)
        except Exception as e:
            print("PRINT FAILED: " + str(e))
            return self.answer(500, {"ok": False, "error": str(e)})
        if result.returncode != 0:
            print("PRINT FAILED: " + result.stderr.strip())
            return self.answer(500, {"ok": False, "error": result.stderr.strip()})
        print("Printing " + name + ".png: " + result.stdout.strip())  # e.g. "request id is EPSON-12 (1 file(s))"
        return self.answer(200, {"ok": True, "job": result.stdout.strip(), "file": path})

    # Send a small JSON answer back to the page
    def answer(self, code, data):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class Server(http.server.ThreadingHTTPServer):
    request_queue_size = 128  # how many connections may wait (the default is 5)
    allow_reuse_address = True


with Server(("", PORT), NoCacheHandler) as server:
    print("Photobooth: http://localhost:%d/  (Ctrl+C to stop)" % PORT)
    server.serve_forever()
