# 📸 Photobooth Studio (v5)

A native desktop photobooth application built with Python, OpenCV, MediaPipe, and Pygame. Features live camera preview, a **3-face group requirement**, a **hands-up open-palm gesture shutter trigger** powered by MediaPipe Gesture Recognizer & Pose Landmarker, **in-memory facial feature extraction (eyes, ears, nose, and mouth)** for each person, **dynamic feature rotation & scale matching**, **chimeric face collage generation** featuring an interactive **Swiss-minimalist slot machine selection animation**, **A4-ready print posters**, an **animated multi-row waiting attractor screen carousel**, and **organized photo folder archiving**.

> [!NOTE]
> **Release: v5** — Introducing the **Hands-Up with Open Palms Shutter Trigger** using MediaPipe's `GestureRecognizer` and `PoseLandmarker` tasks, **simplified distraction-free UI**, and **organized subdirectories** in the `photos/` folder (`full_images/`, `cropped_faces/`, `collages/`).

---

## ⚡ Quick Start

### 1. Launch with One Command

Run the launcher script:
```bash
./run.sh
```

*(Or manually: `.venv/bin/python3 photobooth.py`)*

Photos and collages are automatically saved in organized folders in [`photos/`](photos/).

---

## 🎮 Controls

| Action | Trigger / Keyboard Shortcut | On-Screen Button |
| :--- | :--- | :--- |
| **Snap Photo (Primary)** | **Raise Hands with Open Palms** *(All participants)* | `SNAP (RAISE HANDS ✋)` *(Active when ≥ 3 faces)* |
| **Manual Snap Override** | <kbd>SPACE</kbd> or <kbd>RETURN</kbd> | Click `SNAP` button |
| **Slot Machine Animation** | <kbd>SPACE</kbd> skips spinning reel or advances collage; <kbd>R</kbd> replays; <kbd>1</kbd>/<kbd>2</kbd>/<kbd>3</kbd> selects collage | `NEXT COLLAGE` / `SKIP SPIN` |
| **Toggle Feature Grid / Camera** | <kbd>V</kbd> *(Or <kbd>ESC</kbd> to return to camera)* | `FEATURE GRID` / `LIVE CAMERA` |
| **Toggle Waiting Screen** | <kbd>W</kbd> *(Or auto-activates after 15s idle)* | Standby Attractor Screen |
| **Wake Up from Waiting** | Step into view, press <kbd>SPACE</kbd>, or tap screen | Resumes live camera viewfinder |
| **Toggle Fullscreen** | <kbd>F</kbd> | *(Keyboard shortcut)* |
| **Demo Controls** | <kbd>0</kbd>, <kbd>1</kbd>, <kbd>2</kbd>, <kbd>3</kbd> (face count) \| <kbd>H</kbd> (toggle hands up) | Demo / Simulation Mode |
| **Quit** | <kbd>Q</kbd> or <kbd>ESC</kbd> *(in camera mode)* | *(Keyboard shortcut)* |

---

## ✨ Features (v5)

### 1. Both Hands Up with Open Palms Shutter Trigger (MediaPipe Gesture & Pose)
- Touchless, intuitive group trigger condition: all participants must simultaneously raise **both** hands with open palms facing the camera.
- **Dual-Model Coordination**:
  - **MediaPipe PoseLandmarker** (`models/pose_landmarker_lite.task`): Tracks shoulder, elbow, and wrist joints to verify that each participant's hands are genuinely raised above their upper torso.
  - **MediaPipe GestureRecognizer** (`models/gesture_recognizer.task`): Classifies hand gestures in real time, detecting `Open_Palm` with high confidence.
- **Participant Association & Both-Hands Verification**:
  - Automatically groups raised hands with corresponding participants based on horizontal positioning across the camera view.
  - Verifies that each participant has two distinct open palms raised (one on either side of their centerline, or verified by pose wrist elevation).
- **Stability Hold Filter**: Once all participants have both open palms raised, a brief 0.40s hold duration is required before triggering, preventing accidental snaps.
- **Live Viewfinder UI Feedback**:
  - Highlights detected open palms with green tracking boxes and `✋ OPEN PALM` labels.
  - Displays dynamic pills above each participant: `🙌 READY (2/2)` in green, `✋ RAISE 2ND (1/2)` in amber if only one hand is raised, or `RAISE BOTH HANDS` in grey.
  - Shows a central status banner at the bottom with real-time progress (`🙌 RAISE BOTH HANDS: Open palms (1/3 ready)` $\to$ `🎉 ALL READY! Hold both hands steady...`).
