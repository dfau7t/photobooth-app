# 📸 Photobooth Studio (v1)

A native desktop photobooth application built with Python, OpenCV, and Pygame. Mimics an authentic photobooth experience with live mirrored camera preview, countdown timer, screen flash effect, audio cues, and instant photo saving to disk.

---

## ⚡ Quick Start

### 1. Launch with One Command

Run the included launcher script:
```bash
./run.sh
```

Or run manually using the virtual environment:
```bash
.venv/bin/python3 photobooth.py
```

Photos are automatically saved to the [`photos/`](photos/) folder.

---

## 🎮 Controls

| Action | Keyboard Shortcut | On-Screen Button |
| :--- | :--- | :--- |
| **Instant Photo** | <kbd>SPACE</kbd> | `SNAP PHOTO` |
| **3s Countdown** | <kbd>C</kbd> or <kbd>RETURN</kbd> | `3s TIMER` |
| **Toggle Fullscreen** | <kbd>F</kbd> | `FULLSCREEN` |
| **Quit** | <kbd>Q</kbd> or <kbd>ESC</kbd> | `QUIT` |

---

## ✨ Features

- **Live Face Detection & Auto-Cropping**: Powered by OpenCV's YuNet deep neural network. Automatically detects faces in real-time, displays tracking boxes on screen, and saves a flattering square headshot crop alongside the full-size image (e.g. `photobooth_..._face.jpg`). If multiple people are in the shot, each face is cropped and saved individually.
- **Live Camera Access & Mirroring**: Real-time webcam feed with horizontal flip so moving left/right feels like looking into a mirror.
- **Intelligent Camera Detection**: Automatically detects hardware camera at index `0`, `1`, or `2`.
- **Demo / Fallback Mode**: If no camera is connected or macOS permissions are pending, seamlessly displays an animated test camera pattern with full UI interactivity so the app never crashes.
- **3-Second Countdown**: Classic `3... 2... 1... SMILE!` countdown with pulse animations and audio beeps.
- **Shutter Flash & Sound**: Realistic camera flash effect and shutter sound on capture.
- **Auto-Save to Disk**: High-resolution photos are stamped with the date and time (`photos/photobooth_YYYYMMDD_HHMMSS.jpg`).
- **Instant Photo & Face Preview**: Displays a floating polaroid card showing both the full captured image and the cropped face avatar.

---

## ⚙️ Options & Customization

You can pass command-line arguments to customize your photobooth session:

```bash
# Save photos to a custom folder
./run.sh --save-dir my_booth_photos

# Select a specific external USB camera (e.g. index 1)
./run.sh --camera 1

# Start directly in Fullscreen mode
./run.sh --fullscreen

# Change capture resolution
./run.sh --width 1920 --height 1080

# Disable mirror reflection
./run.sh --no-mirror
```

---

## 🍎 macOS Camera Permissions

When running on macOS for the first time, your terminal application (e.g. Terminal, iTerm, VS Code, or Antigravity) will request camera access:

1. Look for the system prompt: *"Terminal would like to access the camera"*. Click **OK**.
2. If the prompt does not appear or access was denied previously, open:
   **System Settings** > **Privacy & Security** > **Camera**
3. Ensure your terminal or IDE application toggle is turned **ON**.

---

## 📂 Project Structure

```
photobooth-app/
├── camera.py             # OpenCV webcam capture & fallback simulation
├── audio.py              # Synthesized shutter and countdown sound effects
├── ui.py                 # UI components (buttons, countdown, flash, toast)
├── photobooth.py         # Main application loop and window manager
├── run.sh                # Executable launcher script
├── photos/               # Target folder where captured photos are saved
├── requirements.txt      # Python dependencies (opencv-python, pygame, numpy)
└── tests/
    └── test_photobooth.py# Headless automated test suite
```
