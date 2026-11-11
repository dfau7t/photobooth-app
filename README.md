# 📸 Photobooth Studio (v3)

A native desktop photobooth application built with Python, OpenCV, MediaPipe, and Pygame. Features live camera preview, a **3-face group requirement**, a **3-second countdown timer**, **in-memory facial feature extraction (eyes, ears, nose, and mouth)** for each person, **dynamic feature rotation & scale matching**, and **chimeric face collage generation** featuring an interactive **Swiss-minimalist slot machine selection animation**, **A4-ready print posters**, and **hardware arcade button trigger via OSC (Arduino Nano ESP32)**.

> [!NOTE]
> **Release: v3** — Complete major release featuring Google MediaPipe 7-point facial landmark detection, in-memory leveled feature isolation, dynamic rotation matching to base portraits, ISO A4 poster layout ($1240 \times 1754$ px at 150 DPI), animated tactile Slot Machine Feature Breakdown Grid with constellation connecting line, and external hardware button shutter triggering via Open Sound Control (OSC 1.0 over UDP).

---

## ⚡ Quick Start

### 1. Launch with One Command

Run the launcher script:
```bash
./run.sh
```

*(Or manually: `.venv/bin/python3 photobooth.py`)*

Photos and collages are automatically saved to [`photos/`](photos/).

---

## 🎮 Controls

| Action | Keyboard Shortcut | On-Screen Button |
| :--- | :--- | :--- |
| **Snap Photo (3s Timer)** | <kbd>SPACE</kbd> or <kbd>RETURN</kbd> *(Active when ≥ 3 faces)* | `SNAP (3s TIMER)` *(Greys out if < 3 faces)* |
| **External Arcade Button** | **Physical Button** *(Arduino ESP32 OSC)* | Triggers shutter / advances collages |
| **Slot Machine Animation** | <kbd>SPACE</kbd> skips spinning reel or advances collage; <kbd>R</kbd> replays; <kbd>1</kbd>/<kbd>2</kbd>/<kbd>3</kbd> selects collage | `NEXT COLLAGE` / `SKIP SPIN` |
| **Toggle Feature Grid / Camera** | <kbd>V</kbd> *(Or <kbd>ESC</kbd> to return to camera)* | `FEATURE GRID` / `LIVE CAMERA` |
| **Toggle Fullscreen** | <kbd>F</kbd> | `FULLSCREEN` / `WINDOWED` |
| **Demo Face Count** | <kbd>1</kbd>, <kbd>2</kbd>, <kbd>3</kbd> *(Demo Mode only)* | Changes simulated face count |
| **Quit** | <kbd>Q</kbd> or <kbd>ESC</kbd> *(in camera mode)* | `QUIT` |

---

## ✨ Features (v3)

### 1. Facial Feature Extraction with Rotation Alignment
When 3 faces are detected and the photo is snapped, the system isolates and crops individual facial anatomy in-memory for every person:
- **Eyes**: Wide panoramic strip capturing both eyes, leveled and oriented.
- **Nose**: Centered crop of the nose and bridge.
- **Mouth**: Lips and smile region.
- **Ears**: Dual-ear composite showing both left and right ear profiles.
- **Full Face**: Square portrait headshot preserving original face geometry and tilt angle.
*(Features are processed cleanly in-memory to build the collages without cluttering disk with loose feature files).*

### 2. Randomized & Rotation-Matched Chimeric Hybrid Faces ("Franken-Faces")
The collage generator transplants features across subjects onto base portraits. Crucially, **each feature is randomly selected from all participants** and **dynamically matches the rotation angle, position, and proportions of the base face image**:
- **Snug Anatomical Ear Positioning**: Ear cutouts now directly hug the lateral cheeks of the base head (spanning eye-to-nose level along the head tilt axis) rather than floating away from the face.
- **Rotation Matching**: If the base face is tilted (e.g. 15° to the side), all grafted features (eyes strip, nose, mouth, and lateral ears) are rotated to match the base face's head tilt angle.
- **Randomized Feature Selection**: Each hybrid randomly samples eyes, nose, mouth, and ears across all detected people, ensuring varied, chaotic, and unique "Franken-Face" combinations every time a photo is taken.
- **Synchronized Generation**: Standalone hybrid images (`_hybrid1.jpg`, `_hybrid2.jpg`, `_hybrid3.jpg`) and the portraits on the Master Face Collage poster (`_collage.jpg`) are completely synchronized.

### 3. Master Face Collage Poster in Standard A4 Sheet Format (1240 × 1754)
Assembles a complete commemorative photobooth print (`_collage.jpg`) formatted for direct printing onto a standard A4 sheet ($210 \times 297\text{ mm}$ at 150 DPI):
- Exact A4 aspect ratio ($1 : \sqrt{2} \approx 1 : 1.414$) for distortion-free, borderless printing.
- The 3 Chimeric Hybrid portraits are stacked vertically and centered horizontally with symmetric margins.
- Clean header and footer branding.

