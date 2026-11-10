#!/usr/bin/env bash
# Photobooth Studio Launcher
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check if .venv exists, if not create it and install dependencies
if [ ! -d ".venv" ]; then
    echo "[Photobooth] Setting up virtual environment..."
    python3 -m venv .venv
    .venv/bin/pip install --upgrade pip
    .venv/bin/pip install -r requirements.txt
fi

# Run the application
echo "[Photobooth] Launching Photobooth Studio..."
PYTHONPATH=. .venv/bin/python3 photobooth.py "$@"
