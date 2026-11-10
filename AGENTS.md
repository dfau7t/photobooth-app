# AGENTS.md — Photobooth Studio Developer & Agent Guide

This document provides essential instructions, architectural guidelines, technical constraints, and operating procedures for AI agents and developers working on the **Photobooth Studio** codebase.

---

## 1. Project Overview & Evolution

**Photobooth Studio** is a native desktop photobooth application built in Python 3 using Pygame, OpenCV, MediaPipe, and NumPy.

### Version History
- **V1**: Core photobooth lifecycle — camera capture, live mirrored preview, taking a photo, auto-saving to disk (`photos/`), 3-second animated countdown, shutter flash, synthesized audio effects, and face detection.
- **V2**: Group requirement & UI refinements — require $\ge 3$ detected faces to enable taking a photo; snap button disables and greys out when $< 3$ faces are detected; 3-second timer countdown is the default and only snap mode (instant snap removed); preview toast displays *only* the full image.
- **V3.Alpha**: Feature extraction, face collages & MediaPipe integration:
  - Switched face detection model to **Google MediaPipe FaceDetector** (BlazeFace short-range TFLite model at `models/blaze_face_short_range.tflite`) with GPU Metal / CPU XNNPACK acceleration.
  - Extracts 6 facial keypoints (right eye, left eye, nose tip, mouth center, right ear tragion, left ear tragion), deriving mouth corners to produce a standardized 7-landmark geometry.
  - Identifies and extracts facial features (eyes, nose, mouth, ears, and headshot) for all detected people.
  - Features are extracted leveled ($0^\circ$) and processed **in-memory** (no loose feature crops saved to disk).
  - Dynamically matches the rotation (tilt angle), position, and scale of grafted features to the base face image.
  - Tight, snug ear cutout placement hugging the lateral cheeks, utilizing direct ear landmarks when available.
  - Randomized feature selection across subjects for chimeric "Franken-Face" generation.
  - Shutter countdown persistence: once the shutter is triggered, the countdown runs to completion without aborting if a face temporarily flickers or drops below $\ge 3$.
  - Produces 3 Chimeric Hybrid portraits (`_hybrid1.jpg`, `_hybrid2.jpg`, `_hybrid3.jpg`) and a Master Face Collage poster (`_collage.jpg`) formatted for standard A4 sheet printing (1240×1754 px at 150 DPI).
  - Interactive Feature Breakdown Grid view (replaces the View Collage button): after taking a photo, the app automatically transitions to the Feature Breakdown Grid, highlighting the specific facial features contributed by each person for Collage 1, then Collage 2, and Collage 3.
  - **Slot Machine Feature Selection Animation**: Tactile slot machine reel animation selecting features row-by-row (eyes, nose, ears, lips) with ease-out deceleration and reel click sound effects. Once a feature locks in, it is highlighted in soft pastel pink (`#F6CBD9`), accompanied by a lock chime.
  - **Animated Constellation Connecting Line**: After row selections complete, an animated vibrant pink line (`#E44B7D`, 6px) smoothly sweeps through and connects each selected feature node, matching the Swiss minimalist design aesthetic from the reference layout.
  - **Resulting Hybrid Reveal**: Once the connecting line finishes, the chimeric hybrid portrait card and recipe breakdown are displayed with interactive controls (<kbd>SPACE</kbd> next/skip, <kbd>R</kbd> replay, <kbd>1</kbd>/<kbd>2</kbd>/<kbd>3</kbd> direct jump, <kbd>V</kbd> live camera).

---

## 2. Environment & Toolchain

- **OS**: macOS (Darwin arm64).
- **Python**: 3.9.6 located in virtual environment at `.venv/`.
- **Key Dependencies**:
  - `mediapipe` (version 1.2.2)
  - `opencv-python` (version 5.0.0.93)
  - `pygame` (version 2.6.1)
  - `numpy` (version 2.0.2)
- **Virtualenv Python**: Always invoke `.venv/bin/python3`.

### Essential Commands
```bash
# Launch application
./run.sh
# or directly:
.venv/bin/python3 photobooth.py

# Run headless automated test suite
PYTHONPATH=. .venv/bin/python3 tests/test_photobooth.py

# Check git status
git status -s
```

---

## 3. Architecture & Module Responsibilities

| Module | Primary Responsibility |
| :--- | :--- |
| `photobooth.py` | Main application coordinator, Pygame display loop, event routing, countdown overlay, live viewfinder, collage toggle view, and photo saving. |
| `camera.py` | OpenCV webcam capture (`cv2.VideoCapture`) with automated fallback to an animated simulated 3-person feed (with mock faces and landmarks) when hardware camera is unavailable or sandboxed. Key controls: <kbd>1</kbd>, <kbd>2</kbd>, <kbd>3</kbd> switch mock face counts. |
| `face_detector.py` | Google MediaPipe `vision.FaceDetector` using `models/blaze_face_short_range.tflite`. Extracts bounding boxes, confidence scores, and 7-point landmarks (`re`, `le`, `nose_tip`, `mouth_right`, `mouth_left`, `right_ear`, `left_ear`). |
| `feature_extractor.py` | Isolates facial features per person (`eyes`, `right_eye`, `left_eye`, `nose`, `mouth`, `left_ear`, `right_ear`, `ears`, `face`). Features are leveled using `_safe_crop_oriented()`. Returns landmarks, head tilt angle, and crop origins. |
| `slot_animator.py` | Manages timing, ease-out deceleration, and state transitions for the slot-machine feature selection reel and the sweeping animated connection line. Emits audio event triggers (`tick`, `lock`, `line_start`, `line_complete`). |
| `collage_generator.py` | Synthesizes randomized chimeric hybrid portraits with `_overlay_rotated_cutout()` matching base face rotation, scale, and landmark coordinates. Builds the A4 Master Face Collage poster (1240×1754) with the 3 hybrids centered horizontally, and renders the interactive Feature Breakdown Grid view. |
| `ui.py` | UI components: `Button` (with disabled/greyed-out, hover, and click states), `CountdownOverlay`, `FlashOverlay`, `PreviewToast`, viewfinder guide lines, and `draw_face_box()`. |
| `audio.py` | Synthesized countdown beeps and camera shutter sounds generated via `pygame.mixer` byte arrays, with graceful degradation when audio devices are inaccessible. |
| `tests/test_photobooth.py` | Automated headless test suite utilizing `SDL_VIDEODRIVER="dummy"` and the simulated camera fallback to verify 100% of app logic. |

