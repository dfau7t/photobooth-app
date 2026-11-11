"""
Camera module for Photobooth.
Handles OpenCV camera capture, mirroring, fallback/demo simulation,
and saving images to disk.
"""

import os
import time
import math
from typing import Optional, Tuple, List
import pygame
import cv2
import numpy as np


class Camera:
    """Manages video capture device with automatic fallback to simulated video."""

    def __init__(
        self,
        camera_index: int = 0,
        width: int = 1280,
        height: int = 720,
        mirror: bool = True,
    ):
        self.preferred_index = camera_index
        self.target_width = width
        self.target_height = height
        self.mirror = mirror

        self.cap: Optional[cv2.VideoCapture] = None
        self.active_index: Optional[int] = None
        self.is_simulated = False
        self.simulated_face_count: int = 3
        self.simulated_face_boxes: List[Tuple[int, int, int, int]] = []
        self.simulated_face_landmarks: List[List[Tuple[int, int]]] = []
        self._sim_start_time = time.time()

        self._initialize_camera()

    def _initialize_camera(self) -> None:
        """Attempt to open hardware camera or fallback to simulated pattern."""
        if os.environ.get("SDL_VIDEODRIVER") == "dummy" or os.environ.get("HEADLESS_TEST"):
            self.cap = None
            self.is_simulated = True
            return

        candidate_indices = [self.preferred_index]
        for idx in (0, 1, 2):
            if idx not in candidate_indices:
                candidate_indices.append(idx)

        for idx in candidate_indices:
            try:
                cap = cv2.VideoCapture(idx)
                if cap.isOpened():
                    cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.target_width)
                    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.target_height)
                    ret, test_frame = cap.read()
                    if ret and test_frame is not None:
                        self.cap = cap
                        self.active_index = idx
                        self.is_simulated = False
                        print(
                            f"[Camera] Connected to hardware camera index {idx} "
                            f"({int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))}x{int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))})"
                        )
                        return
                    cap.release()
            except Exception as e:
                print(f"[Camera] Index {idx} probe error: {e}")

        # If we reach here, hardware camera is unavailable
        self.cap = None
        self.is_simulated = True
        print(
            "[Camera] No hardware camera accessible. Running in Simulated Camera mode.\n"
            "         (On macOS, ensure Camera permissions are granted to your Terminal / IDE "
            "in System Settings > Privacy & Security > Camera)"
        )

    def read_frame(self) -> Tuple[bool, np.ndarray]:
        """
        Reads a frame.
        Returns:
            (success, bgr_image)
        """
        if not self.is_simulated and self.cap is not None:
            ret, frame = self.cap.read()
            if ret and frame is not None:
                if self.mirror:
                    frame = cv2.flip(frame, 1)
                return True, frame
            # If reading failed mid-stream, switch to simulated
            print("[Camera] Frame read failed from hardware; falling back to simulated feed.")
            self.is_simulated = True

        # Simulated frame generation
        frame = self._generate_simulated_frame()
        return True, frame

    def _generate_simulated_frame(self) -> np.ndarray:
        """Creates a smooth animated simulated photobooth preview frame."""
        w, h = self.target_width, self.target_height
        elapsed = time.time() - self._sim_start_time

        # Dark gradient background
        frame = np.zeros((h, w, 3), dtype=np.uint8)
        y_indices = np.linspace(25, 60, h, dtype=np.uint8)[:, None]
        frame[:, :, 0] = y_indices  # Blue channel
        frame[:, :, 1] = y_indices // 2
        frame[:, :, 2] = y_indices // 3

        # Draw a retro photobooth viewfinder grid
        grid_color = (60, 60, 70)
        cv2.line(frame, (w // 3, 0), (w // 3, h), grid_color, 1)
        cv2.line(frame, (2 * w // 3, 0), (2 * w // 3, h), grid_color, 1)
        cv2.line(frame, (0, h // 3), (w, h // 3), grid_color, 1)
        cv2.line(frame, (0, 2 * h // 3), (w, 2 * h // 3), grid_color, 1)

        # Draw animated avatars (supports 1, 2, or 3 subjects in booth)
        self.simulated_face_boxes = []
        self.simulated_face_landmarks = []

        def draw_avatar(cx, cy, shirt_col, skin_col, scale=1.0):
            r = int(55 * scale)
            # Shoulders / body
            cv2.ellipse(
                frame,
                (cx, cy + int(120 * scale)),
                (int(115 * scale), int(75 * scale)),
                0,
                0,
                180,
                shirt_col,
                -1,
                cv2.LINE_AA,
            )
            # Head
            cv2.circle(frame, (cx, cy), r, skin_col, -1, cv2.LINE_AA)
            # Eyes
            eye_off_x = int(18 * scale)
            eye_off_y = int(8 * scale)
            re_pt = (cx - eye_off_x, cy - eye_off_y)
            le_pt = (cx + eye_off_x, cy - eye_off_y)
            cv2.circle(frame, re_pt, int(6 * scale), (45, 40, 35), -1, cv2.LINE_AA)
            cv2.circle(frame, le_pt, int(6 * scale), (45, 40, 35), -1, cv2.LINE_AA)
            # Smile
            cv2.ellipse(
                frame,
                (cx, cy + int(14 * scale)),
                (int(20 * scale), int(12 * scale)),
                0,
                0,
                180,
                (40, 30, 80),
                2,
                cv2.LINE_AA,
            )
            # Cheerful cheeks
            cv2.circle(frame, (cx - int(28 * scale), cy + int(10 * scale)), int(8 * scale), (160, 150, 240), -1, cv2.LINE_AA)
            cv2.circle(frame, (cx + int(28 * scale), cy + int(10 * scale)), int(8 * scale), (160, 150, 240), -1, cv2.LINE_AA)

            box_size = int(140 * scale)
            self.simulated_face_boxes.append((cx - box_size // 2, cy - box_size // 2, box_size, box_size))

            nose_pt = (cx, cy + int(4 * scale))
            mr_pt = (cx - int(12 * scale), cy + int(14 * scale))
            ml_pt = (cx + int(12 * scale), cy + int(14 * scale))
            self.simulated_face_landmarks.append([re_pt, le_pt, nose_pt, mr_pt, ml_pt])

        sway = int(20 * math.sin(elapsed * 1.5))
        bob = int(10 * math.cos(elapsed * 1.8))

        if self.simulated_face_count == 0:
            pass
        elif self.simulated_face_count == 1:
            draw_avatar(w // 2 + sway, h // 2 + bob, (120, 100, 220), (235, 205, 185), scale=1.1)
        elif self.simulated_face_count == 2:
            draw_avatar(w // 2 - 170 + sway, h // 2 + bob, (210, 100, 110), (235, 205, 185), scale=1.0)
            draw_avatar(w // 2 + 170 + sway, h // 2 - bob, (80, 170, 120), (240, 215, 195), scale=1.0)
        else:  # 3 faces
            draw_avatar(w // 2 - 250 + sway, h // 2 + 15 + bob, (210, 100, 110), (235, 205, 185), scale=0.95)
            draw_avatar(w // 2 + sway, h // 2 - 20 - bob, (120, 100, 220), (245, 215, 190), scale=1.05)
            draw_avatar(w // 2 + 250 + sway, h // 2 + 20 + bob, (80, 170, 120), (230, 200, 180), scale=0.95)

        # Header banner
        banner_text = f"SIMULATED CAMERA ({self.simulated_face_count} Faces Mocked)"
        cv2.rectangle(frame, (0, 0), (w, 48), (20, 20, 25), -1)
        cv2.putText(
            frame,
            banner_text,
            (24, 32),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.75,
            (0, 200, 255),
            2,
            cv2.LINE_AA,
        )

        # Status & hint
        hint_text = "Demo: Press 1, 2, or 3 to change face count | Use real webcam for physical faces"
        cv2.putText(
            frame,
            hint_text,
            (24, h - 25),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (170, 170, 180),
            1,
            cv2.LINE_AA,
        )

        # Timestamp
        curr_time = time.strftime("%Y-%m-%d %H:%M:%S")
        cv2.putText(
            frame,
            curr_time,
            (w - 250, 32),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.65,
            (200, 200, 200),
            1,
            cv2.LINE_AA,
        )

        return frame

    def set_simulated_face_count(self, count: int) -> None:
        """Sets number of simulated faces to render (0, 1, 2, or 3)."""
        self.simulated_face_count = max(0, min(5, count))

    def get_simulated_face_boxes(self) -> List[Tuple[int, int, int, int]]:
        """Returns the simulated face bounding boxes if running in demo mode."""
        return self.simulated_face_boxes if self.is_simulated else []

    def get_simulated_face_landmarks(self) -> List[List[Tuple[int, int]]]:
        """Returns the simulated face landmarks if running in demo mode."""
        return self.simulated_face_landmarks if self.is_simulated else []

    def get_simulated_face_box(self) -> Optional[Tuple[int, int, int, int]]:
        """Returns the primary simulated face bounding box."""
        boxes = self.get_simulated_face_boxes()
        return boxes[0] if boxes else None

    def save_frame(self, frame: np.ndarray, file_path: str) -> bool:
        """Saves the given frame as a JPEG/PNG image."""
        try:
            return cv2.imwrite(file_path, frame)
        except Exception as e:
            print(f"[Camera] Failed to save frame to {file_path}: {e}")
            return False

    def release(self) -> None:
        """Releases the camera hardware."""
        if self.cap is not None:
            self.cap.release()
            self.cap = None