- Manual backup: <kbd>SPACE</kbd> or clicking the on-screen snap button remains available.

### 2. Clean & Simplified Viewfinder UI
- Streamlined footer control bar focused entirely on the core experience (`SNAP (RAISE HANDS ✋)` and `FEATURE GRID / LIVE CAMERA`).
- Removed extraneous on-screen Fullscreen and Quit buttons to maximize display immersion (fullscreen toggle <kbd>F</kbd> and quit <kbd>Q</kbd>/<kbd>ESC</kbd> remain active via keyboard).

### 3. Organized Photo Storage Subdirectories
Captures are automatically categorized and saved into structured subfolders under `photos/`:
```
photos/
├── full_images/     # Full-resolution camera captures (photobooth_YYYYMMDD_HHMMSS.jpg)
├── cropped_faces/   # Square 1:1 face portraits (photobooth_YYYYMMDD_HHMMSS_person1.jpg, etc.)
└── collages/        # A4 Master Collage posters (_collage.jpg) and 3 hybrids (_hybrid1..3.jpg)
```
- Bootstrapping: The Waiting Screen automatically indexes portraits from `photos/cropped_faces/` across application restarts.
- Silent UI background saving: The pop-up preview toast continues displaying *only* the full group photo.

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

### 7. Animated Multi-Row Waiting Attractor Screen Carousel
- When the booth is idle (no faces seen for $\ge 15$ seconds), the app smoothly transitions into a full-screen **attractor waiting screen**.
- **Alternating Direction Marquee**: Displays a multi-row horizontal grid of all detected guest face crops collected throughout the runtime of the app (and loaded from disk across restarts).
  - Row 0 scrolls Left ($\leftarrow$)
  - Row 1 scrolls Right ($\rightarrow$)
  - Row 2 scrolls Left ($\leftarrow$)
  - Row 3 scrolls Right ($\rightarrow$)
- Features smooth, seamless infinite modular wrapping with staggered row velocities for an organic mechanical reel aesthetic.
- Includes a floating central standby card with breathing pulse border (`#E44B7D`), live guest count, and clear call-to-action ("Step Up to the Camera", "3 Faces Required for Chimeric Mix").
- **Zero Friction Wake-Up**: Instantly transitions back to the live camera viewfinder as soon as anyone steps into view, or when any key/click is registered.
- Can also be toggled manually at any time by pressing <kbd>W</kbd>.

### 8. Persistent Cropped Face Image Archiving
- When a photo is taken, individual square 1:1 face crops for all detected participants are automatically archived to disk (`_person1.jpg`, `_person2.jpg`, `_person3.jpg`).
- The on-screen pop-up preview toast continues to display *only* the full group photo cleanly without UI clutter.
- Stored face crops are automatically indexed by the Waiting Screen on startup, ensuring past guests' portraits immediately populate the carousel wall across app launches.

---

## ⚙️ Options & Customization

You can pass command-line arguments to customize your photobooth session:

```bash
# Change the required minimum number of faces (default: 3)
./run.sh --min-faces 3

# Configure idle timeout before Waiting Screen activates (default: 15.0s)
./run.sh --idle-timeout 15.0

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
├── gesture_detector.py   # MediaPipe GestureRecognizer & PoseLandmarker for hands-up trigger
├── feature_extractor.py  # Isolates and crops eyes, ears, nose, mouth & face per person
├── slot_animator.py      # Slot machine reel timing, deceleration & constellation line
├── waiting_screen.py     # Standby attractor screen carousel alternating row directions
├── collage_generator.py  # Synthesizes chimeric hybrid faces & A4 master collage (1240x1754)
├── audio.py              # Synthesized shutter, countdown, and slot machine sound effects
├── ui.py                 # UI components (buttons, countdown, flash, toast, face boxes)
├── photobooth.py         # Main application loop, collage viewer, and window manager
├── run.sh                # Executable launcher script
├── photos/               # Categorized storage: full_images/, cropped_faces/, collages/
├── models/               # MediaPipe neural models (BlazeFace, GestureRecognizer, PoseLandmarker)
├── AGENTS.md             # Architecture, constraints & developer guide
├── requirements.txt      # Python dependencies (mediapipe, opencv-python, pygame, numpy)
└── tests/
    └── test_photobooth.py# Headless automated test suite
```
