"""
Collage Generator module for Photobooth (V3).
Creates:
1. Chimeric Hybrid Faces ("Franken-Faces") by randomly remixing eyes, noses, mouths, and ears
   across different people, matching the rotation, scale, and position of all features
   to the base face image with tight, natural ear positioning.
2. A high-resolution Master Collage Poster displaying the hybrid portraits alongside
   a comparative matrix of all extracted facial features.
"""

import math
import random
from typing import List, Dict, Optional, Tuple, Any, Union
import numpy as np
import cv2

from slot_animator import SlotMachineAnimator, SlotAnimationState


class CollageGenerator:
    """Assembles extracted facial features into surreal, artistic portrait collages."""

    def __init__(self):
        self.last_hybrids: List[np.ndarray] = []
        self.last_selections: List[Dict[str, int]] = []
        self.current_selection: Dict[str, int] = {}

    @staticmethod
    def _fit_image(img: np.ndarray, target_w: int, target_h: int, bg_color=(28, 30, 38)) -> np.ndarray:
        """Scales image to fit within target dimensions, centering it on background."""
        canvas = np.zeros((target_h, target_w, 3), dtype=np.uint8)
        canvas[:] = bg_color

        h, w = img.shape[:2]
        if h == 0 or w == 0:
            return canvas

        scale = min(target_w / w, target_h / h)
        nw = max(1, int(w * scale))
        nh = max(1, int(h * scale))
        resized = cv2.resize(img, (nw, nh))

        x_off = (target_w - nw) // 2
        y_off = (target_h - nh) // 2
        canvas[y_off:y_off + nh, x_off:x_off + nw] = resized
        return canvas

    @staticmethod
    def _overlay_rotated_cutout(
        base: np.ndarray,
        feature: np.ndarray,
        center: Tuple[int, int],
        target_size: Tuple[int, int],
        angle_deg: float = 0.0,
        border_color: Tuple[int, int, int] = (255, 255, 255),
        border_thickness: int = 2,
    ) -> None:
        """
        Pastes a feature with a retro white paper-cutout border onto base canvas,
        rotated by angle_deg to match the base face image's tilt.
        """
        tw, th = target_size
        fh, fw = feature.shape[:2]
        if fh == 0 or fw == 0:
            return

        resized = cv2.resize(feature, (tw, th))
        # Add white cutout frame
        framed = cv2.copyMakeBorder(
            resized,
            border_thickness,
            border_thickness,
            border_thickness,
            border_thickness,
            cv2.BORDER_CONSTANT,
            value=border_color,
        )

        fh_box, fw_box = framed.shape[:2]
        cx, cy = center

        if abs(angle_deg) < 0.5:
            # Fast-path for non-rotated features
            x1 = cx - fw_box // 2
            y1 = cy - fh_box // 2
            x2 = x1 + fw_box
            y2 = y1 + fh_box

            base_h, base_w = base.shape[:2]
            src_x1 = max(0, -x1)
            src_y1 = max(0, -y1)
            src_x2 = fw_box - max(0, x2 - base_w)
            src_y2 = fh_box - max(0, y2 - base_h)

            dst_x1 = max(0, x1)
            dst_y1 = max(0, y1)
            dst_x2 = min(base_w, x2)
            dst_y2 = min(base_h, y2)

            if dst_x2 > dst_x1 and dst_y2 > dst_y1:
                base[dst_y1:dst_y2, dst_x1:dst_x2] = framed[src_y1:src_y2, src_x1:src_x2]
            return

        # Rotated cutout with alpha transparency around corners
        diag = int(math.ceil(math.hypot(fw_box, fh_box))) + 4
        pad_canvas = np.zeros((diag, diag, 4), dtype=np.uint8)

        x_off = (diag - fw_box) // 2
        y_off = (diag - fh_box) // 2
        pad_canvas[y_off:y_off + fh_box, x_off:x_off + fw_box, :3] = framed
        pad_canvas[y_off:y_off + fh_box, x_off:x_off + fw_box, 3] = 255

        rot_center = (diag / 2.0, diag / 2.0)
        M = cv2.getRotationMatrix2D(rot_center, angle_deg, 1.0)
        rotated = cv2.warpAffine(
            pad_canvas,
            M,
            (diag, diag),
            flags=cv2.INTER_LINEAR,
            borderMode=cv2.BORDER_CONSTANT,
            borderValue=(0, 0, 0, 0),
        )

        dst_x1 = int(cx - diag / 2.0)
        dst_y1 = int(cy - diag / 2.0)
        dst_x2 = dst_x1 + diag
        dst_y2 = dst_y1 + diag

        can_h, can_w = base.shape[:2]
        src_x1 = max(0, -dst_x1)
        src_y1 = max(0, -dst_y1)
        src_x2 = diag - max(0, dst_x2 - can_w)
        src_y2 = diag - max(0, dst_y2 - can_h)

        dst_x1 = max(0, dst_x1)
        dst_y1 = max(0, dst_y1)
        dst_x2 = min(can_w, dst_x2)
        dst_y2 = min(can_h, dst_y2)

        if dst_x2 > dst_x1 and dst_y2 > dst_y1:
            crop_rot = rotated[src_y1:src_y2, src_x1:src_x2]
            alpha = crop_rot[:, :, 3:4] / 255.0
            rgb = crop_rot[:, :, :3]
            base[dst_y1:dst_y2, dst_x1:dst_x2] = (
                (1.0 - alpha) * base[dst_y1:dst_y2, dst_x1:dst_x2] + alpha * rgb
            ).astype(np.uint8)

    # Alias for backward compatibility
    _overlay_cutout = _overlay_rotated_cutout

    def create_chimeric_face(
        self,
        base_face: Any,
        eyes_crop: Any,
        nose_crop: Any,
        mouth_crop: Any,
        left_ear_crop: Optional[Any] = None,
        right_ear_crop: Optional[Any] = None,
        title: str = "HYBRID PORTRAIT",
        base_angle: Optional[float] = None,
    ) -> np.ndarray:
        """
        Synthesizes a surreal hybrid face by transplanting features onto a base portrait.
        Matches rotation, scale, and position of all features to the base face image.
        Ears are positioned snugly alongside the lateral cheeks.
        Canvas size: 360 x 440.
        """
        cw, ch = 360, 440
        canvas = np.zeros((ch, cw, 3), dtype=np.uint8)
        canvas[:] = (22, 23, 30)

        # Unpack base face
        if isinstance(base_face, dict):
            base_img = base_face.get("face")
            angle = base_face.get("angle", 0.0) if base_angle is None else base_angle
            landmarks = base_face.get("landmarks", [])
            face_x1, face_y1 = base_face.get("face_crop_origin", (0, 0))
            face_h, face_w = base_face.get("face_crop_size", (base_img.shape[0] if base_img is not None else 1, base_img.shape[1] if base_img is not None else 1))
            eye_dist = base_face.get("eye_dist", face_w * 0.35)
        else:
            base_img = base_face
            angle = 0.0 if base_angle is None else base_angle
            landmarks = []
            face_x1, face_y1 = 0, 0
            face_h, face_w = (base_img.shape[0] if base_img is not None else 1, base_img.shape[1] if base_img is not None else 1)
            eye_dist = face_w * 0.35

        # Unpack feature images
        eyes_img = eyes_crop.get("eyes", eyes_crop) if isinstance(eyes_crop, dict) else eyes_crop
        if isinstance(eyes_img, dict):
            eyes_img = None
        nose_img = nose_crop.get("nose", nose_crop) if isinstance(nose_crop, dict) else nose_crop
        if isinstance(nose_img, dict):
            nose_img = None
        mouth_img = mouth_crop.get("mouth", mouth_crop) if isinstance(mouth_crop, dict) else mouth_crop
        if isinstance(mouth_img, dict):
            mouth_img = None

        if left_ear_crop is not None:
            if isinstance(left_ear_crop, dict):
                left_ear_img = left_ear_crop.get("left_ear") if left_ear_crop.get("left_ear") is not None else left_ear_crop.get("ears")
            else:
                left_ear_img = left_ear_crop
        else:
            left_ear_img = None

        if right_ear_crop is not None:
            if isinstance(right_ear_crop, dict):
                right_ear_img = right_ear_crop.get("right_ear") if right_ear_crop.get("right_ear") is not None else right_ear_crop.get("ears")
            else:
                right_ear_img = right_ear_crop
        else:
            right_ear_img = None

        # 1. Base Face
        bh, bw = base_img.shape[:2] if base_img is not None else (0, 0)
        if bh > 0 and bw > 0:
            target_fw, target_fh = 310, 310
            base_resized = cv2.resize(base_img, (target_fw, target_fh))
            canvas[30:340, 25:335] = base_resized
            darken = np.zeros_like(canvas[30:340, 25:335])
            canvas[30:340, 25:335] = cv2.addWeighted(canvas[30:340, 25:335], 0.85, darken, 0.15, 0)

        # Match rotation to the base face image.
        # In OpenCV image space (where y points down), cv2.getRotationMatrix2D(center, alpha)
        # rotates vectors by -alpha on screen. Thus, to rotate grafted features by the base face
        # tilt angle on screen, we pass -angle.
        rot_angle = -angle

        # Calculate canvas landmark positions and scale matching the base face
        ox, oy = 25, 30
        sx = 310.0 / max(1, bw)
        sy = 310.0 / max(1, bh)

        if landmarks and len(landmarks) >= 5:
            re, le, nose_pt, mr, ml = landmarks[:5]
            eye_cx_f = (re[0] + le[0]) / 2.0
            eye_cy_f = (re[1] + le[1]) / 2.0
            mouth_cx_f = (mr[0] + ml[0]) / 2.0
            mouth_cy_f = (mr[1] + ml[1]) / 2.0

            pos_eyes = (
                int(ox + (eye_cx_f - face_x1) * sx),
                int(oy + (eye_cy_f - face_y1) * sy),
            )
            pos_nose = (
                int(ox + (nose_pt[0] - face_x1) * sx),
                int(oy + (nose_pt[1] - face_y1) * sy),
            )
            pos_mouth = (
                int(ox + (mouth_cx_f - face_x1) * sx),
                int(oy + (mouth_cy_f - face_y1) * sy),
            )
            canvas_edist = math.hypot((le[0] - re[0]) * sx, (le[1] - re[1]) * sy)
            if canvas_edist < 20:
                canvas_edist = 310 * 0.35
        else:
            canvas_edist = 310 * 0.35
            pos_eyes = (cw // 2, 150)
            pos_nose = (cw // 2, 235)
            pos_mouth = (cw // 2, 310)

        # Proportional sizes matching base face
        size_eyes = (max(20, int(canvas_edist * 1.95)), max(10, int(canvas_edist * 0.72)))
        size_nose = (max(15, int(canvas_edist * 0.88)), max(15, int(canvas_edist * 0.95)))
        size_mouth = (max(20, int(canvas_edist * 1.45)), max(10, int(canvas_edist * 0.75)))
        size_ear = (42, 80)

        # Ear positions aligned along base face tilt, hugging the lateral cheeks
        if landmarks and len(landmarks) >= 7:
            # Use direct MediaPipe ear tragion coordinates when available
            rear_pt = landmarks[5]
            lear_pt = landmarks[6]
            pos_rear = (
                int(ox + (rear_pt[0] - face_x1) * sx),
                int(oy + (rear_pt[1] - face_y1) * sy),
            )
            pos_lear = (
                int(ox + (lear_pt[0] - face_x1) * sx),
                int(oy + (lear_pt[1] - face_y1) * sy),
            )
        else:
            angle_rad = math.radians(angle)
            cos_a = math.cos(angle_rad)
            sin_a = math.sin(angle_rad)

            # Ear vertical midpoint: between eye line and nose level
            ear_mid_x = (pos_eyes[0] + pos_nose[0]) / 2.0
            ear_mid_y = pos_eyes[1] + (pos_nose[1] - pos_eyes[1]) * 0.35

            # Lateral distance from face centerline to ears: hugs head lateral margin
            ear_dist = max(70, min(106, int(canvas_edist * 1.02)))

            pos_rear = (
                int(ear_mid_x - ear_dist * cos_a),
                int(ear_mid_y - ear_dist * sin_a),
            )
            pos_lear = (
                int(ear_mid_x + ear_dist * cos_a),
                int(ear_mid_y + ear_dist * sin_a),
            )

        # 2. Graft Ears (rotated to match base face, snug against cheeks)
        if right_ear_img is not None:
            self._overlay_rotated_cutout(canvas, right_ear_img, pos_rear, size_ear, angle_deg=rot_angle)
        if left_ear_img is not None:
            self._overlay_rotated_cutout(canvas, left_ear_img, pos_lear, size_ear, angle_deg=rot_angle)

        # 3. Graft Eyes (rotated to match base face)
        if eyes_img is not None:
            self._overlay_rotated_cutout(canvas, eyes_img, pos_eyes, size_eyes, angle_deg=rot_angle)

        # 4. Graft Nose (rotated to match base face)
        if nose_img is not None:
            self._overlay_rotated_cutout(canvas, nose_img, pos_nose, size_nose, angle_deg=rot_angle)

        # 5. Graft Mouth (rotated to match base face)
        if mouth_img is not None:
            self._overlay_rotated_cutout(canvas, mouth_img, pos_mouth, size_mouth, angle_deg=rot_angle)

        # Outer card frame
        cv2.rectangle(canvas, (0, 0), (cw - 1, ch - 1), (55, 58, 70), 2)

        # Bottom label bar
        cv2.rectangle(canvas, (0, ch - 48), (cw, ch), (16, 17, 22), -1)
        cv2.line(canvas, (0, ch - 48), (cw, ch - 48), (55, 58, 70), 1)
        cv2.putText(
            canvas,
            title,
            (max(10, cw // 2 - int(len(title) * 4.3)), ch - 18),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.42,
            (240, 195, 75),
            1,
            cv2.LINE_AA,
        )

        return canvas

    def generate_randomized_hybrid(
        self,
        people_features: List[Dict[str, Any]],
        base_idx: int,
        hybrid_num: int,
    ) -> np.ndarray:
        """
        Synthesizes a chimeric face with randomized feature contributors.
        Base face is people_features[base_idx].
        Eyes, nose, mouth, and ears are randomly selected from people_features.
        """
        n_p = len(people_features)
        base_person = people_features[base_idx]
        other_indices = [i for i in range(n_p) if i != base_idx]

        # Randomly choose contributors for each individual feature
        eyes_idx = random.randrange(n_p)
        nose_idx = random.randrange(n_p)
        mouth_idx = random.randrange(n_p)
        lear_idx = random.randrange(n_p)
        rear_idx = random.randrange(n_p)

        # Ensure that it's a true hybrid (at least 2 core features come from other people)
        if other_indices:
            same_count = sum(1 for idx in (eyes_idx, nose_idx, mouth_idx) if idx == base_idx)
            if same_count >= 2:
                # Force at least 2 distinct features to come from other people
                transplant_feats = random.sample(["eyes", "nose", "mouth"], 2)
                if "eyes" in transplant_feats:
                    eyes_idx = random.choice(other_indices)
                if "nose" in transplant_feats:
                    nose_idx = random.choice(other_indices)
                if "mouth" in transplant_feats:
                    mouth_idx = random.choice(other_indices)

        eyes_person = people_features[eyes_idx]
        nose_person = people_features[nose_idx]
        mouth_person = people_features[mouth_idx]
        lear_person = people_features[lear_idx]
        rear_person = people_features[rear_idx]

        self.current_selection = {
            "base": base_idx,
            "eyes": eyes_idx,
            "nose": nose_idx,
            "mouth": mouth_idx,
            "left_ear": lear_idx,
            "right_ear": rear_idx,
            "ears": lear_idx,
        }

        title = f"HYBRID #{hybrid_num} (Base: P{base_idx + 1} | E:P{eyes_idx + 1} N:P{nose_idx + 1} M:P{mouth_idx + 1})"

        return self.create_chimeric_face(
            base_face=base_person,
            eyes_crop=eyes_person,
            nose_crop=nose_person,
            mouth_crop=mouth_person,
            left_ear_crop=lear_person,
            right_ear_crop=rear_person,
            title=title,
        )

    def generate_collage(
        self,
        people_features: List[Dict[str, Any]],
        timestamp_str: str = "",
    ) -> np.ndarray:
        """
        Builds the master collage poster formatted for printing onto a standard A4 sheet
        (1240 x 1754 px in portrait orientation, corresponding to 210 x 297 mm at 150 DPI).
        Contains the 3 Chimeric Hybrid portraits centered horizontally and stacked vertically.
        """
        pw, ph = 1240, 1754
        poster = np.zeros((ph, pw, 3), dtype=np.uint8)
        poster[:] = (18, 19, 25)

        # 1. Header Banner
        header_h = 110
        cv2.rectangle(poster, (0, 0), (pw, header_h), (26, 28, 36), -1)
        cv2.line(poster, (0, header_h), (pw, header_h), (55, 58, 70), 1)

        title_text = "PHOTOBOOTH V3: CHIMERIC COLLAGES"
        (tw, th), _ = cv2.getTextSize(title_text, cv2.FONT_HERSHEY_SIMPLEX, 0.90, 2)
        title_x = max(10, (pw - tw) // 2)
        cv2.putText(
            poster,
            title_text,
            (title_x, 52),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.90,
            (250, 250, 252),
            2,
            cv2.LINE_AA,
        )

        sub_text = f"Randomized Feature Recombination  |  A4 Print Edition  |  {timestamp_str}" if timestamp_str else "Randomized Feature Recombination  |  A4 Print Edition"
        (stw, sth), _ = cv2.getTextSize(sub_text, cv2.FONT_HERSHEY_SIMPLEX, 0.48, 1)
        sub_x = max(10, (pw - stw) // 2)
        cv2.putText(
            poster,
            sub_text,
            (sub_x, 86),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.48,
            (150, 155, 170),
            1,
            cv2.LINE_AA,
        )

        n_people = len(people_features)
        if n_people == 0:
            return poster

        # 2. Generate 3 Chimeric Hybrid Faces with randomized feature selection
        hybrids = []
        selections = []
        num_to_generate = 3 if n_people >= 1 else 0
        for h_idx in range(num_to_generate):
            base_idx = h_idx % n_people
            hyb = self.generate_randomized_hybrid(
                people_features=people_features,
                base_idx=base_idx,
                hybrid_num=h_idx + 1,
            )
            hybrids.append(hyb)
            selections.append(getattr(self, "current_selection", {
                "base": base_idx,
                "eyes": base_idx,
                "nose": base_idx,
                "mouth": base_idx,
                "left_ear": base_idx,
                "right_ear": base_idx,
                "ears": base_idx,
            }))

        self.last_hybrids = hybrids
        self.last_selections = selections

        # 3. Stack Chimeric Faces vertically, centered horizontally on A4 Sheet
        card_w, card_h = 420, 500
        hx = (pw - card_w) // 2

        footer_h = 60
        avail_h = ph - header_h - footer_h  # 1754 - 110 - 60 = 1584
        n_cards = len(hybrids)
        total_cards_h = n_cards * card_h
        rem_h = max(0, avail_h - total_cards_h)
        gap_y = rem_h // (n_cards + 1) if n_cards > 0 else 0
        start_y = header_h + gap_y

        for idx, hyb in enumerate(hybrids):
            hy = start_y + idx * (card_h + gap_y)
            resized_hyb = cv2.resize(hyb, (card_w, card_h), interpolation=cv2.INTER_LANCZOS4)
            poster[hy:hy + card_h, hx:hx + card_w] = resized_hyb
            # Outer accent border around each hybrid card
            cv2.rectangle(poster, (hx - 1, hy - 1), (hx + card_w, hy + card_h), (60, 64, 80), 2)

        # 4. Footer Bar
        footer_y = ph - footer_h
        cv2.line(poster, (0, footer_y), (pw, footer_y), (45, 48, 60), 1)
        footer_text = "PHOTOBOOTH STUDIO V3  |  A4 PRINT EDITION (210 x 297 mm)  |  COMPUTATIONAL FEATURE COLLAGE"
        (ftw, fth), _ = cv2.getTextSize(footer_text, cv2.FONT_HERSHEY_SIMPLEX, 0.44, 1)
        foot_x = max(10, (pw - ftw) // 2)
        cv2.putText(
            poster,
            footer_text,
            (foot_x, ph - 22),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.44,
            (110, 115, 130),
            1,
            cv2.LINE_AA,
        )

        return poster

    def generate_feature_grid_view(
        self,
        people_features: List[Dict[str, Any]],
        active_hybrid_idx: int = 0,
        timestamp_str: str = "",
        anim_time: float = -1.0,
        canvas_w: int = 1280,
        canvas_h: int = 720,
    ) -> np.ndarray:
        """
        Renders the Feature Breakdown Grid view (1280 x 720) in a Swiss minimalist aesthetic.
        Animates a slot machine reel spin row-by-row selecting facial features (eyes, nose, ears, lips),
        locks them in with soft pink highlights, sweeps an animated pink connection line through the
        selected feature nodes, and reveals the resulting chimeric hybrid portrait.
        """
        view = np.zeros((canvas_h, canvas_w, 3), dtype=np.uint8)
        # Background: #eeeeec
        BG_COLOR = (236, 238, 238)
        view[:] = BG_COLOR

        n_people = len(people_features)
        if n_people == 0:
            return view

        total_hybrids = len(self.last_hybrids) if self.last_hybrids else min(3, n_people)
        active_idx = max(0, min(total_hybrids - 1, active_hybrid_idx)) if total_hybrids > 0 else 0

        # Retrieve contributor selection indices for active collage
        if self.last_selections and active_idx < len(self.last_selections):
            selection = self.last_selections[active_idx]
        else:
            selection = {
                "base": active_idx % n_people,
                "eyes": (active_idx + 1) % n_people,
                "nose": (active_idx + 2) % n_people,
                "mouth": active_idx % n_people,
                "left_ear": (active_idx + 1) % n_people,
                "right_ear": (active_idx + 1) % n_people,
                "ears": (active_idx + 1) % n_people,
            }

        col_count = min(3, n_people)
        animator = SlotMachineAnimator(selection, col_count=col_count)
        state = animator.get_state(anim_time)

        # Palette colors (BGR)
        LINE_PINK = (125, 75, 228)    # #e44b7d (vibrant magenta/pink)
        CELL_PINK = (217, 203, 246)   # #f6cbd9 (soft pastel pink)
        CELL_GLOW = (236, 228, 252)   # glowing pink for spinning reel
        CELL_GREY = (222, 222, 222)   # #dededa (unselected card fill)
        BORDER_COL = (208, 208, 208)  # card border
        TEXT_DARK = (25, 25, 25)
        TEXT_MUTED = (130, 130, 130)

        # 1. Top Header Bar
        cv2.putText(
            view,
            "FACE.MESH BOOTH",
            (48, 38),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.60,
            (30, 30, 30),
            2,
            cv2.LINE_AA,
        )

        step_label = f"0{active_idx + 1} / 0{total_hybrids} - MIXING"
        cv2.putText(
            view,
            step_label,
            (canvas_w - 260, 38),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.50,
            (65, 65, 65),
            1,
            cv2.LINE_AA,
        )

        # Horizontal divider line below top header
        cv2.line(view, (0, 56), (canvas_w, 56), (205, 205, 205), 1)

        # 2. Grid Geometry (Left Side)
        grid_x0 = 175
        grid_y0 = 140
        col_w = 196
        col_gap = 10
        row_h = 104
        row_gap = 10
        n_rows = 4

        # Outer border enclosing the 4x3 cells
        outer_x1 = grid_x0 - 4
        outer_y1 = grid_y0 - 4
        outer_x2 = grid_x0 + col_count * col_w + (col_count - 1) * col_gap + 4
        outer_y2 = grid_y0 + n_rows * row_h + (n_rows - 1) * row_gap + 4
        cv2.rectangle(view, (outer_x1, outer_y1), (outer_x2, outer_y2), (212, 212, 212), 1)

        # Column headers (person01, person02, person03)
        col_names = [f"person0{i + 1}" for i in range(col_count)]
        for c_idx in range(col_count):
            cx = grid_x0 + c_idx * (col_w + col_gap) + col_w // 2
            (tw, th), _ = cv2.getTextSize(col_names[c_idx], cv2.FONT_HERSHEY_SIMPLEX, 0.48, 1)
            cv2.putText(
                view,
                col_names[c_idx],
                (cx - tw // 2, grid_y0 - 18),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.48,
                (45, 45, 45),
                1,
                cv2.LINE_AA,
            )

        # Row names (eyes, nose, ears, lips)
        row_names = ["eyes", "nose", "ears", "lips"]
        row_keys = ["eyes", "nose", "ears", "mouth"]
        for r_idx in range(n_rows):
            ry = grid_y0 + r_idx * (row_h + row_gap) + row_h // 2
            (tw, th), _ = cv2.getTextSize(row_names[r_idx], cv2.FONT_HERSHEY_SIMPLEX, 0.62, 2)
            cv2.putText(
                view,
                row_names[r_idx],
                (grid_x0 - 24 - tw, ry + th // 2),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.62,
                (25, 25, 25),
                2,
                cv2.LINE_AA,
            )

        # 3. Draw Grid Cells & Embed Feature Crops
        node_pts: List[Tuple[int, int]] = []
        for r_idx in range(n_rows):
            r_state = state.rows[r_idx]
            target_c = r_state.target_col
            sel_c = r_state.highlight_col
            status = r_state.status
            feat_key = row_keys[r_idx]

            for c_idx in range(col_count):
                cx1 = grid_x0 + c_idx * (col_w + col_gap)
                cy1 = grid_y0 + r_idx * (row_h + row_gap)
                cx2 = cx1 + col_w
                cy2 = cy1 + row_h

                is_locked = (status == "locked" and c_idx == target_c)
                is_spinning_active = (status == "spinning" and c_idx == sel_c)

                if is_locked:
                    bg = CELL_PINK
                    border_color = BORDER_COL
                    border_thickness = 1
                elif is_spinning_active:
                    bg = CELL_GLOW
                    border_color = LINE_PINK
                    border_thickness = 2
                else:
                    bg = CELL_GREY
                    border_color = BORDER_COL
                    border_thickness = 1

                cv2.rectangle(view, (cx1, cy1), (cx2, cy2), bg, -1)
                cv2.rectangle(view, (cx1, cy1), (cx2, cy2), border_color, border_thickness)

                # Embed actual extracted facial feature crop if available
                if c_idx < len(people_features):
                    f_img = people_features[c_idx].get(feat_key)
                    if f_img is not None and getattr(f_img, "size", 0) > 0:
                        fh, fw = f_img.shape[:2]
                        max_w, max_h = 160, 58
                        scale = min(max_w / max(1, fw), max_h / max(1, fh))
                        nw, nh = max(1, int(fw * scale)), max(1, int(fh * scale))
                        resized_feat = cv2.resize(f_img, (nw, nh))

                        fx = cx1 + (col_w - nw) // 2
                        fy = cy1 + 8 + (max_h - nh) // 2
                        view[fy:fy + nh, fx:fx + nw] = resized_feat
                        cv2.rectangle(
                            view,
                            (fx - 1, fy - 1),
                            (fx + nw, fy + nh),
                            (215, 215, 215) if not is_locked else (240, 185, 205),
                            1,
                        )

                # Bottom-left label: feat.01, etc.
                lbl = f"{row_names[r_idx]}.0{c_idx + 1}"
                lbl_col = LINE_PINK if (is_locked or is_spinning_active) else TEXT_MUTED
                cv2.putText(
                    view,
                    lbl,
                    (cx1 + 10, cy2 - 12),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.38,
                    lbl_col,
                    1,
                    cv2.LINE_AA,
                )

            # Store node center coordinate for this row's selected target
            target_cx = grid_x0 + target_c * (col_w + col_gap) + col_w // 2
            target_cy = grid_y0 + r_idx * (row_h + row_gap) + row_h // 2
            node_pts.append((target_cx, target_cy))

        # 4. Draw Connecting Line & Circle Nodes
        # Connect nodes with animated sweeping line
        if state.line_progress > 0:
            prog = state.line_progress
            for seg in range(3):
                p1 = np.array(node_pts[seg], dtype=float)
                p2 = np.array(node_pts[seg + 1], dtype=float)
                seg_prog = min(1.0, max(0.0, prog - seg))
                if seg_prog > 0:
                    p_end = p1 + seg_prog * (p2 - p1)
                    cv2.line(
                        view,
                        (int(p1[0]), int(p1[1])),
                        (int(p_end[0]), int(p_end[1])),
                        LINE_PINK,
                        6,
                        cv2.LINE_AA,
                    )
                    if seg_prog < 1.0:
                        # Animated glowing lead tip
                        tip_pt = (int(p_end[0]), int(p_end[1]))
                        cv2.circle(view, tip_pt, 9, LINE_PINK, -1, cv2.LINE_AA)
                        cv2.circle(view, tip_pt, 13, (170, 120, 240), 2, cv2.LINE_AA)

        # Draw circle nodes at centers of locked rows
        for r_idx in range(n_rows):
            if state.rows[r_idx].is_locked:
                cv2.circle(view, node_pts[r_idx], 8, LINE_PINK, -1, cv2.LINE_AA)

        # 5. Right Side Panel: Recipe & Status
        rx = 840
        sub_title = "RANDOMISING..." if not state.is_complete else "SELECTION COMPLETE"
        cv2.putText(
            view,
            sub_title,
            (rx, 180),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.52,
            LINE_PINK,
            2,
            cv2.LINE_AA,
        )

        cv2.putText(
            view,
            "Mixing your",
            (rx, 235),
            cv2.FONT_HERSHEY_SIMPLEX,
            1.25,
            TEXT_DARK,
            3,
            cv2.LINE_AA,
        )
        cv2.putText(
            view,
            "faces",
            (rx, 280),
            cv2.FONT_HERSHEY_SIMPLEX,
            1.25,
            TEXT_DARK,
            3,
            cv2.LINE_AA,
        )

        # Base face
        cv2.putText(
            view,
            "base face",
            (rx, 335),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.54,
            (40, 40, 40),
            1,
            cv2.LINE_AA,
        )
        cv2.putText(
            view,
            f"person0{state.base_col + 1}",
            (rx + 240, 335),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.54,
            (40, 40, 40),
            1,
            cv2.LINE_AA,
        )
        cv2.line(view, (rx, 350), (rx + 330, 350), (180, 180, 180), 1)

        # Recipe Rows with vector arrows
        for r_idx in range(4):
            ry = 385 + r_idx * 36
            r_state = state.rows[r_idx]
            f_name = row_names[r_idx]

            if r_state.is_locked:
                cv2.putText(
                    view,
                    f_name,
                    (rx, ry),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.54,
                    (40, 40, 40),
                    1,
                    cv2.LINE_AA,
                )
                # Left vector arrow: <-
                ax = rx + 205
                ay = ry - 5
                cv2.line(view, (ax, ay), (ax + 16, ay), (40, 40, 40), 2, cv2.LINE_AA)
                cv2.line(view, (ax, ay), (ax + 6, ay - 5), (40, 40, 40), 2, cv2.LINE_AA)
                cv2.line(view, (ax, ay), (ax + 6, ay + 5), (40, 40, 40), 2, cv2.LINE_AA)

                cv2.putText(
                    view,
                    f"person0{r_state.target_col + 1}",
                    (rx + 230, ry),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.54,
                    (40, 40, 40),
                    1,
                    cv2.LINE_AA,
                )
            elif r_state.status == "spinning":
                cv2.putText(
                    view,
                    f_name,
                    (rx, ry),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.54,
                    LINE_PINK,
                    1,
                    cv2.LINE_AA,
                )
                cv2.putText(
                    view,
                    "spinning...",
                    (rx + 220, ry),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.48,
                    LINE_PINK,
                    1,
                    cv2.LINE_AA,
                )
            else:
                cv2.putText(
                    view,
                    f_name,
                    (rx, ry),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.54,
                    (170, 170, 170),
                    1,
                    cv2.LINE_AA,
                )
                cv2.putText(
                    view,
                    "---",
                    (rx + 240, ry),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.54,
                    (170, 170, 170),
                    1,
                    cv2.LINE_AA,
                )

        # 6. Resulting Chimeric Hybrid Preview (Bottom Right)
        if state.is_complete and self.last_hybrids and active_idx < len(self.last_hybrids):
            hyb_src = self.last_hybrids[active_idx]
            hyb_x = rx
            hyb_y = 525
            hyb_size = 140
            hyb_fitted = self._fit_image(hyb_src, hyb_size, hyb_size, bg_color=(236, 238, 238))
            view[hyb_y:hyb_y + hyb_size, hyb_x:hyb_x + hyb_size] = hyb_fitted
            cv2.rectangle(
                view,
                (hyb_x - 1, hyb_y - 1),
                (hyb_x + hyb_size, hyb_y + hyb_size),
                (195, 195, 195),
                1,
            )

            # Labels beside preview
            info_x = hyb_x + hyb_size + 16
            cv2.putText(
                view,
                "CHIMERIC HYBRID",
                (info_x, hyb_y + 32),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.46,
                (25, 25, 25),
                2,
                cv2.LINE_AA,
            )
            cv2.putText(
                view,
                f"Collage #{active_idx + 1} of {total_hybrids}",
                (info_x, hyb_y + 56),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.42,
                LINE_PINK,
                1,
                cv2.LINE_AA,
            )
            cv2.putText(
                view,
                "[SPACE] Next Collage",
                (info_x, hyb_y + 86),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.36,
                (70, 70, 70),
                1,
                cv2.LINE_AA,
            )
            cv2.putText(
                view,
                "[R] Replay  |  [V] Camera",
                (info_x, hyb_y + 108),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.36,
                (120, 120, 120),
                1,
                cv2.LINE_AA,
            )

        # 7. Bottom Navigation Hints
        foot_hint = "SPACE: Next Collage (or Skip)   |   R: Replay Spin   |   1, 2, 3: Jump to Collage   |   V or ESC: Live Camera"
        cv2.putText(
            view,
            foot_hint,
            (48, canvas_h - 22),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.38,
            (110, 110, 110),
            1,
            cv2.LINE_AA,
        )

        return view
