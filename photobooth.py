#!/usr/bin/env python3
"""
Photobooth Application (v1)
A native desktop photobooth app featuring camera access, live mirrored preview,
countdown timer, flash effect, audio cues, and direct saving to disk.
"""

import os
import sys
import time
import argparse
from datetime import datetime

# Import pygame before cv2 to avoid SDL symbol conflict warnings on macOS
import pygame
import cv2

from camera import Camera
from face_detector import FaceDetector
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
        window_width: int = 1100,
        window_height: int = 750,
    ):
        self.save_dir = os.path.abspath(save_dir)
        os.makedirs(self.save_dir, exist_ok=True)

        self.cam_width = cam_width
        self.cam_height = cam_height
        self.mirror = mirror
        self.is_fullscreen = fullscreen
        self.window_width = window_width
        self.window_height = window_height
        self.saved_window_w = window_width
        self.saved_window_h = window_height

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

        # Face Detector
        self.face_detector = FaceDetector()
        self.detected_faces = []
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

        # Primary action: Snap
        btn_snap = ui.Button(
            rect=pygame.Rect(0, 0, 190, btn_h),
            label="SNAP PHOTO",
            shortcut="SPACE",
            bg_color=ui.ACCENT_RED,
            hover_color=(250, 90, 90),
            on_click=self.take_photo,
        )

        # Timer action: 3s Countdown
        btn_timer = ui.Button(
            rect=pygame.Rect(0, 0, 190, btn_h),
            label="3s TIMER",
            shortcut="C",
            bg_color=ui.ACCENT_BLUE,
            hover_color=(75, 145, 255),
            on_click=self.start_countdown,
        )

        # Fullscreen toggle
        btn_fs_label = "WINDOWED" if self.is_fullscreen else "FULLSCREEN"
        btn_fs = ui.Button(
            rect=pygame.Rect(0, 0, 150, btn_h),
            label=btn_fs_label,
            shortcut="F",
            bg_color=ui.SURFACE_DARK,
            on_click=self.toggle_fullscreen,
        )

        # Quit
        btn_quit = ui.Button(
            rect=pygame.Rect(0, 0, 110, btn_h),
            label="QUIT",
            shortcut="ESC",
            bg_color=ui.SURFACE_DARK,
            hover_color=(55, 30, 30),
            on_click=self.quit,
        )

        all_btns = [btn_snap, btn_timer, btn_fs, btn_quit]
        total_w = sum(b.rect.width for b in all_btns) + (len(all_btns) - 1) * 16
        start_x = max(20, (sw - total_w) // 2)

        curr_x = start_x
        for b in all_btns:
            b.rect.x = curr_x
            b.rect.y = btn_y
            curr_x += b.rect.width + 16

        self.buttons = all_btns

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

    def start_countdown(self):
        if not self.countdown_overlay.is_active:
            self.countdown_overlay.start()

    def take_photo(self):
        """Captures the current frame, detects faces, and saves both full & cropped images."""
        success, frame = self.camera.read_frame()
        if not success or frame is None:
            print("[Photobooth] Error: Failed to capture frame.")
            return

        # Generate unique timestamped filename
        timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
        base_filename = f"photobooth_{timestamp_str}.jpg"
        file_path = os.path.join(self.save_dir, base_filename)

        # Handle rare rapid snaps in same second
        idx = 1
        while os.path.exists(file_path):
            base_filename = f"photobooth_{timestamp_str}_{idx}.jpg"
            file_path = os.path.join(self.save_dir, base_filename)
            idx += 1

        # 1. Save Full Photo
        saved = self.camera.save_frame(frame, file_path)
        if not saved:
            print(f"[Photobooth] Error: Could not write photo to {file_path}")
            return

        self.photos_taken_count += 1
        filename = os.path.basename(file_path)
        print(f"[Photobooth] 📸 Full photo #{self.photos_taken_count} saved to: {file_path}")

        # 2. Detect and Crop Faces
        sim_box = self.camera.get_simulated_face_box()
        faces = self.face_detector.detect_faces(frame, fallback_box=sim_box)

        primary_face_crop = None
        primary_face_filename = ""

        if faces:
            print(f"[Photobooth] 👤 Detected {len(faces)} face(s) in photo:")
            name_root, ext = os.path.splitext(base_filename)
            for f_idx, face_info in enumerate(faces):
                face_crop = self.face_detector.crop_face(
                    frame, face_info["box"], padding_ratio=self.crop_padding, square=True
                )
                if face_crop is not None and face_crop.size > 0:
                    if len(faces) == 1:
                        f_filename = f"{name_root}_face{ext}"
                    else:
                        f_filename = f"{name_root}_face{f_idx + 1}{ext}"

                    f_path = os.path.join(self.save_dir, f_filename)
                    if self.camera.save_frame(face_crop, f_path):
                        print(f"   └── Saved cropped face: {f_path}")
                        if f_idx == 0:
                            primary_face_crop = face_crop
                            primary_face_filename = f_filename
        else:
            print("[Photobooth] ℹ️  No faces detected in this shot.")

        # Visual & Audio feedback
        self.flash_overlay.trigger()
        self.audio.play_shutter()
        self.preview_toast.show(
            frame,
            filename,
            face_bgr_image=primary_face_crop,
            face_filename=primary_face_filename,
        )

    def quit(self):
        self.running = False

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

            if event.type == pygame.KEYDOWN:
                if event.key in (pygame.K_ESCAPE, pygame.K_q):
                    self.quit()
                    return
                elif event.key == pygame.K_SPACE:
                    # Instant snap
                    self.take_photo()
                elif event.key in (pygame.K_c, pygame.K_RETURN):
                    # 3-second countdown
                    self.start_countdown()
                elif event.key == pygame.K_f:
                    self.toggle_fullscreen()

            # Handle button clicks
            for b in self.buttons:
                if b.handle_event(event):
                    break

    def run(self):
        print(f"[Photobooth] Started. Photos will be saved to: {self.save_dir}")
        print("  - Controls: SPACE = Take photo | C = 3s Countdown | F = Fullscreen | Q/ESC = Quit")

        while self.running:
            self.handle_events()

            # Update countdown state
            if self.countdown_overlay.update():
                # Countdown finished -> take photo!
                self.take_photo()

            # Read latest camera frame
            success, frame = self.camera.read_frame()
            sw, sh = self.screen.get_size()

            # Live face detection
            if success and frame is not None:
                sim_box = self.camera.get_simulated_face_box()
                self.detected_faces = self.face_detector.detect_faces(frame, fallback_box=sim_box)

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
            badge_color = ui.ACCENT_AMBER if self.camera.is_simulated else (50, 200, 100)
            face_cnt = len(self.detected_faces)
            face_label = f"{face_cnt} Face" if face_cnt == 1 else f"{face_cnt} Faces"
            status_text = f"● {mode_badge}   |   👤 {face_label}   |   {self.photos_taken_count} Snaps"
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

            # Bottom Control Bar
            footer_rect = pygame.Rect(0, sh - 80, sw, 80)
            pygame.draw.rect(self.screen, ui.SURFACE_DARK, footer_rect)
            pygame.draw.line(self.screen, ui.SURFACE_BORDER, (0, sh - 80), (sw, sh - 80), 1)

            for b in self.buttons:
                b.draw(self.screen, self.font_btn, self.font_hint)

            # Overlays: Countdown, Flash, and Preview Toast
            self.countdown_overlay.draw(self.screen, self.font_giant, self.font_title)
            self.flash_overlay.draw(self.screen)
            self.preview_toast.draw(self.screen, self.font_toast_title, self.font_toast_desc)

            pygame.display.flip()
            self.clock.tick(30)

        # Cleanup
        self.camera.release()
        pygame.quit()
        print("[Photobooth] Closed cleanly.")


def main():
    parser = argparse.ArgumentParser(description="Photobooth Studio (v1)")
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
        "--no-mirror",
        action="store_true",
        help="Disable horizontal mirror reflection",
    )
    parser.add_argument(
        "--fullscreen",
        action="store_true",
        help="Start in fullscreen mode",
    )

    args = parser.parse_args()

    app = PhotoboothApp(
        save_dir=args.save_dir,
        camera_index=args.camera,
        cam_width=args.width,
        cam_height=args.height,
        mirror=not args.no_mirror,
        fullscreen=args.fullscreen,
    )
    app.run()


if __name__ == "__main__":
    main()
