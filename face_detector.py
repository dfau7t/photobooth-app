"""
Face detection module for Photobooth.
Uses Google MediaPipe's FaceDetector (BlazeFace short-range model) to locate faces
in real time and extract bounding boxes, confidence scores, and facial keypoints.
Produces clean, padded, aspect-ratio-friendly cropped headshot images.
"""

import os
# Ensure matplotlib / font caches don't trigger permission warnings in sandbox
os.environ["MPLCONFIGDIR"] = "/tmp"

import math
from typing import List, Tuple, Optional, Dict, Any
import numpy as np
import cv2
import mediapipe as mp
from mediapipe.tasks import python as mp_tasks
from mediapipe.tasks.python import vision


class FaceDetector:
    """Detects human faces and extracts cropped portrait images using Google MediaPipe."""

    def __init__(
        self,
        model_path: str = "models/blaze_face_short_range.tflite",
        score_threshold: float = 0.5,
        nms_threshold: float = 0.3,
        **kwargs,
    ):
        base_dir = os.path.dirname(os.path.abspath(__file__))
        default_model = os.path.join(base_dir, "models", "blaze_face_short_range.tflite")

        candidate_path = os.path.abspath(model_path)
        # If model_path points to an ONNX model or does not exist, use default TFLite model
        if candidate_path.endswith(".onnx") or not os.path.exists(candidate_path):
            candidate_path = os.path.join(base_dir, model_path)
        if candidate_path.endswith(".onnx") or not os.path.exists(candidate_path):
            candidate_path = default_model

        self.model_path = candidate_path
        self.score_threshold = score_threshold
        self.nms_threshold = nms_threshold
        self.detector: Optional[vision.FaceDetector] = None

        self._load_model()

    def _load_model(self) -> None:
        """Initializes the MediaPipe FaceDetector with BlazeFace short-range model."""
        if not os.path.exists(self.model_path):
            print(f"[FaceDetector] Warning: Model file not found at {self.model_path}")
            self.detector = None
            return

        try:
            base_options = mp_tasks.BaseOptions(model_asset_path=self.model_path)
            options = vision.FaceDetectorOptions(
                base_options=base_options,
                min_detection_confidence=self.score_threshold,
            )
            self.detector = vision.FaceDetector.create_from_options(options)
            print(f"[FaceDetector] Loaded MediaPipe face detection model from: {self.model_path}")
        except Exception as e:
            print(f"[FaceDetector] Error initializing MediaPipe FaceDetector: {e}")
            self.detector = None

    def detect_faces(
        self,
        frame: Optional[np.ndarray],
        fallback_box: Optional[Tuple[int, int, int, int]] = None,
        fallback_boxes: Optional[List[Tuple[int, int, int, int]]] = None,
        fallback_landmarks: Optional[List[List[Tuple[int, int]]]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Detects faces in the given frame.

        Returns:
            List of dicts: [
                {
                    "box": (x, y, w, h), # int bounding box
                    "confidence": float,
                    "landmarks": list of 5 to 7 (x, y) tuples:
                        [right_eye, left_eye, nose_tip, mouth_right, mouth_left, right_ear, left_ear],
                }, ...
            ]
        """
        if frame is None or getattr(frame, "size", 0) == 0:
            return []

        faces_list = []
        h, w = frame.shape[:2]

        if self.detector is not None:
            try:
                # Ensure 3-channel BGR format
                if len(frame.shape) == 2:
                    bgr_frame = cv2.cvtColor(frame, cv2.COLOR_GRAY2BGR)
                elif frame.shape[2] == 4:
                    bgr_frame = cv2.cvtColor(frame, cv2.COLOR_BGRA2BGR)
                else:
                    bgr_frame = frame

                rgb_frame = np.ascontiguousarray(cv2.cvtColor(bgr_frame, cv2.COLOR_BGR2RGB))
                mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
                detection_result = self.detector.detect(mp_image)

                if detection_result and detection_result.detections:
                    for det in detection_result.detections:
                        bb = det.bounding_box
                        rx1 = max(0, int(bb.origin_x))
                        ry1 = max(0, int(bb.origin_y))
                        rx2 = min(w, int(bb.origin_x + bb.width))
                        ry2 = min(h, int(bb.origin_y + bb.height))
                        fx = rx1
                        fy = ry1
                        fw = max(0, rx2 - rx1)
                        fh = max(0, ry2 - ry1)

                        if fw <= 20 or fh <= 20:
                            continue

                        score = float(det.categories[0].score) if det.categories else 1.0

                        # MediaPipe BlazeFace keypoints:
                        # 0: right eye
                        # 1: left eye
                        # 2: nose tip
                        # 3: mouth center
                        # 4: right ear tragion
                        # 5: left ear tragion
                        kps = det.keypoints
                        if len(kps) >= 6:
                            re = (
                                max(0, min(w - 1, int(round(kps[0].x * w)))),
                                max(0, min(h - 1, int(round(kps[0].y * h)))),
                            )
                            le = (
                                max(0, min(w - 1, int(round(kps[1].x * w)))),
                                max(0, min(h - 1, int(round(kps[1].y * h)))),
                            )
                            nose_pt = (
                                max(0, min(w - 1, int(round(kps[2].x * w)))),
                                max(0, min(h - 1, int(round(kps[2].y * h)))),
                            )
                            mc = (
                                max(0, min(w - 1, int(round(kps[3].x * w)))),
                                max(0, min(h - 1, int(round(kps[3].y * h)))),
                            )
                            rear = (
                                max(0, min(w - 1, int(round(kps[4].x * w)))),
                                max(0, min(h - 1, int(round(kps[4].y * h)))),
                            )
                            lear = (
                                max(0, min(w - 1, int(round(kps[5].x * w)))),
                                max(0, min(h - 1, int(round(kps[5].y * h)))),
                            )

                            # Derive mouth right and left corners along the eye-axis
                            dx = le[0] - re[0]
                            dy = le[1] - re[1]
                            edist = math.hypot(dx, dy)
                            if edist < 1e-4:
                                ux, uy = 1.0, 0.0
                                half_m = fw * 0.15
                            else:
                                ux, uy = dx / edist, dy / edist
                                half_m = edist * 0.28

                            mr = (
                                max(0, min(w - 1, int(round(mc[0] - ux * half_m)))),
                                max(0, min(h - 1, int(round(mc[1] - uy * half_m)))),
                            )
                            ml = (
                                max(0, min(w - 1, int(round(mc[0] + ux * half_m)))),
                                max(0, min(h - 1, int(round(mc[1] + uy * half_m)))),
                            )

                            landmarks = [re, le, nose_pt, mr, ml, rear, lear]
                        else:
                            # Fallback canonical landmarks if keypoints aren't populated
                            landmarks = [
                                (fx + int(0.33 * fw), fy + int(0.38 * fh)),
                                (fx + int(0.67 * fw), fy + int(0.38 * fh)),
                                (fx + int(0.50 * fw), fy + int(0.56 * fh)),
                                (fx + int(0.36 * fw), fy + int(0.74 * fh)),
                                (fx + int(0.64 * fw), fy + int(0.74 * fh)),
                            ]

                        faces_list.append({
                            "box": (fx, fy, fw, fh),
                            "confidence": score,
                            "landmarks": landmarks,
                        })
            except Exception as e:
                print(f"[FaceDetector] MediaPipe detection error: {e}")

        # If no real face was detected and simulated fallback boxes were provided (e.g. demo mode)
        if len(faces_list) == 0:
            target_boxes = []
            if fallback_boxes:
                target_boxes.extend(fallback_boxes)
            elif fallback_box:
                target_boxes.append(fallback_box)

            for idx, b in enumerate(target_boxes):
                bx, by, bw, bh = b
                bx = max(0, min(w - 20, bx))
                by = max(0, min(h - 20, by))
                bw = min(w - bx, bw)
                bh = min(h - by, bh)

                lm = []
                if fallback_landmarks and idx < len(fallback_landmarks):
                    lm = fallback_landmarks[idx]
                else:
                    lm = [
                        (bx + int(0.33 * bw), by + int(0.38 * bh)),
                        (bx + int(0.67 * bw), by + int(0.38 * bh)),
                        (bx + int(0.50 * bw), by + int(0.56 * bh)),
                        (bx + int(0.36 * bw), by + int(0.74 * bh)),
                        (bx + int(0.64 * bw), by + int(0.74 * bh)),
                    ]

                faces_list.append({
                    "box": (bx, by, bw, bh),
                    "confidence": 1.0,
                    "landmarks": lm,
                })

        # Sort faces: largest face first (primary subject)
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
        crop_x1 = max(0, min(img_w - 1, x1))
        crop_y1 = max(0, min(img_h - 1, y1))
        crop_x2 = max(crop_x1 + 1, min(img_w, x2))
        crop_y2 = max(crop_y1 + 1, min(img_h, y2))

        cropped = frame[crop_y1:crop_y2, crop_x1:crop_x2]
        return cropped
