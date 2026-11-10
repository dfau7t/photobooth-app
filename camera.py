"""
Camera module for Photobooth.
Handles OpenCV camera capture, mirroring, fallback/demo simulation,
and saving images to disk.
"""

import time
import math
from typing import Optional, Tuple
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
        self.simulated_face_box: Optional[Tuple[int, int, int, int]] = None
        self._sim_start_time = time.time()

        self._initialize_camera()

    def _initialize_camera(self) -> None:
        """Attempt to open hardware camera or fallback to simulated pattern."""
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

        # Draw animated avatar / subject
        center_x = int(w / 2 + 30 * math.sin(elapsed * 1.5))
        center_y = int(h / 2 + 15 * math.cos(elapsed * 1.8))
        self.simulated_face_box = (center_x - 85, center_y - 85, 170, 190)

        # Avatar head & shoulders
        cv2.ellipse(
            frame,
            (center_x, center_y + 140),
            (140, 90),
            0,
            0,
            180,
            (120, 100, 220),
            -1,
            cv2.LINE_AA,
        )
        cv2.circle(frame, (center_x, center_y), 70, (235, 205, 185), -1, cv2.LINE_AA)
        cv2.circle(frame, (center_x - 22, center_y - 10), 8, (50, 40, 35), -1, cv2.LINE_AA)
        cv2.circle(frame, (center_x + 22, center_y - 10), 8, (50, 40, 35), -1, cv2.LINE_AA)

        # Smile
        cv2.ellipse(
            frame,
            (center_x, center_y + 18),
            (25, 16),
            0,
            0,
            180,
            (40, 30, 80),
            3,
            cv2.LINE_AA,
        )

        # Cheerful cheeks
        cv2.circle(frame, (center_x - 35, center_y + 12), 10, (160, 150, 240), -1, cv2.LINE_AA)
        cv2.circle(frame, (center_x + 35, center_y + 12), 10, (160, 150, 240), -1, cv2.LINE_AA)

        # Header banner
        banner_text = "SIMULATED CAMERA (DEMO MODE)"
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
        hint_text = "Check macOS System Settings > Privacy > Camera if using real webcam"
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

    def get_simulated_face_box(self) -> Optional[Tuple[int, int, int, int]]:
        """Returns the simulated face bounding box if running in demo mode."""
        return self.simulated_face_box if self.is_simulated else None

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