### 4. Slot Machine Feature Selection & Animated Line Passing Through
Directly inspired by the Swiss minimalist reference design:
- Immediately after capturing a photo, the app automatically transitions to the **Feature Breakdown Grid** (`#EEEEEC` neutral canvas with `FACE.MESH BOOTH` header).
- **Slot Machine Feature Selection Animation**: An animated slot machine reel spins row-by-row selecting features (eyes, nose, ears, lips/mouth), slowing down with ease-out deceleration and reel click sound effects. Once a row locks in, the cell illuminates in soft pastel pink (`#F6CBD9`), the bottom-left label lights up in pink (`#E44B7D`), and a pleasant chime plays.
- **Animated Constellation Line**: After all 4 rows are selected, a vibrant pink line (`#E44B7D`, 6px) smoothly sweeps through and connects each selected feature node ($P_{\text{eyes}} \to P_{\text{nose}} \to P_{\text{ears}} \to P_{\text{lips}}$) with a glowing lead tip.
- **Recipe & Hybrid Reveal**: The right-hand panel displays the active selection recipe with vector arrows (`eyes ← person02`, etc.) and presents the assembled chimeric hybrid portrait.
- **Playback Controls**: Press <kbd>SPACE</kbd> to skip the spin or advance to the next collage, <kbd>R</kbd> to replay the animation, <kbd>1</kbd>/<kbd>2</kbd>/<kbd>3</kbd> to jump between collages, or <kbd>V</kbd> to toggle back to the live camera.

### 5. Google MediaPipe Neural Face & Feature Landmark Detection
- Powered by Google MediaPipe's BlazeFace neural detector (`models/blaze_face_short_range.tflite`) with GPU Metal / CPU XNNPACK acceleration on macOS Apple Silicon.
- Detects high-precision 6-keypoint facial geometry (eyes, nose, mouth center, and ear tragions), generating a 7-point anatomical coordinate system for pixel-perfect feature alignment and snug ear positioning.

### 6. 3-Face Requirement, 3-Second Timer & Countdown Persistence
- At least 3 faces must be detected in the camera frame to initiate the snap.
- If less than 3 faces are visible, the **`SNAP`** button greys out and countdown cannot be started.
- Once the 3-second countdown is triggered by pressing <kbd>SPACE</kbd> or clicking `SNAP`, countdown persists to completion even if someone turns their head or detection temporarily dips.
- Default 3-second animated countdown sequence with audio beeps and screen flash.
- On-screen snap preview toast continues to display *only* the full group photo cleanly.

### 7. Hardware Shutter Trigger (Arduino Nano ESP32 via OSC)
- Support for physical arcade buttons and tactile hardware triggers via Open Sound Control (OSC 1.0 over UDP).
- Built-in zero-dependency UDP listener binds to `0.0.0.0:8000` listening for `/button/press` packets sent by the included Arduino project (`Arduino_Button/OSC_Button/`).
- Dispatches hardware triggers safely to the main Pygame UI thread with automatic debouncing.
- In camera mode, pressing the physical button triggers the 3-second countdown (when $\ge 3$ faces are detected).
- In Feature Breakdown Grid view, pressing the physical button skips the spinning animation or advances to the next collage.

---

## ⚙️ Options & Customization

You can pass command-line arguments to customize your photobooth session:

```bash
# Change the required minimum number of faces (default: 3)
./run.sh --min-faces 3

# Configure OSC hardware button port and address (defaults: port 8000, address /button/press)
./run.sh --osc-port 8000 --osc-address /button/press

# Disable OSC hardware button listener
./run.sh --no-osc

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
├── camera.py             # OpenCV webcam capture & fallback simulation (with landmarks)
├── face_detector.py      # Google MediaPipe FaceDetector with 7-point facial landmarks
├── feature_extractor.py  # Isolates and crops eyes, ears, nose, mouth & face per person
├── slot_animator.py      # Slot machine reel timing, deceleration & constellation line
├── osc_receiver.py       # Zero-dependency OSC UDP listener for Arduino hardware button
├── collage_generator.py  # Synthesizes chimeric hybrid faces & A4 master collage (1240x1754)
├── audio.py              # Synthesized shutter, countdown, and slot machine sound effects
├── ui.py                 # UI components (buttons, countdown, flash, toast, face boxes)
├── photobooth.py         # Main application loop, collage viewer, and window manager
├── run.sh                # Executable launcher script
├── photos/               # Target folder where captured photos & collages are saved
├── models/               # MediaPipe BlazeFace short-range TFLite model weights
├── Arduino_Button/       # PlatformIO firmware for Arduino Nano ESP32 Wi-Fi button
│   └── OSC_Button/
├── AGENTS.md             # Architecture, constraints & developer guide
├── requirements.txt      # Python dependencies (mediapipe, opencv-python, pygame, numpy)
└── tests/
    └── test_photobooth.py# Headless automated test suite
```
