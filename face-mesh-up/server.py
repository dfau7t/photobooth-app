#!/usr/bin/env python3
"""
server.py — tiny local web + print server for Face Mesh-up Booth.

Run this instead of `python3 -m http.server 8000`:
    cd face-mesh-up
    python3 server.py

Then open http://localhost:8000 in Chrome.

Why we need this:
  A browser page cannot talk to a physical printer silently on its own.
  This script serves the web app files AND listens for POST /print,
  saves the collage PNG into prints/, and sends it to your macOS printer
  using the built-in `lp` command (no print dialog popup).
"""

import base64
import json
import os
import re
import subprocess
import sys
import tempfile
from datetime import datetime
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

# Always serve the folder where server.py lives (face-mesh-up/),
# even if you run it from the parent folder.
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
PRINTS_DIR = os.path.join(ROOT_DIR, "prints")
DEFAULT_PORT = 8000
MAX_BODY_BYTES = 25 * 1024 * 1024  # 25 MB safety limit


def safe_filename(name):
    """Keep only letters, numbers, dots, dashes and underscores."""
    cleaned = re.sub(r"[^A-Za-z0-9._-]", "_", name or "")
    if not cleaned.endswith(".png"):
        cleaned += ".png"
    if cleaned == ".png":
        cleaned = f"facemeshup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
    return cleaned


def get_printer_status():
    """Ask macOS CUPS (`lpstat`) which printers exist and which is default."""
    try:
        res = subprocess.run(
            ["lpstat", "-p", "-d"],
            capture_output=True,
            text=True,
            timeout=5,
        )
    except FileNotFoundError:
        return {
            "ok": False,
            "hasPrinter": False,
            "defaultPrinter": "",
            "printers": [],
            "error": "`lpstat` command not found (macOS/Linux CUPS is required for printing).",
        }
    except subprocess.TimeoutExpired:
        return {
            "ok": False,
            "hasPrinter": False,
            "defaultPrinter": "",
            "printers": [],
            "error": "Timed out checking printer status.",
        }

    printers = []
    default_printer = ""
    for line in res.stdout.splitlines():
        line = line.strip()
        # Example: "printer Canon_SELPHY_CP1500 is idle.  enabled since ..."
        if line.startswith("printer "):
            parts = line.split()
            if len(parts) >= 2:
                printers.append(parts[1])
        # Example: "system default destination: Canon_SELPHY_CP1500"
        elif line.startswith("system default destination:"):
            default_printer = line.split(":", 1)[1].strip()

    return {
        "ok": True,
        "hasPrinter": bool(default_printer or printers),
        "defaultPrinter": default_printer,
        "printers": printers,
    }


def send_file_to_printer(
    file_path,
    printer="",
    media="",
    media_type="",
    duplex="",
    quality="",
    color_mode="",
    fit_to_page=True,
):
    """Run macOS `lp` to print one PNG file silently."""
    cmd = ["lp"]

    # Reject values starting with '-' so they cannot be treated as extra flags
    if printer and not printer.startswith("-"):
        cmd.extend(["-d", printer])

    if fit_to_page:
        cmd.extend(["-o", "fit-to-page"])

    if media and not media.startswith("-"):
        cmd.extend(["-o", f"media={media}"])

    if media_type and not media_type.startswith("-"):
        cmd.extend(["-o", f"MediaType={media_type}"])

    if duplex and not duplex.startswith("-"):
        if duplex.lower() in ("none", "one-sided"):
            cmd.extend(["-o", "sides=one-sided", "-o", "Duplex=None"])
        else:
            cmd.extend(["-o", f"Duplex={duplex}"])

    if quality and not quality.startswith("-"):
        cmd.extend(["-o", f"cupsPrintQuality={quality}"])

    if color_mode and not color_mode.startswith("-"):
        if color_mode.lower() in ("gray", "grayscale", "monochrome"):
            cmd.extend(["-o", "print-color-mode=monochrome", "-o", "ColorModel=Gray"])
        elif color_mode.lower() in ("rgb", "color"):
            cmd.extend(["-o", "print-color-mode=color", "-o", "ColorModel=RGB"])
        else:
            cmd.extend(["-o", f"ColorModel={color_mode}"])

    cmd.append(file_path)
    print(f"[print] Running: {' '.join(cmd)}")

    try:
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
    except FileNotFoundError:
        return False, "", "`lp` command not found on this computer."
    except subprocess.TimeoutExpired:
        return False, "", "Printing timed out while talking to `lp`."

    if res.returncode != 0:
        err = (res.stderr or res.stdout or "Unknown `lp` error").strip()
        return False, "", err

    return True, res.stdout.strip(), ""


