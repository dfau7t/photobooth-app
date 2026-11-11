#!/usr/bin/env python3
"""
Photobooth Application (v4)
A native desktop photobooth app featuring camera access, live mirrored preview,
3-face group detection requirement, countdown timer, audio cues, individual facial
feature extraction (eyes, ears, nose, mouth), chimeric face collage generation,
and an attractor waiting screen carousel of all detected faces.
"""

import os
import sys
import time
import argparse
from datetime import datetime
from typing import Optional, List, Tuple, Dict, Any

# Import pygame before cv2 to avoid SDL symbol conflict warnings on macOS
import pygame
import cv2
import numpy as np

from camera import Camera
from face_detector import FaceDetector
from feature_extractor import FeatureExtractor
from collage_generator import CollageGenerator
from slot_animator import SlotMachineAnimator
from waiting_screen import WaitingScreenRenderer
from gesture_detector import PoseGestureDetector, GestureResult
from audio import SoundEffects
import ui


class PhotoboothApp:
    def __init__(
        self,
        save_dir: str = "photos",
        camera_index: int = 0,
        cam_width: int = 1280,
        cam_height: int = 720,
        mirror: bool = True,
        fullscreen: bool = False,
        min_faces: int = 3,
        window_width: int = 1100,
        window_height: int = 750,
        idle_timeout: float = 15.0,
    ):
        self.save_dir = os.path.abspath(save_dir)
        self.full_images_dir = os.path.join(self.save_dir, "full_images")
        self.cropped_faces_dir = os.path.join(self.save_dir, "cropped_faces")
        self.collages_dir = os.path.join(self.save_dir, "collages")
        os.makedirs(self.full_images_dir, exist_ok=True)
        os.makedirs(self.cropped_faces_dir, exist_ok=True)
        os.makedirs(self.collages_dir, exist_ok=True)

        self.cam_width = cam_width
        self.cam_height = cam_height
        self.mirror = mirror
        self.is_fullscreen = fullscreen
        self.min_faces_required = min_faces
        self.face_alert_time: float = 0.0
        self.window_width = window_width
        self.window_height = window_height
        self.saved_window_w = window_width
        self.saved_window_h = window_height
        self.idle_timeout = idle_timeout
        self.last_face_seen_time = time.time()
        self.showing_waiting_screen: bool = False
        self.waiting_screen_start_time: float = 0.0

        # Initialize Pygame
        pygame.init()
        pygame.display.set_caption("Photobooth Studio")

        # Set display mode (on macOS/SDL, fullscreen requires desktop native resolution)
        if self.is_fullscreen:
            info = pygame.display.Info()
            self.screen = pygame.display.set_mode(
                (info.current_w, info.current_h), pygame.FULLSCREEN
            )
        else:
            self.screen = pygame.display.set_mode(
                (self.window_width, self.window_height), pygame.RESIZABLE
            )

        # Fonts (Using built-in fonts to ensure cross-platform compatibility)
        self.font_title = pygame.font.Font(None, 28)
        self.font_btn = pygame.font.Font(None, 24)
        self.font_hint = pygame.font.Font(None, 18)
        self.font_giant = pygame.font.Font(None, 96)
        self.font_toast_title = pygame.font.Font(None, 20)
        self.font_toast_desc = pygame.font.Font(None, 16)

        # Audio effects
        self.audio = SoundEffects()

        # Initialize Camera
        self.camera = Camera(
            camera_index=camera_index,
            width=cam_width,
            height=cam_height,
            mirror=mirror,
        )

        # Face Detector, Gesture Detector & Feature Extractor & Collage Generator & Waiting Screen
        self.face_detector = FaceDetector()
        self.gesture_detector = PoseGestureDetector(min_faces_required=min_faces, hold_duration=0.40)
        self.latest_gesture_result: Optional[GestureResult] = None
        self.feature_extractor = FeatureExtractor()
        self.collage_generator = CollageGenerator()
        self.waiting_screen = WaitingScreenRenderer(save_dir=self.save_dir)
        self.detected_faces = []
        self.latest_collage: Optional[np.ndarray] = None
        self.latest_people_features: List[Dict[str, Any]] = []
        self.latest_timestamp_str: str = ""
        self.showing_feature_grid: bool = False
        self.feature_grid_collage_idx: int = 0
        self.feature_grid_auto_timer: float = 0.0
        self.feature_grid_duration: float = 3.5
        self.feature_grid_anim_start: float = 0.0
        self.slot_animators: Dict[int, SlotMachineAnimator] = {}
        self.crop_padding = 0.35

        # UI Overlays
        self.flash_overlay = ui.FlashOverlay()
        self.countdown_overlay = ui.CountdownOverlay(
            seconds=3, on_beep=self.audio.play_countdown_beep
        )
        self.preview_toast = ui.PreviewToast()

        # App state
        self.photos_taken_count = 0
        self.running = True
        self.clock = pygame.time.Clock()

        # Build buttons
        self.buttons = []
        self._rebuild_buttons()

    def _rebuild_buttons(self):
        """Calculates button layout based on current screen dimensions."""
        sw, sh = self.screen.get_size()
        bar_height = 80
        btn_y = sh - bar_height + 18
        btn_h = 44

        # Primary action: Snap (gesture-triggered or manual SPACE)
        btn_snap = ui.Button(
            rect=pygame.Rect(0, 0, 220, btn_h),
            label="SNAP (RAISE HANDS ✋)",
            shortcut="SPACE",
            bg_color=ui.ACCENT_RED,
            hover_color=(250, 90, 90),
            on_click=self.start_countdown,
        )

        # Feature Breakdown Grid toggle (replaces View Collage)
        has_features = len(self.latest_people_features) > 0 or self.latest_collage is not None
        grid_label = "LIVE CAMERA" if self.showing_feature_grid else "FEATURE GRID"
        btn_collage = ui.Button(
            rect=pygame.Rect(0, 0, 180, btn_h),
            label=grid_label,
            shortcut="V",
            bg_color=(40, 150, 75) if self.showing_feature_grid else (ui.ACCENT_BLUE if has_features else (36, 38, 46)),
            hover_color=(75, 145, 255),
            enabled=has_features,
            on_click=self.toggle_feature_grid,
        )

        all_btns = [btn_snap, btn_collage]
        total_w = sum(b.rect.width for b in all_btns) + (len(all_btns) - 1) * 20
        start_x = max(20, (sw - total_w) // 2)

        curr_x = start_x
        for b in all_btns:
            b.rect.x = curr_x
            b.rect.y = btn_y
            curr_x += b.rect.width + 20

        self.btn_snap = btn_snap
        self.btn_collage = btn_collage
        self.btn_fs = None
        self.btn_quit = None
        self.buttons = all_btns

    @property
    def showing_collage_view(self) -> bool:
        """Backward-compatible property mapping showing_collage_view to showing_feature_grid."""
        return self.showing_feature_grid

    @showing_collage_view.setter
    def showing_collage_view(self, val: bool):
        self.showing_feature_grid = val

    def start_feature_grid_animation(self, collage_idx: int = 0):
        """Starts the slot machine animation sequence for the specified collage index."""
        self.showing_feature_grid = True
        self.feature_grid_collage_idx = collage_idx
        self.feature_grid_anim_start = time.time()
        col_count = min(3, len(self.latest_people_features)) if self.latest_people_features else 3
        sel = {}
        if self.collage_generator.last_selections and collage_idx < len(self.collage_generator.last_selections):
            sel = self.collage_generator.last_selections[collage_idx]
        self.slot_animators[collage_idx] = SlotMachineAnimator(sel, col_count=col_count)
        self._rebuild_buttons()

    def toggle_feature_grid(self):
        """Toggles between live camera view and the feature breakdown grid."""
        has_features = len(self.latest_people_features) > 0 or self.latest_collage is not None
        if has_features:
            self.showing_feature_grid = not self.showing_feature_grid
            if self.showing_feature_grid:
                self.start_feature_grid_animation(self.feature_grid_collage_idx)
            self._rebuild_buttons()

    def toggle_collage_view(self):
        """Backward-compatible alias for toggle_feature_grid."""
        self.toggle_feature_grid()

    def toggle_fullscreen(self):
        """Toggles between native desktop fullscreen and resizable window."""
        self.is_fullscreen = not self.is_fullscreen
        if self.is_fullscreen:
            # Save the current windowed dimensions before entering fullscreen
            self.saved_window_w, self.saved_window_h = self.screen.get_size()
            info = pygame.display.Info()
            self.screen = pygame.display.set_mode(
                (info.current_w, info.current_h), pygame.FULLSCREEN
            )
        else:
            # Restore to saved windowed dimensions
            target_w = getattr(self, "saved_window_w", self.window_width)
            target_h = getattr(self, "saved_window_h", self.window_height)
            self.screen = pygame.display.set_mode(
                (target_w, target_h), pygame.RESIZABLE
            )

        self._rebuild_buttons()

    def toggle_waiting_screen(self):
        """Toggles between the waiting attractor carousel and live viewfinder."""
        self.showing_waiting_screen = not self.showing_waiting_screen
        if self.showing_waiting_screen:
            self.waiting_screen_start_time = time.time()
            self.showing_feature_grid = False
            self.countdown_overlay.is_active = False
            print("[Photobooth] 💤 Entered Waiting Screen carousel.")
        else:
            self.last_face_seen_time = time.time()
            self._rebuild_buttons()
            print("[Photobooth] 👁️ Woke up from Waiting Screen -> Live Viewfinder.")

    def start_countdown(self):
        if self.showing_waiting_screen:
            self.toggle_waiting_screen()
            return

        if self.showing_feature_grid:
            animator = self.slot_animators.get(self.feature_grid_collage_idx)
            elapsed = time.time() - self.feature_grid_anim_start
            if animator and not animator.get_state(elapsed).is_complete:
                animator.skip_to_end()
            else:
                if self.feature_grid_collage_idx < 2:
                    self.start_feature_grid_animation(self.feature_grid_collage_idx + 1)
                else:
                    self.toggle_feature_grid()
            return

        if len(self.detected_faces) < self.min_faces_required:
            print(
                f"[Photobooth] ⚠️ Countdown blocked: {len(self.detected_faces)}/{self.min_faces_required} faces detected."
            )
            self.face_alert_time = time.time()
            return
        if not self.countdown_overlay.is_active:
            self.countdown_overlay.start()

    def take_photo(self):
        """Captures the current frame, detects faces, and saves both full & cropped images."""
        if len(self.detected_faces) < self.min_faces_required:
            print(
                f"[Photobooth] ⚠️ Photo blocked: {len(self.detected_faces)}/{self.min_faces_required} faces detected. "
                f"Need at least {self.min_faces_required} faces to snap!"
            )
            self.face_alert_time = time.time()
            return

        success, frame = self.camera.read_frame()
        if not success or frame is None:
            print("[Photobooth] Error: Failed to capture frame.")
            return

        # Generate unique timestamped filename
        timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
        base_filename = f"photobooth_{timestamp_str}.jpg"
        file_path = os.path.join(self.full_images_dir, base_filename)

        # Handle rare rapid snaps in same second
        idx = 1
        while os.path.exists(file_path):
            base_filename = f"photobooth_{timestamp_str}_{idx}.jpg"
            file_path = os.path.join(self.full_images_dir, base_filename)
            idx += 1

        # 1. Save Full Photo in full_images/
        saved = self.camera.save_frame(frame, file_path)
        if not saved:
            print(f"[Photobooth] Error: Could not write photo to {file_path}")
            return

        self.photos_taken_count += 1
        filename = os.path.basename(file_path)
        print(f"[Photobooth] 📸 Full photo #{self.photos_taken_count} saved to: {file_path}")

        # 2. Extract Features (Eyes, Ears, Nose, Mouth, Face) & Generate V3 Collage
        sim_boxes = self.camera.get_simulated_face_boxes()
        sim_landmarks = self.camera.get_simulated_face_landmarks()
        faces = self.face_detector.detect_faces(
            frame, fallback_boxes=sim_boxes, fallback_landmarks=sim_landmarks
        )

        name_root, ext = os.path.splitext(base_filename)
        people_features = []

        if faces:
            print(f"[Photobooth] 👤 Detected {len(faces)} person(s). Extracting facial features...")
            for f_idx, face_info in enumerate(faces):
                p_num = f_idx + 1
                feats = self.feature_extractor.extract_features(frame, face_info)
                people_features.append(feats)

                # Save individual cropped face image to disk in cropped_faces/
                face_crop_path = os.path.join(self.cropped_faces_dir, f"{name_root}_person{p_num}{ext}")
                self.camera.save_frame(feats["face"], face_crop_path)
                print(f"   ├── Person #{p_num}: saved face crop to {face_crop_path}")

                # Add newly captured face to the waiting screen gallery
                self.waiting_screen.add_face(feats["face"])

            # 3. Generate Master Face Collage formatted for A4 Sheet (1240 x 1754) in collages/
            collage_img = self.collage_generator.generate_collage(people_features, timestamp_str)
            collage_path = os.path.join(self.collages_dir, f"{name_root}_collage{ext}")
            if self.camera.save_frame(collage_img, collage_path):
                self.latest_collage = collage_img
                print(f"[Photobooth] 🎨 Master Face Collage saved to: {collage_path}")

            # 4. Save 3 Randomized Chimeric Hybrid Portraits in collages/
            hybrids_to_save = getattr(self.collage_generator, "last_hybrids", [])
            for h_idx, hybrid in enumerate(hybrids_to_save):
                h_path = os.path.join(self.collages_dir, f"{name_root}_hybrid{h_idx + 1}{ext}")
                self.camera.save_frame(hybrid, h_path)
                print(f"   ├── Saved Hybrid #{h_idx + 1} to: {h_path}")

            self.latest_people_features = people_features
            self.latest_timestamp_str = timestamp_str

            # 5. Automatically transition to Feature Breakdown Grid view, highlighting Collage 1 with slot animation
            self.start_feature_grid_animation(0)
        else:
            print("[Photobooth] ℹ️  No faces detected in this shot.")

        # Visual & Audio feedback (preview shows only the full photo)
        self.flash_overlay.trigger()
        self.audio.play_shutter()
        self.preview_toast.show(frame, filename)

    def quit(self):
        self.running = False
        if getattr(self, "face_detector", None):
            self.face_detector.close()
        if getattr(self, "gesture_detector", None):
            self.gesture_detector.close()
        if getattr(self, "camera", None):
            self.camera.release()

    def handle_events(self):
        mouse_pos = pygame.mouse.get_pos()
        for b in self.buttons:
            b.update(mouse_pos)

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                self.quit()
                return

            if event.type == pygame.VIDEORESIZE:
                if not self.is_fullscreen:
                    self.saved_window_w = event.w
                    self.saved_window_h = event.h
                    self.screen = pygame.display.set_mode(
                        (event.w, event.h), pygame.RESIZABLE
                    )
                    self._rebuild_buttons()

            if event.type == pygame.MOUSEBUTTONDOWN:
                if self.showing_waiting_screen:
                    self.toggle_waiting_screen()
                    continue

            if event.type == pygame.KEYDOWN:
                if event.key in (pygame.K_ESCAPE, pygame.K_q):
                    if self.showing_waiting_screen:
                        self.toggle_waiting_screen()
                    elif self.showing_feature_grid:
                        self.toggle_feature_grid()
                    else:
                        self.quit()
                    return

                if self.showing_waiting_screen:
                    # Any key wakes up from waiting screen
                    self.toggle_waiting_screen()
                    return

                if event.key == pygame.K_w:
                    self.toggle_waiting_screen()
                    return
                elif self.showing_feature_grid and event.key in (pygame.K_1, pygame.K_2, pygame.K_3):
                    self.start_feature_grid_animation(int(event.unicode) - 1)
                elif self.showing_feature_grid and event.key == pygame.K_r:
                    self.start_feature_grid_animation(self.feature_grid_collage_idx)
                elif self.camera.is_simulated and not self.showing_feature_grid and event.key in (pygame.K_0, pygame.K_1, pygame.K_2, pygame.K_3):
                    cnt = int(event.unicode)
                    self.camera.set_simulated_face_count(cnt)
                    print(f"[Photobooth Demo] Switched simulated faces to: {cnt}")
                elif self.camera.is_simulated and not self.showing_feature_grid and event.key == pygame.K_h:
                    curr_h = self.camera.get_simulated_hands_up_count()
                    nxt_h = 0 if curr_h >= 3 else (curr_h + 1 if curr_h > 0 else 3)
                    self.camera.set_simulated_hands_up_count(nxt_h)
                    print(f"[Photobooth Demo] Toggled simulated hands up: {nxt_h}/3 participants with both hands up")
                elif event.key == pygame.K_v:
                    self.toggle_feature_grid()
                elif event.key in (pygame.K_SPACE, pygame.K_RETURN, pygame.K_c):
                    if self.showing_feature_grid:
                        animator = self.slot_animators.get(self.feature_grid_collage_idx)
                        elapsed = time.time() - self.feature_grid_anim_start
                        if animator and not animator.get_state(elapsed).is_complete:
                            # Skip spin immediately to completed connection
                            animator.skip_to_end()
                        else:
                            # Advance through collage 1 -> 2 -> 3 -> live camera
                            if self.feature_grid_collage_idx < 2:
                                self.start_feature_grid_animation(self.feature_grid_collage_idx + 1)
                            else:
                                self.toggle_feature_grid()
                    else:
                        # Default snap mode: starts 3-second countdown
                        self.start_countdown()
                elif event.key == pygame.K_f:
                    self.toggle_fullscreen()

            # Handle button clicks
            for b in self.buttons:
                if b.handle_event(event):
                    break

    def run(self):
        print(f"[Photobooth] Started. Photos will be saved to: {self.save_dir}")
        print("  - Controls: SPACE / ENTER = Snap photo | V = Feature Grid | F = Fullscreen | Q/ESC = Quit")

        while self.running:
            self.handle_events()

            # Update countdown state
            if self.countdown_overlay.update():
                # Countdown finished -> take photo!
                self.take_photo()

            # Update feature grid slot machine animation & audio events
            if self.showing_feature_grid:
                animator = self.slot_animators.get(self.feature_grid_collage_idx)
                if animator:
                    elapsed = time.time() - self.feature_grid_anim_start
                    for sound_evt in animator.update(elapsed):
                        if sound_evt == "tick":
                            self.audio.play_slot_tick()
                        elif sound_evt == "lock":
                            self.audio.play_slot_lock()
                        elif sound_evt == "line_start":
                            self.audio.play_line_sweep()

                    # Auto-advance to next collage after animation completes + 4.0s dwell time
                    if elapsed > (animator.total_anim_duration + 4.0):
                        if self.feature_grid_collage_idx < 2:
                            self.start_feature_grid_animation(self.feature_grid_collage_idx + 1)

            # Read latest camera frame
            success, frame = self.camera.read_frame()
            sw, sh = self.screen.get_size()
            dt = self.clock.get_time() / 1000.0

            # Live face detection & gesture pose tracking
            rgb_frame = None
            if success and frame is not None:
                sim_boxes = self.camera.get_simulated_face_boxes()
                self.detected_faces = self.face_detector.detect_faces(frame, fallback_boxes=sim_boxes)
                rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

            face_cnt = len(self.detected_faces)
            can_snap = (face_cnt >= self.min_faces_required)

            # Update gesture & pose trigger when in active camera view
            if not self.showing_feature_grid and not self.showing_waiting_screen and not self.countdown_overlay.is_active:
                if rgb_frame is not None:
                    fallback_ready = self.camera.get_simulated_hands_up_count() if self.camera.is_simulated else None
                    self.latest_gesture_result = self.gesture_detector.update(
                        rgb_frame,
                        self.detected_faces,
                        dt=dt,
                        fallback_ready_count=fallback_ready,
                    )
                    if self.latest_gesture_result and self.latest_gesture_result.is_triggered:
                        print(f"[Photobooth] 🙌 Group Gesture Triggered: All {face_cnt} participants have BOTH hands up with open palms!")
                        self.start_countdown()

            # Idle timeout management: transition to Waiting Screen if no faces are seen
            if face_cnt > 0:
                self.last_face_seen_time = time.time()
                if self.showing_waiting_screen:
                    print(f"[Photobooth] 👤 {face_cnt} face(s) appeared -> Waking up from Waiting Screen!")
                    self.showing_waiting_screen = False
                    self._rebuild_buttons()
            else:
                if not self.showing_feature_grid and not self.countdown_overlay.is_active and not self.showing_waiting_screen:
                    if (time.time() - self.last_face_seen_time) >= self.idle_timeout:
                        self.showing_waiting_screen = True
                        self.waiting_screen_start_time = time.time()
                        print("[Photobooth] 💤 Idle timeout reached. Entering Waiting Screen carousel.")

            # Update Snap & Feature Grid button states
            has_features = len(self.latest_people_features) > 0 or self.latest_collage is not None
            self.btn_collage.enabled = has_features
            self.btn_collage.label = "LIVE CAMERA" if self.showing_feature_grid else "FEATURE GRID"
            if has_features:
                self.btn_collage.bg_color = ((40, 150, 75) if self.showing_feature_grid else ui.ACCENT_BLUE)

            if self.showing_feature_grid:
                animator = self.slot_animators.get(self.feature_grid_collage_idx)
                elapsed = time.time() - self.feature_grid_anim_start if self.feature_grid_anim_start > 0 else 0
                is_running = animator and not animator.get_state(elapsed).is_complete
                self.btn_snap.enabled = True
                if is_running:
                    self.btn_snap.label = "SKIP SPIN"
                    self.btn_snap.bg_color = (200, 75, 120)
                else:
                    self.btn_snap.label = "NEXT COLLAGE"
                    self.btn_snap.bg_color = (40, 150, 75)
            elif self.countdown_overlay.is_active:
                self.btn_snap.enabled = False
                self.btn_snap.label = "COUNTING DOWN..."
                self.btn_snap.bg_color = ui.ACCENT_RED
            else:
                self.btn_snap.enabled = can_snap
                if not can_snap:
                    self.btn_snap.label = f"SNAP ({face_cnt}/{self.min_faces_required} FACES)"
                    self.btn_snap.bg_color = (50, 52, 60)
                elif self.latest_gesture_result and self.latest_gesture_result.all_ready:
                    self.btn_snap.label = "READY! (HOLD STEADY...)"
                    self.btn_snap.bg_color = (40, 180, 80)
                else:
                    ready_c = self.latest_gesture_result.ready_count if self.latest_gesture_result else 0
                    self.btn_snap.label = f"RAISE BOTH HANDS 🙌 ({ready_c}/{face_cnt})"
                    self.btn_snap.bg_color = ui.ACCENT_RED

            # Render Center View: Waiting Screen OR Feature Grid View OR Live Camera Feed
            if self.showing_waiting_screen:
                elapsed_wait = time.time() - self.waiting_screen_start_time if self.waiting_screen_start_time > 0 else 0.0
                self.waiting_screen.render(self.screen, elapsed_wait)
            elif self.showing_feature_grid and (self.latest_people_features or self.latest_collage is not None):
                self.screen.fill((236, 238, 238))
                elapsed_anim = time.time() - self.feature_grid_anim_start if self.feature_grid_anim_start > 0 else -1.0
                grid_view = self.collage_generator.generate_feature_grid_view(
                    people_features=self.latest_people_features,
                    active_hybrid_idx=self.feature_grid_collage_idx,
                    timestamp_str=self.latest_timestamp_str,
                    anim_time=elapsed_anim,
                )
                gh, gw = grid_view.shape[:2]
                avail_w = sw
                avail_h = sh - 75
                scale = min(avail_w / gw, avail_h / gh)
                draw_w = int(gw * scale)
                draw_h = int(gh * scale)
                col_x = (sw - draw_w) // 2
                col_y = (avail_h - draw_h) // 2

                rgb_grid = cv2.cvtColor(grid_view, cv2.COLOR_BGR2RGB)
                grid_surf = pygame.image.frombuffer(
                    rgb_grid.tobytes(), (gw, gh), "RGB"
                )
                if (draw_w, draw_h) != (gw, gh):
                    grid_surf = pygame.transform.smoothscale(
                        grid_surf, (draw_w, draw_h)
                    )

                self.screen.blit(grid_surf, (col_x, col_y))

            else:
                # Clear background
                self.screen.fill(ui.BG_DARK)

                # Top Header Bar
                header_rect = pygame.Rect(0, 0, sw, 52)
                pygame.draw.rect(self.screen, ui.SURFACE_DARK, header_rect)
                pygame.draw.line(self.screen, ui.SURFACE_BORDER, (0, 52), (sw, 52), 1)

                # Title
                title_surf = self.font_title.render("PHOTOBOOTH STUDIO", True, ui.TEXT_WHITE)
                self.screen.blit(title_surf, (24, 14))

                # Counter / Status badge
                mode_badge = "DEMO (SIMULATED)" if self.camera.is_simulated else "LIVE WEBCAM"
                if can_snap:
                    face_badge = f"✅ {face_cnt} Faces (Ready!)"
                    badge_color = (50, 220, 100)
                else:
                    face_badge = f"⚠️ Need {self.min_faces_required} Faces ({face_cnt}/{self.min_faces_required})"
                    badge_color = ui.ACCENT_AMBER
                status_text = f"● {mode_badge}   |   {face_badge}   |   {self.photos_taken_count} Snaps"
                status_surf = self.font_btn.render(status_text, True, badge_color)
                self.screen.blit(status_surf, (sw - status_surf.get_width() - 24, 16))

                # Render Camera Feed (Letterboxed / Pillarboxed to preserve aspect ratio)
                if success and frame is not None:
                    fh, fw = frame.shape[:2]
                    avail_w = sw - 48
                    avail_h = sh - 52 - 80 - 24  # subtract header and footer bar
                    scale = min(avail_w / fw, avail_h / fh)
                    draw_w = int(fw * scale)
                    draw_h = int(fh * scale)
                    cam_x = (sw - draw_w) // 2
                    cam_y = 52 + (avail_h - draw_h) // 2 + 12

                    # Convert OpenCV BGR to Pygame RGB
                    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    frame_surf = pygame.image.frombuffer(
                        rgb_frame.tobytes(), (fw, fh), "RGB"
                    )
                    if (draw_w, draw_h) != (fw, fh):
                        frame_surf = pygame.transform.smoothscale(
                            frame_surf, (draw_w, draw_h)
                        )

                    # Frame outline
                    view_rect = pygame.Rect(cam_x, cam_y, draw_w, draw_h)
                    pygame.draw.rect(self.screen, (35, 38, 48), view_rect.inflate(8, 8), border_radius=8)
                    self.screen.blit(frame_surf, (cam_x, cam_y))

                    # Viewfinder guidelines
                    ui.draw_viewfinder_guides(self.screen, view_rect)

                    # Draw Live Face Detection Boxes
                    for face_info in self.detected_faces:
                        bx, by, bw, bh = face_info["box"]
                        s_x = cam_x + int(bx * scale)
                        s_y = cam_y + int(by * scale)
                        s_w = int(bw * scale)
                        s_h = int(bh * scale)
                        ui.draw_face_box(
                            self.screen,
                            pygame.Rect(s_x, s_y, s_w, s_h),
                            confidence=face_info.get("confidence", 1.0),
                        )

                    # Draw Hands & Group Gesture Feedback on Viewfinder
                    if self.latest_gesture_result is not None:
                        self.gesture_detector.draw_feedback(
                            screen=self.screen,
                            view_rect=view_rect,
                            scale=scale,
                            cam_x=cam_x,
                            cam_y=cam_y,
                            detected_faces=self.detected_faces,
                            result=self.latest_gesture_result,
                            font_pill=self.font_btn,
                            font_badge=self.font_hint,
                        )

            if not self.showing_waiting_screen:
                # Bottom Control Bar
                footer_rect = pygame.Rect(0, sh - 80, sw, 80)
                pygame.draw.rect(self.screen, ui.SURFACE_DARK, footer_rect)
                pygame.draw.line(self.screen, ui.SURFACE_BORDER, (0, sh - 80), (sw, sh - 80), 1)

                for b in self.buttons:
                    b.draw(self.screen, self.font_btn, self.font_hint)

                # Countdown Overlay
                self.countdown_overlay.draw(self.screen, self.font_giant, self.font_title)

            # Overlays: Flash and Preview Toast
            self.flash_overlay.draw(self.screen)
            self.preview_toast.draw(self.screen, self.font_toast_title, self.font_toast_desc)

            pygame.display.flip()
            self.clock.tick(30)

        # Cleanup
        self.camera.release()
        pygame.quit()
        print("[Photobooth] Closed cleanly.")


def main():
    parser = argparse.ArgumentParser(description="Photobooth Studio (v4)")
    parser.add_argument(
        "--save-dir",
        default="photos",
        help="Directory where captured photos are saved (default: 'photos')",
    )
    parser.add_argument(
        "--camera",
        type=int,
        default=0,
        help="Camera device index (default: 0)",
    )
    parser.add_argument(
        "--width",
        type=int,
        default=1280,
        help="Target camera capture width (default: 1280)",
    )
    parser.add_argument(
        "--height",
        type=int,
        default=720,
        help="Target camera capture height (default: 720)",
    )
    parser.add_argument(
        "--min-faces",
        type=int,
        default=3,
        help="Minimum faces required to take a photo (default: 3)",
    )
    parser.add_argument(
        "--no-mirror",
        action="store_true",
        help="Disable horizontal mirror reflection",
    )
    parser.add_argument(
        "--fullscreen",
        action="store_true",
        help="Start in fullscreen mode",
    )
    parser.add_argument(
        "--idle-timeout",
        type=float,
        default=15.0,
        help="Seconds of inactivity before entering Waiting Screen (default: 15.0)",
    )

    args = parser.parse_args()

    app = PhotoboothApp(
        save_dir=args.save_dir,
        camera_index=args.camera,
        cam_width=args.width,
        cam_height=args.height,
        mirror=not args.no_mirror,
        fullscreen=args.fullscreen,
        min_faces=args.min_faces,
        idle_timeout=args.idle_timeout,
    )
    app.run()


if __name__ == "__main__":
    main()
