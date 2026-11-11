"""
Waiting Screen (Attractor Screen) for Photobooth Studio (V4).
Displays an infinite multi-row horizontal carousel of all detected faces collected
throughout the runtime of the application (and loaded from disk), with rows alternating
in scrolling direction.
"""

import os
import glob
import math
import time
from typing import List, Optional, Tuple

# Import pygame before cv2 to prevent macOS SDL2 symbol conflict warnings
import pygame
import cv2
import numpy as np


class WaitingScreenRenderer:
    """
    Renders an animated multi-row carousel of face crops alternating in direction,
    with seamless infinite wrapping, fallback placeholder cards, and Swiss minimalist UI.
    """

    def __init__(
        self,
        save_dir: str = "photos",
        tile_size: int = 150,
        gap: int = 16,
    ):
        self.save_dir = save_dir
        self.tile_size = tile_size
        self.gap = gap
        self.face_images: List[np.ndarray] = []
        self.surfaces: List[pygame.Surface] = []
        self.placeholder_surfaces: List[pygame.Surface] = []
        self._cached_tile_size: int = tile_size

        # Default alternating speeds (pixels per second)
        self.row_speeds = [-38.0, 44.0, -34.0, 48.0, -40.0, 42.0]

        # Typography fonts (initialized lazily to ensure pygame display/font is ready)
        self._fonts_initialized = False
        self.font_title: Optional[pygame.font.Font] = None
        self.font_subtitle: Optional[pygame.font.Font] = None
        self.font_badge: Optional[pygame.font.Font] = None
        self.font_hint: Optional[pygame.font.Font] = None

        # Load any existing faces from disk
        if os.path.exists(save_dir):
            self.load_faces_from_disk(save_dir)

    def _init_fonts(self):
        """Initializes default pygame fonts safely without SysFont."""
        if not self._fonts_initialized and pygame.font.get_init():
            self.font_title = pygame.font.Font(None, 46)
            self.font_subtitle = pygame.font.Font(None, 24)
            self.font_badge = pygame.font.Font(None, 22)
            self.font_hint = pygame.font.Font(None, 20)
            self._fonts_initialized = True

    def _create_thumbnail_surface(self, face_bgr: np.ndarray, target_size: int) -> pygame.Surface:
        """Converts an OpenCV BGR face crop into a styled Pygame Surface thumbnail."""
        h, w = face_bgr.shape[:2]
        if h == 0 or w == 0:
            surf = pygame.Surface((target_size, target_size))
            surf.fill((40, 44, 54))
            return surf

        # Center square crop if not 1:1
        if h != w:
            min_dim = min(h, w)
            sy = (h - min_dim) // 2
            sx = (w - min_dim) // 2
            face_bgr = face_bgr[sy : sy + min_dim, sx : sx + min_dim]

        resized = cv2.resize(face_bgr, (target_size, target_size), interpolation=cv2.INTER_AREA)
        rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)
        raw_surf = pygame.image.frombuffer(rgb.tobytes(), (target_size, target_size), "RGB")

        # Create tile surface with smooth border
        tile_surf = pygame.Surface((target_size, target_size), pygame.SRCALPHA)
        tile_surf.blit(raw_surf, (0, 0))

        # Thin elegant border and subtle corner rounding highlight
        border_rect = pygame.Rect(0, 0, target_size, target_size)
        pygame.draw.rect(tile_surf, (255, 255, 255, 60), border_rect, width=1, border_radius=8)

        return tile_surf

    def _generate_placeholders(self, target_size: int) -> List[pygame.Surface]:
        """Generates minimalist Swiss-style placeholder cards when no user photos exist."""
        placeholders = []
        base_hues = [
            (35, 38, 48),
            (44, 48, 60),
            (50, 42, 54),
            (38, 48, 52),
            (48, 42, 42),
            (42, 44, 56),
        ]
        accent_hues = [
            (235, 68, 68),
            (56, 128, 255),
            (245, 175, 45),
            (228, 75, 125),
            (80, 200, 120),
            (160, 120, 240),
        ]

        if not pygame.font.get_init():
            pygame.font.init()
        font_num = pygame.font.Font(None, 24)
        font_lbl = pygame.font.Font(None, 18)

        for i in range(12):
            surf = pygame.Surface((target_size, target_size), pygame.SRCALPHA)
            bg = base_hues[i % len(base_hues)]
            acc = accent_hues[i % len(accent_hues)]

            # Background fill
            pygame.draw.rect(surf, bg, (0, 0, target_size, target_size), border_radius=8)
            pygame.draw.rect(surf, (255, 255, 255, 40), (0, 0, target_size, target_size), width=1, border_radius=8)

            # Stylized geometric face icon (circle head + shoulders arch)
            cx, cy = target_size // 2, target_size // 2 - 10
            r = int(target_size * 0.22)
            pygame.draw.circle(surf, acc, (cx, cy), r, width=2)
            pygame.draw.circle(surf, (acc[0], acc[1], acc[2], 50), (cx, cy), r - 2)

            # Shoulders arch
            shoulder_rect = pygame.Rect(cx - int(r * 1.5), cy + r + 4, int(r * 3), int(r * 1.6))
            pygame.draw.arc(surf, acc, shoulder_rect, 0.2, math.pi - 0.2, width=2)

            # Label at bottom
            label_surf = font_lbl.render(f"GUEST #{i + 1:02d}", True, (200, 205, 215))
            surf.blit(label_surf, (cx - label_surf.get_width() // 2, target_size - 24))

            placeholders.append(surf)

        return placeholders

    def load_faces_from_disk(self, save_dir: str):
        """Scans save directory for all cropped face images from prior sessions."""
        if not os.path.isdir(save_dir):
            return

        # Look for pattern photobooth_*_person*.jpg or photobooth_*_face*.jpg
        # Exclude hybrids, collages, or sub-features (eyes, nose, mouth, ears)
        all_jpgs = glob.glob(os.path.join(save_dir, "*.jpg"))
        face_files = []
        for p in all_jpgs:
            base = os.path.basename(p)
            # Must contain _person or _face
            if "_person" in base or "_face" in base:
                # Exclude sub-features
                if not any(feat in base for feat in ["_eyes", "_nose", "_mouth", "_ears", "_hybrid", "_collage"]):
                    face_files.append(p)

        face_files.sort(key=lambda x: os.path.getmtime(x))
        loaded_cnt = 0
        for fpath in face_files:
            try:
                img = cv2.imread(fpath)
                if img is not None and img.size > 0:
                    self.add_face(img, rebuild_surface=False)
                    loaded_cnt += 1
            except Exception as e:
                print(f"[WaitingScreen] Warning: Could not read {fpath}: {e}")

        if loaded_cnt > 0:
            print(f"[WaitingScreen] 👥 Loaded {loaded_cnt} existing face crop(s) from {save_dir}")
            self._rebuild_all_surfaces()

    def add_face(self, face_bgr: np.ndarray, rebuild_surface: bool = True):
        """Adds a newly detected face crop to the active waiting screen gallery."""
        if face_bgr is None or face_bgr.size == 0:
            return
        self.face_images.append(face_bgr)
        if rebuild_surface:
            surf = self._create_thumbnail_surface(face_bgr, self.tile_size)
            self.surfaces.append(surf)

    def _rebuild_all_surfaces(self):
        """Rebuilds cached Pygame surfaces for all loaded face images."""
        self.surfaces = [
            self._create_thumbnail_surface(img, self.tile_size)
            for img in self.face_images
        ]

    def get_display_surfaces(self) -> List[pygame.Surface]:
        """Returns the list of surfaces to display (or placeholders if empty)."""
        if self.surfaces:
            return self.surfaces
        if not self.placeholder_surfaces:
            self.placeholder_surfaces = self._generate_placeholders(self.tile_size)
        return self.placeholder_surfaces

    def get_row_velocity(self, row_idx: int) -> float:
        """Returns the signed velocity in pixels/second for row_idx (alternating signs)."""
        base_speed = self.row_speeds[row_idx % len(self.row_speeds)]
        # Ensure direction alternates strictly: even = negative (left), odd = positive (right)
        direction = -1.0 if (row_idx % 2 == 0) else 1.0
        return direction * abs(base_speed)

    def render(self, screen: pygame.Surface, elapsed_time: float):
        """
        Renders the full-screen animated carousel and attractor overlay.
        """
        self._init_fonts()
        sw, sh = screen.get_size()

        # Fill background with deep sleek studio dark
        screen.fill((16, 17, 22))

        surfaces = self.get_display_surfaces()
        num_surfaces = len(surfaces)

        # Dynamic row calculation based on current screen height
        item_w = self.tile_size + self.gap
        item_h = self.tile_size + self.gap

        # Calculate number of rows that comfortably fit
        num_rows = max(3, min(6, (sh + self.gap) // item_h))
        total_grid_h = num_rows * item_h - self.gap
        start_y = (sh - total_grid_h) // 2

        # Draw each carousel row
        for r in range(num_rows):
            row_y = start_y + r * item_h
            velocity = self.get_row_velocity(r)
            # Continuous scroll position
            scroll_x = (velocity * elapsed_time)

            # We create an infinite tiling sequence of items
            # Determine minimum pattern items required to cover screen + buffer
            min_items_needed = math.ceil(sw / item_w) + 3
            repeats = max(1, math.ceil(min_items_needed / max(1, num_surfaces)))
            pattern_len = num_surfaces * repeats
            pattern_width = pattern_len * item_w

            # Modulo wrap for seamless continuity
            offset_x = (scroll_x % pattern_width)
            if offset_x > 0:
                offset_x -= pattern_width

            # Render tiles in row across screen
            tile_start_idx = (r * 3) % num_surfaces  # stagger starting faces between rows
            curr_x = offset_x
            idx = 0
            while curr_x < sw + item_w:
                surf_idx = (tile_start_idx + idx) % num_surfaces
                surf = surfaces[surf_idx]

                if curr_x + self.tile_size >= -item_w and curr_x <= sw:
                    screen.blit(surf, (int(curr_x), int(row_y)))

                curr_x += item_w
                idx += 1

        # Render Ambient Vignette / Semi-transparent Central Dimmer
        # Gives great contrast to the central attractor card
        dim_surf = pygame.Surface((sw, sh), pygame.SRCALPHA)
        # Subtle horizontal band darkening
        pygame.draw.rect(dim_surf, (12, 13, 17, 160), (0, 0, sw, sh))
        screen.blit(dim_surf, (0, 0))

        # Central Attractor Card (Swiss Minimalist Design)
        self._render_attractor_card(screen, sw, sh, elapsed_time)

    def _render_attractor_card(
        self,
        screen: pygame.Surface,
        sw: int,
        sh: int,
        elapsed_time: float,
    ):
        """Draws the floating central standby card with pulse and instructions."""
        card_w = min(680, sw - 48)
        card_h = 240
        card_x = (sw - card_w) // 2
        card_y = (sh - card_h) // 2

        card_surf = pygame.Surface((card_w, card_h), pygame.SRCALPHA)

        # Frosted glass dark background with soft glow border
        pulse = 0.5 + 0.5 * math.sin(elapsed_time * 2.5)
        border_alpha = int(140 + pulse * 90)
        border_col = (228, 75, 125, border_alpha)  # Vibrant accent pink #E44B7D

        pygame.draw.rect(card_surf, (20, 22, 28, 235), (0, 0, card_w, card_h), border_radius=16)
        pygame.draw.rect(card_surf, border_col, (0, 0, card_w, card_h), width=2, border_radius=16)

        # Header Badge: "PHOTOBOOTH STUDIO"
        if self.font_subtitle:
            sub_surf = self.font_subtitle.render("PHOTOBOOTH STUDIO", True, (228, 75, 125))
            card_surf.blit(sub_surf, (card_w // 2 - sub_surf.get_width() // 2, 26))

        # Main Headline: "Step Up to the Camera"
        if self.font_title:
            title_surf = self.font_title.render("Step Up to the Camera", True, (250, 250, 252))
            card_surf.blit(title_surf, (card_w // 2 - title_surf.get_width() // 2, 60))

        # 3-Face Requirement Pill
        pill_w = 340
        pill_h = 36
        pill_x = (card_w - pill_w) // 2
        pill_y = 120
        pill_rect = pygame.Rect(pill_x, pill_y, pill_w, pill_h)
        pygame.draw.rect(card_surf, (35, 38, 50, 240), pill_rect, border_radius=18)
        pygame.draw.rect(card_surf, (70, 75, 95), pill_rect, width=1, border_radius=18)

        if self.font_badge:
            req_text = "👥  3 Faces Required for Chimeric Mix"
            badge_surf = self.font_badge.render(req_text, True, (245, 185, 55))
            card_surf.blit(
                badge_surf,
                (pill_x + (pill_w - badge_surf.get_width()) // 2, pill_y + (pill_h - badge_surf.get_height()) // 2),
            )

        # Action Prompt with pulsing arrow
        if self.font_hint:
            prompt_alpha = int(180 + pulse * 75)
            prompt_text = "Press the big button or step into view to begin  ●"
            prompt_surf = self.font_hint.render(prompt_text, True, (200, 205, 220))
            card_surf.blit(prompt_surf, (card_w // 2 - prompt_surf.get_width() // 2, 178))

        # Blit card to screen
        screen.blit(card_surf, (card_x, card_y))

        # Bottom minimal footer
        if self.font_hint:
            footer_text = f"Collected {len(self.face_images)} face portraits  |  Press SPACE, W, or tap screen to wake"
            footer_surf = self.font_hint.render(footer_text, True, (110, 115, 130))
            screen.blit(footer_surf, (sw // 2 - footer_surf.get_width() // 2, sh - 30))
