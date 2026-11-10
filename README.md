# 📸 Photobooth Studio (v2)

A native desktop photobooth application built with Python, OpenCV, and Pygame. Features live camera preview, countdown timer, screen flash, audio cues, real-time face detection, and a **3-face group requirement** where the snap button remains greyed out until 3 people are in frame.

---

## ⚡ Quick Start

### 1. Launch with One Command

Run the launcher script:
```bash
./run.sh
```

*(Or manually: `.venv/bin/python3 photobooth.py`)*

Photos are automatically saved to [`photos/`](photos/).

---

## 🎮 Controls

| Action | Keyboard Shortcut | On-Screen Button |
| :--- | :--- | :--- |
| **Snap Photo (3s Timer)** | <kbd>SPACE</kbd> or <kbd>RETURN</kbd> *(Active when ≥ 3 faces)* | `SNAP (3s TIMER)` *(Greys out if < 3 faces)* |
| **Toggle Fullscreen** | <kbd>F</kbd> | `FULLSCREEN` / `WINDOWED` |
| **Demo Face Count** | <kbd>1</kbd>, <kbd>2</kbd>, <kbd>3</kbd> *(Demo Mode only)* | Changes simulated face count |
| **Quit** | <kbd>Q</kbd> or <kbd>ESC</kbd> | `QUIT` |

---

## ✨ Features (v2)

- **Default 3-Second Timer Snap**: Every capture runs through the authentic 3-second animated countdown sequence (`3... 2... 1... SMILE!`) with audio beeps and screen flash. Instant snap has been removed so guests are always prepared.
- **3-Face Detection Requirement**: For a photo to be taken, at least 3 faces must be detected in the camera frame.
  - If less than 3 faces are visible, the **`SNAP`** button is automatically **greyed out and disabled**.
  - If faces drop below 3 during the countdown, the timer safely aborts and alerts users.
  - An on-screen prompt guides guests: `👥 GROUP MODE: 3 faces required to snap (X/3 detected)`.
  - Pressing <kbd>SPACE</kbd> or <kbd>RETURN</kbd> while below the threshold shows a soft alert without starting the timer.
- **Auto-Cropping for All Faces**: When the photo is taken, the booth saves the full high-res group picture and automatically extracts and crops individual square headshots for each detected person (`_face1.jpg`, `_face2.jpg`, `_face3.jpg`) directly to disk.
- **Full-Image Polaroid Preview**: The on-screen pop-up preview card displays only the full group picture cleanly, without showing the individual face cutouts.
- **Live Face Tracking**: Real-time bounding brackets lock onto faces as people enter the frame using OpenCV's YuNet deep neural network.
- **Demo / Fallback Mode**: If no camera is connected or macOS permissions are pending, seamlessly displays an animated test camera pattern with 3 mocked subjects. Press <kbd>1</kbd>, <kbd>2</kbd>, or <kbd>3</kbd> to test the greyed-out button behavior live!

---

## ⚙️ Options & Customization

You can pass command-line arguments to customize your photobooth session:

```bash
# Change the required minimum number of faces (default: 3)
./run.sh --min-faces 3

# Save photos to a custom folder
./run.sh --save-dir my_booth_photos

# Select a specific external USB camera (e.g. index 1)
./run.sh --camera 1

# Start directly in Fullscreen mode
./run.sh --fullscreen

# Change capture resolution
./run.sh --width 1920 --height 1080
```

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