class BoothHandler(SimpleHTTPRequestHandler):
    """Serves static files plus /print/status and /print."""

    def end_headers(self):
        # "Don't keep a copy, ask me again every time": otherwise, after a
        # change, the browser can mix old and new .js files and a screen breaks
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, format, *args):
        pass  # keep the terminal quiet (the page asks for ~40 files at once); prints are still logged

    def send_json(self, status_code, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.split("?")[0] == "/print/status":
            self.send_json(200, get_printer_status())
            return
        super().do_GET()

    def do_POST(self):
        if self.path.split("?")[0] != "/print":
            self.send_json(404, {"ok": False, "error": "Unknown endpoint"})
            return

        # 1. Read and parse JSON request
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self.send_json(400, {"ok": False, "error": "Invalid Content-Length"})
            return

        if length <= 0 or length > MAX_BODY_BYTES:
            self.send_json(400, {"ok": False, "error": "Request body is empty or too large"})
            return

        raw = self.rfile.read(length)
        try:
            data = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self.send_json(400, {"ok": False, "error": "Invalid JSON body"})
            return

        # 2. Decode the PNG data URL sent from the browser canvas
        image_data = data.get("image", "")
        prefix = "data:image/png;base64,"
        if not isinstance(image_data, str) or not image_data.startswith(prefix):
            self.send_json(400, {"ok": False, "error": "Expected PNG data URL"})
            return

        try:
            png_bytes = base64.b64decode(image_data[len(prefix) :], validate=True)
        except Exception:
            self.send_json(400, {"ok": False, "error": "Could not decode PNG image"})
            return

        # 3. Write the PNG to disk (either prints/ or a temporary file)
        save_copy = bool(data.get("saveCopy", True))
        filename = safe_filename(data.get("filename", ""))
        saved_rel = ""
        temp_path = None

        if save_copy:
            os.makedirs(PRINTS_DIR, exist_ok=True)
            file_path = os.path.join(PRINTS_DIR, filename)
            with open(file_path, "wb") as f:
                f.write(png_bytes)
            saved_rel = os.path.join("prints", filename)
        else:
            tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
            tmp.write(png_bytes)
            tmp.close()
            file_path = tmp.name
            temp_path = tmp.name

        # 4. Send the PNG file to macOS `lp`
        printer = str(data.get("printer", "")).strip()
        media = str(data.get("media", "")).strip()
        media_type = str(data.get("mediaType", "")).strip()
        duplex = str(data.get("duplex", "")).strip()
        quality = str(data.get("quality", "")).strip()
        color_mode = str(data.get("colorMode", "")).strip()
        fit_to_page = bool(data.get("fitToPage", True))

        try:
            ok, job, error = send_file_to_printer(
                file_path,
                printer=printer,
                media=media,
                media_type=media_type,
                duplex=duplex,
                quality=quality,
                color_mode=color_mode,
                fit_to_page=fit_to_page,
            )
        finally:
            if temp_path and os.path.exists(temp_path):
                os.remove(temp_path)

        if ok:
            print(f"[print] Sent {filename} -> {job or 'printer'}")
            self.send_json(
                200,
                {
                    "ok": True,
                    "message": "Sent to printer",
                    "job": job,
                    "savedTo": saved_rel,
                },
            )
        else:
            print(f"[print] Failed for {filename}: {error}")
            hint = ""
            if "no default destination" in error.lower():
                hint = "Set a default printer in macOS System Settings -> Printers & Scanners."
            self.send_json(
                503,
                {
                    "ok": False,
                    "error": error,
                    "hint": hint,
                    "savedTo": saved_rel,
                },
            )


class BoothServer(ThreadingHTTPServer):
    # The page asks for ~40 files at once: let plenty of them wait
    # (the default is 5, and a refused file silently breaks a screen)
    request_queue_size = 128
    allow_reuse_address = True


def main():
    port = DEFAULT_PORT
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            print(f"Usage: python3 server.py [port]")
            sys.exit(1)

    handler = partial(BoothHandler, directory=ROOT_DIR)
    server = BoothServer(("127.0.0.1", port), handler)

    status = get_printer_status()
    print(f"Face Mesh-up Booth running at: http://localhost:{port}")
    if status.get("defaultPrinter"):
        print(f"Default printer: {status['defaultPrinter']}")
    elif status.get("printers"):
        print(f"Printers found (no default set): {', '.join(status['printers'])}")
    else:
        print("No printer configured in macOS yet (prints will still be saved in prints/).")
    print("Press Ctrl+C to stop.")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server.")
        server.server_close()


if __name__ == "__main__":
    main()