---

## 4. Critical Technical Constraints & Rules

### 1. MediaPipe Model & Sandbox Execution
- MediaPipe 1.x uses `mediapipe.tasks.python.vision.FaceDetector` with TFLite models. The official short-range model is stored at `models/blaze_face_short_range.tflite`.
- **Rule**: Set `os.environ.setdefault("MPLCONFIGDIR", "/tmp")` before importing `mediapipe` or `cv2` to prevent sandbox permission errors with matplotlib cache directories.

### 2. Pygame Font Sandboxing on macOS
- `pygame.font.SysFont(...)` scans `/Users/.../Library/Fonts` and `/System/Library/Fonts`, triggering sandbox `PermissionError`.
- **Rule**: Never call `pygame.font.SysFont()`. Always use Pygame's built-in default font: `pygame.font.Font(None, font_size)`.

### 3. Pygame / SDL2 Fullscreen on macOS
- Arbitrary window dimensions in `pygame.display.set_mode((w, h), pygame.FULLSCREEN)` fail on macOS SDL2.
- **Rule**: When entering fullscreen, query desktop resolution with `pygame.display.Info()`:
  ```python
  info = pygame.display.Info()
  self.screen = pygame.display.set_mode((info.current_w, info.current_h), pygame.FULLSCREEN)
  ```
  Always save previous windowed dimensions before toggling so windowed mode can be cleanly restored.

### 4. Audio Initialization & Headless Fallback
- `pygame.mixer.init()` can throw `AudioDeviceGetProperty error 560947818` or crash when no audio output device is present (e.g., CI, sandbox, SSH).
- **Rule**: Wrap mixer initialization and sound playback in `try...except` blocks so the application runs silently without crashing if audio fails.

### 5. Library Import Ordering
- On macOS, importing `cv2` before `pygame` may emit duplicate `libSDL2-2.0.0.dylib` Objective-C symbol warnings.
- **Rule**: Always import `pygame` before `cv2` and `mediapipe` in scripts.

### 6. Storage & File Output Policy
- **Rule**: Do **NOT** save individual feature crops (`_person1_eyes.jpg`, etc.) to disk.
- Only save:
  1. Full group photo: `photobooth_YYYYMMDD_HHMMSS.jpg`
  2. Master Face Collage poster: `photobooth_YYYYMMDD_HHMMSS_collage.jpg`
  3. 3 Chimeric Hybrid portraits: `photobooth_YYYYMMDD_HHMMSS_hybrid1.jpg`, `_hybrid2.jpg`, `_hybrid3.jpg`
- The on-screen pop-up preview toast must show **only** the full group picture.

### 7. Feature Rotation & Ear Positioning
- **Rotation Matching**: In `CollageGenerator.create_chimeric_face()`, features are rotated by `-angle` in `cv2.getRotationMatrix2D` to match the base face tilt.
- **Ear Distance & Landmarks**: Ears must sit snugly against the cheeks. Uses MediaPipe tragion keypoints when available, with lateral distance clamping: `ear_dist = max(70, min(106, int(canvas_edist * 1.02)))`.
- **Randomization**: In `generate_randomized_hybrid()`, randomly sample contributors for each feature while ensuring at least two core features come from other participants for high chimeric variety. Standalone hybrid files must match the portraits on the master collage poster.

### 8. Countdown Persistence
- Once the countdown is triggered by pressing <kbd>SPACE</kbd> or clicking `SNAP`, the countdown **must not** abort even if face detection drops below 3 during the 3-second timer. It runs to completion and captures the photo.

---

## 5. Automated Headless Testing Pattern

All tests must run headlessly without a display server or physical camera:

```python
import os
os.environ["SDL_VIDEODRIVER"] = "dummy"

from photobooth import PhotoboothApp

def test_headless():
    app = PhotoboothApp(save_dir="test_output", min_faces=3)
    # The app automatically switches to camera.is_simulated = True
    # Test face counting via app.camera.set_simulated_face_count(1, 2, or 3)
    ...
```

Run test suite:
```bash
PYTHONPATH=. .venv/bin/python3 tests/test_photobooth.py
```

---

## 6. CLI Arguments Reference

| Flag | Default | Description |
| :--- | :--- | :--- |
| `--save-dir` | `"photos"` | Output directory for captured photos and collages. |
| `--camera` | `0` | Camera device index. |
| `--width` | `1280` | Capture width in pixels. |
| `--height` | `720` | Capture height in pixels. |
| `--min-faces` | `3` | Minimum number of detected faces required to enable snap. |
| `--no-mirror` | `False` | Disables horizontal mirror flip. |
| `--fullscreen`| `False` | Starts directly in fullscreen mode. |
