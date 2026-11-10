"""
Face detection module for Photobooth.
Uses OpenCV's YuNet deep learning face detector to locate faces in real time
and produce clean, padded, aspect-ratio-friendly cropped headshot images.
"""

import os
from typing import List, Tuple, Optional, Dict, Any
import numpy as np
import cv2


class FaceDetector:
    """Detects human faces and extracts cropped portrait images."""

    def __init__(
        self,
        model_path: str = "models/face_detection_yunet_2023mar.onnx",
        score_threshold: float = 0.6,
        nms_threshold: float = 0.3,
    ):
        self.model_path = os.path.abspath(model_path)
        self.score_threshold = score_threshold
        self.nms_threshold = nms_threshold
        self.detector: Optional[cv2.FaceDetectorYN] = None
        self._current_input_size: Optional[Tuple[int, int]] = None

        self._load_model()

    def _load_model(self) -> None:
        """Initializes the YuNet deep learning detector."""
        if not os.path.exists(self.model_path):
            print(f"[FaceDetector] Warning: Model file not found at {self.model_path}")
            self.detector = None
            return

        try:
            # Initialize with standard 640x480 resolution (will update dynamically per frame)
            self.detector = cv2.FaceDetectorYN_create(
                model=self.model_path,
                config="",
                input_size=(640, 480),
                score_threshold=self.score_threshold,
                nms_threshold=self.nms_threshold,
                top_k=10,
            )
            self._current_input_size = (640, 480)
            print(f"[FaceDetector] Loaded YuNet face detection model from: {self.model_path}")
        except Exception as e:
            print(f"[FaceDetector] Error initializing YuNet detector: {e}")
            self.detector = None

    def detect_faces(
        self,
        frame: np.ndarray,
        fallback_box: Optional[Tuple[int, int, int, int]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Detects faces in the given frame.

        Returns:
            List of dicts: [
                {
                    "box": (x, y, w, h), # int bounding box
                    "confidence": float,
                    "landmarks": list of 5 (x, y) tuples,
                }, ...
            ]
        """
        faces_list = []
        h, w = frame.shape[:2]

        if self.detector is not None:
            try:
                # Update input size if frame dimensions changed
                if self._current_input_size != (w, h):
                    self.detector.setInputSize((w, h))
                    self._current_input_size = (w, h)

                ret, faces = self.detector.detect(frame)
                if faces is not None and len(faces) > 0:
                    for face_data in faces:
                        # face_data format: [x, y, w, h, x_re, y_re, x_le, y_le, x_nt, y_nt, x_rc, y_rc, x_lc, y_lc, score]
                        fx, fy, fw, fh = map(int, face_data[:4])
                        score = float(face_data[-1])

                        # Clamp box to image bounds
                        fx = max(0, fx)
                        fy = max(0, fy)
                        fw = min(w - fx, fw)
                        fh = min(h - fy, fh)

                        if fw > 20 and fh > 20:
                            landmarks = []
                            for i in range(4, 14, 2):
                                landmarks.append((int(face_data[i]), int(face_data[i + 1])))

                            faces_list.append({
                                "box": (fx, fy, fw, fh),
                                "confidence": score,
                                "landmarks": landmarks,
                            })
            except Exception as e:
                print(f"[FaceDetector] Detection error: {e}")

        # If no real face was detected and a simulated fallback box was provided (e.g. demo mode)
        if len(faces_list) == 0 and fallback_box is not None:
            bx, by, bw, bh = fallback_box
            # Ensure within frame bounds
            bx = max(0, min(w - 20, bx))
            by = max(0, min(h - 20, by))
            bw = min(w - bx, bw)
            bh = min(h - by, bh)
            faces_list.append({
                "box": (bx, by, bw, bh),
                "confidence": 1.0,
                "landmarks": [],
            })

        # Sort faces: largest face first (primary subject), or left-to-right
        faces_list.sort(key=lambda f: f["box"][2] * f["box"][3], reverse=True)
        return faces_list

    @staticmethod
    def crop_face(
        frame: np.ndarray,
        box: Tuple[int, int, int, int],
        padding_ratio: float = 0.35,
        square: bool = True,
    ) -> np.ndarray:
        """
        Crops a face from the frame with flattering margins/padding.

        Args:
            frame: Full BGR image.
            box: (x, y, w, h) raw bounding box.
            padding_ratio: Percentage to expand bounding box (default 35% around head).
            square: If True, crops to a 1:1 aspect ratio square.

        Returns:
            Cropped BGR image slice.
        """
        img_h, img_w = frame.shape[:2]
        x, y, w, h = box

        # Find center of face
        cx = x + w / 2.0
        cy = y + h / 2.0

        # Expand box by padding
        padded_w = w * (1.0 + padding_ratio * 2.0)
        padded_h = h * (1.0 + padding_ratio * 2.0)

        if square:
            side = max(padded_w, padded_h)
            padded_w = side
            padded_h = side

        # Calculate bounding box coordinates
        x1 = int(round(cx - padded_w / 2.0))
        y1 = int(round(cy - padded_h / 2.0))
        x2 = int(round(cx + padded_w / 2.0))
        y2 = int(round(cy + padded_h / 2.0))

        # Clamp to frame boundaries
        crop_x1 = max(0, x1)
        crop_y1 = max(0, y1)
        crop_x2 = min(img_w, x2)
        crop_y2 = min(img_h, y2)

        cropped = frame[crop_y1:crop_y2, crop_x1:crop_x2]
        return cropped
