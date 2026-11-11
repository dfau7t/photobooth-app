"""
Pose & Hand Gesture Detector module for Photobooth Studio.
Uses Google MediaPipe's GestureRecognizer and PoseLandmarker tasks to verify that
all participants have their hands up with open palms before triggering the shutter.

Features:
- Dual-model verification:
  1. MediaPipe PoseLandmarker (models/pose_landmarker_lite.task):
     Tracks shoulder, elbow, and wrist elevations to verify "hands up" posture.
  2. MediaPipe GestureRecognizer (models/gesture_recognizer.task):
     Tracks 21 hand landmarks and classifies hand gestures (specifically "Open_Palm").
- Associates detected hands and poses to individual participants (sorted left-to-right).
- Group readiness check: all detected participants (>= min_faces) must simultaneously
  have at least one raised hand with an open palm.
- Stability hold filter: requires the group open-palm pose to be held steadily
  (default 0.4s) before firing the shutter trigger to eliminate accidental activations.
- Built-in fallback/simulation support for headless automated testing and demo mode.
- Explicit resource cleanup (.close()) to prevent GPU Metal / accelerator memory leaks.
"""

import os
import math
import time
from typing import List, Dict, Optional, Tuple, Any

os.environ.setdefault("MPLCONFIGDIR", "/tmp")
# Import pygame before cv2 to avoid SDL symbol conflict warnings on macOS
import pygame
import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python as mp_tasks
from mediapipe.tasks.python import vision


class GestureResult:
    """Encapsulates the result of a single frame's gesture & pose detection."""

    def __init__(
        self,
        all_ready: bool = False,
        ready_count: int = 0,
        total_required: int = 3,
        participant_readiness: Optional[List[bool]] = None,
        participant_hands_count: Optional[List[int]] = None,
        hands: Optional[List[Dict[str, Any]]] = None,
        poses: Optional[List[Dict[str, Any]]] = None,
        hold_progress: float = 0.0,
        is_triggered: bool = False,
    ):
        self.all_ready = all_ready
        self.ready_count = ready_count
        self.total_required = total_required
        self.participant_readiness = participant_readiness or []
        self.participant_hands_count = participant_hands_count or []
        self.hands = hands or []
        self.poses = poses or []
        self.hold_progress = hold_progress
        self.is_triggered = is_triggered

    def __repr__(self) -> str:
        return (
            f"GestureResult(all_ready={self.all_ready}, ready={self.ready_count}/{self.total_required}, "
            f"progress={self.hold_progress:.2f}, triggered={self.is_triggered})"
        )


