"""
Feature Extraction module for Photobooth (V3).
Locates, aligns, and crops specific facial features:
- Eyes (individual and wide strip)
- Nose
- Mouth
- Ears (left, right, and composite)
- Full face headshot
Extracts features leveled to horizontal and retains tilt angles and landmark
geometry for seamless collage feature rotation matching.
"""

import math
from typing import Dict, List, Tuple, Optional
import numpy as np
import cv2


class FeatureExtractor:
    """Extracts cropped facial features from high-resolution portrait frames."""

    @staticmethod
    def _safe_crop(
        frame: np.ndarray,
        center: Tuple[int, int],
        width: int,
        height: int,
    ) -> np.ndarray:
        """Crops an axis-aligned region centered at (cx, cy) with bounds safety clamping."""
        img_h, img_w = frame.shape[:2]
        cx, cy = center

        half_w = max(10, width // 2)
        half_h = max(10, height // 2)

        x1 = max(0, cx - half_w)
        y1 = max(0, cy - half_h)
        x2 = min(img_w, cx + half_w)
        y2 = min(img_h, cy + half_h)

        crop = frame[y1:y2, x1:x2]
        if crop.size == 0:
            return np.zeros((max(1, height), max(1, width), 3), dtype=np.uint8)
        return crop.copy()

    @staticmethod
    def _safe_crop_oriented(
        frame: np.ndarray,
        center: Tuple[int, int],
        width: int,
        height: int,
        angle_deg: float = 0.0,
    ) -> np.ndarray:
        """
        Crops a region centered at (cx, cy) and rotates by angle_deg so the
        feature inside is leveled horizontally.
        """
        cx, cy = center
        img_h, img_w = frame.shape[:2]

        if abs(angle_deg) < 0.5:
            return FeatureExtractor._safe_crop(frame, center, width, height)

        # Extract patch with diagonal padding to prevent edge clipping during rotation
        diag = int(math.ceil(math.hypot(width, height))) + 8
        hw, hh = diag // 2, diag // 2
        x1 = max(0, cx - hw)
        y1 = max(0, cy - hh)
        x2 = min(img_w, cx + hw)
        y2 = min(img_h, cy + hh)

        patch = frame[y1:y2, x1:x2]
        if patch.size == 0:
            return np.zeros((max(1, height), max(1, width), 3), dtype=np.uint8)

        ph, pw = patch.shape[:2]
        pcx = cx - x1
        pcy = cy - y1

        # OpenCV counter-clockwise rotation matrix
        M = cv2.getRotationMatrix2D((pcx, pcy), angle_deg, 1.0)
        rotated = cv2.warpAffine(
            patch, M, (pw, ph), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT
        )

        rx1 = max(0, int(pcx - width // 2))
        ry1 = max(0, int(pcy - height // 2))
        rx2 = min(pw, rx1 + width)
        ry2 = min(ph, ry1 + height)
        crop = rotated[ry1:ry2, rx1:rx2]
        if crop.shape[0] != height or crop.shape[1] != width:
            crop = cv2.resize(crop, (max(1, width), max(1, height)))
        return crop.copy()

    @staticmethod
    def _estimate_landmarks_from_box(
        box: Tuple[int, int, int, int]
    ) -> List[Tuple[int, int]]:
        """Canonical fallback landmarks when deep learning landmarks are absent."""
        fx, fy, fw, fh = box
        re = (fx + int(0.33 * fw), fy + int(0.38 * fh))
        le = (fx + int(0.67 * fw), fy + int(0.38 * fh))
        nose = (fx + int(0.50 * fw), fy + int(0.56 * fh))
        mr = (fx + int(0.36 * fw), fy + int(0.74 * fh))
        ml = (fx + int(0.64 * fw), fy + int(0.74 * fh))
        return [re, le, nose, mr, ml]

    def extract_features(
        self,
        frame: np.ndarray,
        face_info: Dict,
    ) -> Dict[str, np.ndarray]:
        """
        Extracts cropped facial features for a single detected person.

        Returns:
            Dict containing:
                "eyes": Both eyes strip (leveled)
                "left_eye": Left eye square crop
                "right_eye": Right eye square crop
                "nose": Nose crop (leveled)
                "mouth": Mouth and lips crop (leveled)
                "left_ear": Left ear portrait crop (leveled)
                "right_ear": Right ear portrait crop (leveled)
                "ears": Combined dual-ear composite
                "face": Full face crop
                "angle": Face roll angle in degrees
                "landmarks": Facial landmarks list
                "box": Bounding box (x, y, w, h)
                "face_crop_origin": (x, y) origin of face crop in frame
                "face_crop_size": (h, w) of face crop
                "eye_dist": Inter-ocular distance in frame
        """
        box = face_info["box"]
        fx, fy, fw, fh = box
        landmarks = face_info.get("landmarks", [])

        if not landmarks or len(landmarks) < 5:
            landmarks = self._estimate_landmarks_from_box(box)

        re, le, nose_pt, mr, ml = landmarks[:5]

        # Calculate face roll angle from eye vector
        angle_rad = math.atan2(le[1] - re[1], le[0] - re[0])
        angle_deg = math.degrees(angle_rad)

        # Calculate eye distance as scale metric
        eye_dist = math.hypot(le[0] - re[0], le[1] - re[1])
        if eye_dist < 15:
            eye_dist = fw * 0.35

        # 1. Both Eyes (Strip, leveled)
        eye_cx = int((re[0] + le[0]) / 2)
        eye_cy = int((re[1] + le[1]) / 2)
        eyes_w = int(eye_dist * 2.0)
        eyes_h = int(eye_dist * 0.75)
        crop_eyes = self._safe_crop_oriented(frame, (eye_cx, eye_cy), eyes_w, eyes_h, angle_deg)

        # 2. Individual Eyes (leveled)
        single_eye_size = int(eye_dist * 0.75)
        crop_right_eye = self._safe_crop_oriented(frame, re, single_eye_size, single_eye_size, angle_deg)
        crop_left_eye = self._safe_crop_oriented(frame, le, single_eye_size, single_eye_size, angle_deg)

        # 3. Nose (leveled)
        nose_w = int(eye_dist * 0.95)
        nose_h = int(eye_dist * 1.05)
        crop_nose = self._safe_crop_oriented(frame, nose_pt, nose_w, nose_h, angle_deg)

        # 4. Mouth (leveled)
        m_cx = int((mr[0] + ml[0]) / 2)
        m_cy = int((mr[1] + ml[1]) / 2)
        mouth_w = int(eye_dist * 1.4)
        mouth_h = int(eye_dist * 0.85)
        crop_mouth = self._safe_crop_oriented(frame, (m_cx, m_cy), mouth_w, mouth_h, angle_deg)

        # 5. Ears (lateral regions on both sides of head, aligned with head tilt)
        ear_w = int(fw * 0.22)
        ear_h = int(fh * 0.42)
        cx = fx + fw // 2
        cy = fy + fh // 2
        cos_a = math.cos(angle_rad)
        sin_a = math.sin(angle_rad)

        # Offset from face center along lateral ear axis (or direct landmarks if available)
        if len(landmarks) >= 7:
            r_ear_cx, r_ear_cy = landmarks[5]
            l_ear_cx, l_ear_cy = landmarks[6]
        else:
            ear_dist = fw * 0.42
            r_ear_cx = int(cx - ear_dist * cos_a)
            r_ear_cy = int(cy - ear_dist * sin_a)
            l_ear_cx = int(cx + ear_dist * cos_a)
            l_ear_cy = int(cy + ear_dist * sin_a)

        crop_right_ear = self._safe_crop_oriented(frame, (r_ear_cx, r_ear_cy), ear_w, ear_h, angle_deg)
        crop_left_ear = self._safe_crop_oriented(frame, (l_ear_cx, l_ear_cy), ear_w, ear_h, angle_deg)

        # Composite Ears (Left and Right side by side with divider)
        h_target = 100
        r_resized = cv2.resize(
            crop_right_ear,
            (int(crop_right_ear.shape[1] * (h_target / max(1, crop_right_ear.shape[0]))), h_target),
        )
        l_resized = cv2.resize(
            crop_left_ear,
            (int(crop_left_ear.shape[1] * (h_target / max(1, crop_left_ear.shape[0]))), h_target),
        )
        divider = np.zeros((h_target, 4, 3), dtype=np.uint8) + 40
        crop_ears = np.hstack([r_resized, divider, l_resized])

        # 6. Full Face Crop (Square 1:1)
        pad_size = int(max(fw, fh) * 1.35)
        crop_face = self._safe_crop(frame, (cx, cy), pad_size, pad_size)
        face_x1 = max(0, cx - pad_size // 2)
        face_y1 = max(0, cy - pad_size // 2)

        return {
            "eyes": crop_eyes,
            "right_eye": crop_right_eye,
            "left_eye": crop_left_eye,
            "nose": crop_nose,
            "mouth": crop_mouth,
            "right_ear": crop_right_ear,
            "left_ear": crop_left_ear,
            "ears": crop_ears,
            "face": crop_face,
            "angle": angle_deg,
            "eye_dist": eye_dist,
            "landmarks": landmarks,
            "box": box,
            "face_crop_origin": (face_x1, face_y1),
            "face_crop_size": crop_face.shape[:2],
        }