class PoseGestureDetector:
    """
    Coordinates MediaPipe PoseLandmarker and GestureRecognizer to determine if all
    group participants are raising their hands with open palms.
    """

    def __init__(
        self,
        gesture_model_path: str = "models/gesture_recognizer.task",
        pose_model_path: str = "models/pose_landmarker_lite.task",
        min_faces_required: int = 3,
        hold_duration: float = 0.40,
        min_gesture_confidence: float = 0.45,
    ):
        self.gesture_model_path = os.path.abspath(gesture_model_path)
        self.pose_model_path = os.path.abspath(pose_model_path)
        self.min_faces_required = min_faces_required
        self.hold_duration = hold_duration
        self.min_gesture_confidence = min_gesture_confidence

        self.gesture_recognizer: Optional[vision.GestureRecognizer] = None
        self.pose_landmarker: Optional[vision.PoseLandmarker] = None

        self.hold_start_time: float = 0.0
        self.last_triggered_time: float = 0.0
        self.debounce_cooldown: float = 2.0  # seconds after trigger before re-triggering
        self.is_simulated: bool = False
        self.simulated_ready_count: int = 0

        self._initialize_models()

    def _initialize_models(self):
        """Loads and initializes MediaPipe GestureRecognizer and PoseLandmarker."""
        if not os.path.exists(self.gesture_model_path) or not os.path.exists(self.pose_model_path):
            print(
                f"[PoseGestureDetector] ⚠️ Model files missing: {self.gesture_model_path} or {self.pose_model_path}. "
                "Operating in simulation/fallback mode."
            )
            self.is_simulated = True
            return

        try:
            # 1. Gesture Recognizer
            g_base = mp_tasks.BaseOptions(model_asset_path=self.gesture_model_path)
            g_options = vision.GestureRecognizerOptions(
                base_options=g_base,
                num_hands=8,
                min_hand_detection_confidence=self.min_gesture_confidence,
                min_hand_presence_confidence=self.min_gesture_confidence,
                min_tracking_confidence=self.min_gesture_confidence,
            )
            self.gesture_recognizer = vision.GestureRecognizer.create_from_options(g_options)

            # 2. Pose Landmarker
            p_base = mp_tasks.BaseOptions(model_asset_path=self.pose_model_path)
            p_options = vision.PoseLandmarkerOptions(
                base_options=p_base,
                num_poses=5,
                min_pose_detection_confidence=0.40,
                min_pose_presence_confidence=0.40,
                min_tracking_confidence=0.40,
            )
            self.pose_landmarker = vision.PoseLandmarker.create_from_options(p_options)
            print("[PoseGestureDetector] ✅ MediaPipe GestureRecognizer & PoseLandmarker initialized.")
        except Exception as e:
            print(f"[PoseGestureDetector] ⚠️ Error initializing models: {e}. Falling back to simulation.")
            self.gesture_recognizer = None
            self.pose_landmarker = None
            self.is_simulated = True

    def close(self):
        """Explicitly releases underlying C++/Metal accelerator resources."""
        if self.gesture_recognizer:
            try:
                self.gesture_recognizer.close()
            except Exception:
                pass
            self.gesture_recognizer = None

        if self.pose_landmarker:
            try:
                self.pose_landmarker.close()
            except Exception:
                pass
            self.pose_landmarker = None

    def reset(self):
        """Resets the hold stability timer and cooldown."""
        self.hold_start_time = 0.0

    def set_simulated_ready_count(self, count: int):
        """Sets simulated ready participants count for headless tests or demo mode."""
        self.simulated_ready_count = max(0, min(5, count))

    def detect(
        self,
        frame_rgb: np.ndarray,
        detected_faces: List[Dict[str, Any]],
        fallback_ready_count: Optional[int] = None,
    ) -> GestureResult:
        """
        Processes the RGB camera frame and matches detected open palms / raised hands
        to the detected participants.
        """
        # Headless or simulated override
        if fallback_ready_count is not None or self.is_simulated or not self.gesture_recognizer:
            ready_c = fallback_ready_count if fallback_ready_count is not None else self.simulated_ready_count
            num_faces = max(len(detected_faces), self.min_faces_required if ready_c >= self.min_faces_required else 1)
            part_ready = [i < ready_c for i in range(num_faces)]
            part_hands = [2 if i < ready_c else 0 for i in range(num_faces)]
            all_ready = (len(detected_faces) >= self.min_faces_required) and (ready_c >= len(detected_faces)) and (ready_c >= self.min_faces_required)
            return GestureResult(
                all_ready=all_ready,
                ready_count=ready_c,
                total_required=self.min_faces_required,
                participant_readiness=part_ready,
                participant_hands_count=part_hands,
                hands=[],
                poses=[],
            )

        fh, fw = frame_rgb.shape[:2]
        if fh == 0 or fw == 0 or len(detected_faces) == 0:
            return GestureResult(total_required=self.min_faces_required)

        # Wrap in MediaPipe Image
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame_rgb)

        # 1. Detect Hand Gestures
        detected_hands: List[Dict[str, Any]] = []
        try:
            g_res = self.gesture_recognizer.recognize(mp_image)
            if g_res and g_res.hand_landmarks:
                for i, (gest_list, lms) in enumerate(zip(g_res.gestures, g_res.hand_landmarks)):
                    top_gesture = gest_list[0].category_name if gest_list else "None"
                    top_score = gest_list[0].score if gest_list else 0.0

                    handedness = "Unknown"
                    if hasattr(g_res, "handedness") and g_res.handedness and i < len(g_res.handedness) and g_res.handedness[i]:
                        handedness = g_res.handedness[i][0].category_name

                    # Compute hand normalized center & bounding box
                    xs = [lm.x for lm in lms]
                    ys = [lm.y for lm in lms]
                    cx = float(sum(xs) / len(xs))
                    cy = float(sum(ys) / len(ys))
                    min_x, max_x = float(min(xs)), float(max(xs))
                    min_y, max_y = float(min(ys)), float(max(ys))

                    # Wrist landmark (0) vs fingertips (4, 8, 12, 16, 20)
                    wrist_y = lms[0].y
                    tips_y = [lms[4].y, lms[8].y, lms[12].y, lms[16].y, lms[20].y]
                    avg_tips_y = float(sum(tips_y) / len(tips_y))

                    # Hand orientation: fingertips pointing upward
                    is_pointing_up = (avg_tips_y < wrist_y + 0.05)
                    is_open_palm = (top_gesture == "Open_Palm" and top_score >= self.min_gesture_confidence)

                    detected_hands.append({
                        "index": i,
                        "center": (cx, cy),
                        "box_norm": (min_x, min_y, max_x - min_x, max_y - min_y),
                        "gesture": top_gesture,
                        "score": top_score,
                        "handedness": handedness,
                        "is_open_palm": is_open_palm,
                        "is_pointing_up": is_pointing_up,
                    })
        except Exception as e:
            print(f"[PoseGestureDetector] Gesture recognition error: {e}")

        # 2. Detect Body Poses
        detected_poses: List[Dict[str, Any]] = []
        try:
            p_res = self.pose_landmarker.detect(mp_image)
            if p_res and p_res.pose_landmarks:
                for i, p_lms in enumerate(p_res.pose_landmarks):
                    nose = p_lms[0]
                    ls, rs = p_lms[11], p_lms[12]
                    le, re = p_lms[13], p_lms[14]
                    lw, rw = p_lms[15], p_lms[16]

                    # Wrist elevation relative to shoulder/elbow
                    left_up = (lw.y < ls.y + 0.08) or (lw.y < le.y + 0.04)
                    right_up = (rw.y < rs.y + 0.08) or (rw.y < re.y + 0.04)

                    detected_poses.append({
                        "index": i,
                        "nose": (nose.x, nose.y),
                        "left_shoulder": (ls.x, ls.y),
                        "right_shoulder": (rs.x, rs.y),
                        "left_wrist": (lw.x, lw.y),
                        "right_wrist": (rw.x, rw.y),
                        "left_up": left_up,
                        "right_up": right_up,
                        "both_up": left_up and right_up,
                    })
        except Exception as e:
            print(f"[PoseGestureDetector] Pose detection error: {e}")

        # 3. Associate Hands and Poses to Detected Participants
        # Sort faces from left to right by horizontal center
        sorted_faces = sorted(
            detected_faces,
            key=lambda f: f["box"][0] + f["box"][2] / 2.0,
        )
        n_faces = len(sorted_faces)
        participant_readiness = [False] * n_faces
        participant_hands_count = [0] * n_faces

        for p_idx, face in enumerate(sorted_faces):
            bx, by, bw, bh = face["box"]
            face_cx_norm = (bx + bw / 2.0) / fw
            face_cy_norm = (by + bh / 2.0) / fh

            # Find matching pose for this participant (if any)
            matching_pose = None
            min_pose_dist = 0.25
            for pose in detected_poses:
                p_dist = abs(pose["nose"][0] - face_cx_norm)
                if p_dist < min_pose_dist:
                    min_pose_dist = p_dist
                    matching_pose = pose

            # Find all open-palm hands belonging to this participant
            # A hand belongs to this participant if:
            # 1. This face is the closest face horizontally among all faces
            # 2. Distance to face center is within 0.35
            # 3. Hand is elevated (wrist/hand near or above chest level)
            valid_open_palms = []
            for hand in detected_hands:
                hx, hy = hand["center"]
                dist_to_face = abs(hx - face_cx_norm)
                if dist_to_face > 0.35:
                    continue

                # Ensure this participant is the closest one
                closest_p_idx = min(
                    range(n_faces),
                    key=lambda j: abs(hx - (sorted_faces[j]["box"][0] + sorted_faces[j]["box"][2] / 2.0) / fw)
                )
                if closest_p_idx != p_idx:
                    continue

                # Elevation check: hand is at or above upper chest/shoulder level
                hand_is_elevated = (hy <= face_cy_norm + 0.28) and hand["is_pointing_up"]
                pose_arm_up = False
                if matching_pose:
                    if (hx <= face_cx_norm and matching_pose["left_up"]) or (hx >= face_cx_norm and matching_pose["right_up"]):
                        pose_arm_up = True
                    elif matching_pose["left_up"] or matching_pose["right_up"]:
                        pose_arm_up = True

                if hand["is_open_palm"] and (hand_is_elevated or pose_arm_up):
                    valid_open_palms.append(hand)

            # Determine whether BOTH hands are up with open palms:
            # We need 2 distinct hands up (left hand and right hand)
            hands_up = 0
            if len(valid_open_palms) >= 2:
                # Check that they are 2 distinct hands rather than duplicate detections
                sorted_p_hands = sorted(valid_open_palms, key=lambda h: h["center"][0])
                leftmost_h = sorted_p_hands[0]
                rightmost_h = sorted_p_hands[-1]
                dx = rightmost_h["center"][0] - leftmost_h["center"][0]

                # Two distinct hands will have a horizontal gap between them (e.g. >= 0.05)
                # or be on opposite sides of the face (left of center and right of center),
                # or have different handedness ('Left' and 'Right')
                is_distinct = (
                    dx >= 0.05
                    or (leftmost_h["center"][0] <= face_cx_norm + 0.03 and rightmost_h["center"][0] >= face_cx_norm - 0.03)
                    or (leftmost_h["handedness"] != "Unknown" and leftmost_h["handedness"] != rightmost_h["handedness"])
                )
                if is_distinct:
                    hands_up = 2
                else:
                    hands_up = 1
            elif len(valid_open_palms) == 1:
                # 1 open palm detected
                # Check if pose confirms BOTH arms are up and we have an additional elevated hand
                if matching_pose and matching_pose["both_up"]:
                    other_hand_found = False
                    for hand in detected_hands:
                        if hand["index"] != valid_open_palms[0]["index"]:
                            hx, hy = hand["center"]
                            if abs(hx - face_cx_norm) <= 0.35 and (hy <= face_cy_norm + 0.30):
                                if abs(hx - valid_open_palms[0]["center"][0]) >= 0.05:
                                    other_hand_found = True
                                    break
                    if other_hand_found:
                        hands_up = 2
                    else:
                        hands_up = 1
                else:
                    hands_up = 1
            else:
                hands_up = 0

            participant_hands_count[p_idx] = hands_up
            participant_readiness[p_idx] = (hands_up >= 2)

        ready_count = sum(1 for r in participant_readiness if r)
        all_ready = (n_faces >= self.min_faces_required) and (ready_count >= n_faces)

        return GestureResult(
            all_ready=all_ready,
            ready_count=ready_count,
            total_required=self.min_faces_required,
            participant_readiness=participant_readiness,
            participant_hands_count=participant_hands_count,
            hands=detected_hands,
            poses=detected_poses,
        )

    def update(
        self,
        frame_rgb: np.ndarray,
        detected_faces: List[Dict[str, Any]],
        dt: float,
        fallback_ready_count: Optional[int] = None,
    ) -> GestureResult:
        """
        Updates detection and manages the hold stability timer.
        Returns a GestureResult with hold_progress and is_triggered set.
        """
        res = self.detect(frame_rgb, detected_faces, fallback_ready_count=fallback_ready_count)
        now = time.time()

        # Cooldown check
        if (now - self.last_triggered_time) < self.debounce_cooldown:
            res.hold_progress = 0.0
            res.is_triggered = False
            return res

        if res.all_ready:
            if self.hold_start_time <= 0.0:
                self.hold_start_time = now

            held_time = now - self.hold_start_time
            res.hold_progress = min(1.0, held_time / max(0.01, self.hold_duration))

            if held_time >= self.hold_duration:
                res.is_triggered = True
                self.last_triggered_time = now
                self.hold_start_time = 0.0
                print(f"[PoseGestureDetector] 🎉 Group Gesture Triggered! ({res.ready_count}/{res.total_required} ready)")
            else:
                res.is_triggered = False
        else:
            self.hold_start_time = 0.0
            res.hold_progress = 0.0
            res.is_triggered = False

        return res

    def draw_feedback(
        self,
        screen: pygame.Surface,
        view_rect: pygame.Rect,
        scale: float,
        cam_x: int,
        cam_y: int,
        detected_faces: List[Dict[str, Any]],
        result: GestureResult,
        font_pill: pygame.font.Font,
        font_badge: pygame.font.Font,
    ):
        """Renders live visual indicators for hands and participant readiness on the viewfinder."""
        # 1. Draw hand tracking markers
        for hand in result.hands:
            hx, hy, hw, hh = hand["box_norm"]
            sx = cam_x + int(hx * view_rect.width)
            sy = cam_y + int(hy * view_rect.height)
            sw = int(hw * view_rect.width)
            sh = int(hh * view_rect.height)

            is_open = hand["is_open_palm"]
            box_col = (40, 220, 110) if is_open else (120, 125, 140)

            # Draw rounded hand box
            hand_rect = pygame.Rect(sx, sy, sw, sh)
            pygame.draw.rect(screen, box_col, hand_rect, width=2, border_radius=6)

            # Hand badge label
            lbl_text = "✋ OPEN PALM" if is_open else hand["gesture"]
            lbl_surf = font_badge.render(lbl_text, True, box_col)
            screen.blit(lbl_surf, (sx, max(cam_y + 4, sy - 18)))

        # 2. Draw readiness indicator over each participant's face box
        sorted_faces = sorted(
            detected_faces,
            key=lambda f: f["box"][0] + f["box"][2] / 2.0,
        )
        for p_idx, face in enumerate(sorted_faces):
            bx, by, bw, bh = face["box"]
            s_x = cam_x + int(bx * scale)
            s_y = cam_y + int(by * scale)
            s_w = int(bw * scale)

            h_cnt = result.participant_hands_count[p_idx] if p_idx < len(result.participant_hands_count) else 0
            is_ready = (h_cnt >= 2)

            if is_ready:
                badge_text = "🙌 READY (2/2)"
                badge_bg = (35, 180, 85, 230)
                badge_border = (80, 240, 130)
            elif h_cnt == 1:
                badge_text = "✋ RAISE 2ND (1/2)"
                badge_bg = (210, 130, 25, 225)
                badge_border = (255, 185, 60)
            else:
                badge_text = "RAISE BOTH HANDS"
                badge_bg = (45, 48, 58, 200)
                badge_border = (110, 115, 130)

            bw_pill = 125
            bh_pill = 24
            bx_pill = s_x + (s_w - bw_pill) // 2
            by_pill = max(cam_y + 8, s_y - bh_pill - 8)

            pill_surf = pygame.Surface((bw_pill, bh_pill), pygame.SRCALPHA)
            pygame.draw.rect(pill_surf, badge_bg, (0, 0, bw_pill, bh_pill), border_radius=12)
            pygame.draw.rect(pill_surf, badge_border, (0, 0, bw_pill, bh_pill), width=1, border_radius=12)

            t_surf = font_badge.render(badge_text, True, (255, 255, 255))
            pill_surf.blit(
                t_surf,
                (bw_pill // 2 - t_surf.get_width() // 2, bh_pill // 2 - t_surf.get_height() // 2),
            )
            screen.blit(pill_surf, (bx_pill, by_pill))

        # 3. Draw Bottom Central Prompt Banner
        n_faces = len(detected_faces)
        banner_w = 520
        banner_h = 44
        banner_x = cam_x + (view_rect.width - banner_w) // 2
        banner_y = cam_y + view_rect.height - banner_h - 16

        banner_surf = pygame.Surface((banner_w, banner_h), pygame.SRCALPHA)

        if n_faces < self.min_faces_required:
            bg_col = (30, 32, 40, 215)
            border_col = (110, 115, 130)
            msg = f"👥 GROUP MODE: {self.min_faces_required} faces required ({n_faces}/{self.min_faces_required})"
            msg_col = (235, 235, 245)
        elif not result.all_ready:
            bg_col = (24, 34, 48, 220)
            border_col = (75, 150, 255)
            msg = f"🙌 RAISE BOTH HANDS: Open palms ({result.ready_count}/{n_faces} ready)"
            msg_col = (220, 235, 255)
        else:
            # All ready! Show animated holding progress
            bg_col = (20, 60, 35, 235)
            border_col = (60, 225, 110)
            msg = "🎉 ALL READY! Hold both hands steady..."
            msg_col = (230, 255, 235)

        pygame.draw.rect(banner_surf, bg_col, (0, 0, banner_w, banner_h), border_radius=22)
        pygame.draw.rect(banner_surf, border_col, (0, 0, banner_w, banner_h), width=1, border_radius=22)

        # Progress bar fill if holding
        if result.hold_progress > 0.0:
            fill_w = int((banner_w - 6) * result.hold_progress)
            fill_rect = pygame.Rect(3, 3, fill_w, banner_h - 6)
            pygame.draw.rect(banner_surf, (50, 210, 95, 140), fill_rect, border_radius=18)

        txt_surf = font_pill.render(msg, True, msg_col)
        banner_surf.blit(
            txt_surf,
            (banner_w // 2 - txt_surf.get_width() // 2, banner_h // 2 - txt_surf.get_height() // 2),
        )
        screen.blit(banner_surf, (banner_x, banner_y))
