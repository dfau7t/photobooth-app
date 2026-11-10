"""
UI Components for the Photobooth app.
Includes buttons, overlays (countdown, flash), viewfinder guides,
and polaroid preview notification.
"""

import time
import math
from typing import Tuple, Optional, Callable
import numpy as np
import pygame


# Color Palette
BG_DARK = (18, 19, 24)
SURFACE_DARK = (28, 30, 38)
SURFACE_BORDER = (50, 54, 68)
ACCENT_AMBER = (245, 175, 45)
ACCENT_RED = (235, 68, 68)
ACCENT_BLUE = (56, 128, 255)
TEXT_WHITE = (245, 245, 250)
TEXT_MUTED = (140, 145, 160)


class Button:
    """Clickable UI button with hover animations and keyboard shortcut hints."""

    def __init__(
        self,
        rect: pygame.Rect,
        label: str,
        shortcut: str = "",
        bg_color: Tuple[int, int, int] = SURFACE_DARK,
        hover_color: Tuple[int, int, int] = (45, 48, 62),
        text_color: Tuple[int, int, int] = TEXT_WHITE,
        on_click: Optional[Callable[[], None]] = None,
    ):
        self.rect = pygame.Rect(rect)
        self.label = label
        self.shortcut = shortcut
        self.bg_color = bg_color
        self.hover_color = hover_color
        self.text_color = text_color
        self.on_click = on_click
        self.is_hovered = False

    def update(self, mouse_pos: Tuple[int, int]):
        self.is_hovered = self.rect.collidepoint(mouse_pos)

    def handle_event(self, event: pygame.event.Event) -> bool:
        if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
            if self.rect.collidepoint(event.pos):
                if self.on_click:
                    self.on_click()
                return True
        return False

    def draw(self, surface: pygame.Surface, font: pygame.font.Font, hint_font: pygame.font.Font):
        # Background
        color = self.hover_color if self.is_hovered else self.bg_color
        pygame.draw.rect(surface, color, self.rect, border_radius=10)

        # Border
        border_color = (
            (min(color[0] + 50, 255), min(color[1] + 50, 255), min(color[2] + 50, 255))
            if self.is_hovered
            else SURFACE_BORDER
        )
        pygame.draw.rect(surface, border_color, self.rect, width=2, border_radius=10)

        # Label text
        label_surf = font.render(self.label, True, self.text_color)
        if self.shortcut:
            hint_surf = hint_font.render(f"[{self.shortcut}]", True, TEXT_MUTED)
            total_w = label_surf.get_width() + hint_surf.get_width() + 8
            start_x = self.rect.centerx - total_w // 2

            surface.blit(
                label_surf,
                (start_x, self.rect.centery - label_surf.get_height() // 2),
            )
            surface.blit(
                hint_surf,
                (
                    start_x + label_surf.get_width() + 8,
                    self.rect.centery - hint_surf.get_height() // 2,
                ),
            )
        else:
            surf_rect = label_surf.get_rect(center=self.rect.center)
            surface.blit(label_surf, surf_rect)


class FlashOverlay:
    """Screen flash animation triggered when a photo is taken."""

    def __init__(self, duration: float = 0.25):
        self.duration = duration
        self.flash_start: Optional[float] = None

    def trigger(self):
        self.flash_start = time.time()

    def draw(self, surface: pygame.Surface):
        if self.flash_start is None:
            return
        elapsed = time.time() - self.flash_start
        if elapsed >= self.duration:
            self.flash_start = None
            return

        alpha = int(255 * (1.0 - (elapsed / self.duration)))
        flash_surf = pygame.Surface(surface.get_size(), pygame.SRCALPHA)
        flash_surf.fill((255, 255, 255, alpha))
        surface.blit(flash_surf, (0, 0))


class CountdownOverlay:
    """Countdown overlay for photo booth 3-2-1 sequence."""

    def __init__(self, seconds: int = 3, on_beep: Optional[Callable[[bool], None]] = None):
        self.total_seconds = seconds
        self.is_active = False
        self.start_time: float = 0.0
        self.current_number: Optional[int] = None
        self.on_beep = on_beep

    def start(self):
        self.is_active = True
        self.start_time = time.time()
        self.current_number = self.total_seconds
        if self.on_beep:
            self.on_beep(False)

    def cancel(self):
        self.is_active = False
        self.current_number = None

    def update(self) -> bool:
        """
        Updates countdown state.
        Returns True when countdown finishes and photo should be taken.
        """
        if not self.is_active:
            return False

        elapsed = time.time() - self.start_time
        remaining = self.total_seconds - elapsed

        if remaining <= 0:
            self.is_active = False
            self.current_number = None
            return True

        number = int(math.ceil(remaining))
        if number != self.current_number:
            self.current_number = number
            is_final = (number == 1)
            if self.on_beep:
                self.on_beep(is_final)

        return False

    def draw(self, surface: pygame.Surface, font_giant: pygame.font.Font, font_sub: pygame.font.Font):
        if not self.is_active:
            return

        elapsed = time.time() - self.start_time
        remaining = max(0.0, self.total_seconds - elapsed)

        # Pulse effect based on fraction of current second
        frac = remaining - math.floor(remaining)
        scale = 1.0 + 0.15 * math.sin(frac * math.pi)

        cx, cy = surface.get_width() // 2, surface.get_height() // 2

        # Dimmed backdrop circle
        overlay = pygame.Surface(surface.get_size(), pygame.SRCALPHA)
        pygame.draw.circle(overlay, (0, 0, 0, 140), (cx, cy), int(120 * scale))
        pygame.draw.circle(overlay, ACCENT_AMBER, (cx, cy), int(120 * scale), width=6)
        surface.blit(overlay, (0, 0))

        # Text display
        if remaining < 0.4:
            txt = "SMILE!"
            color = ACCENT_AMBER
        else:
            txt = str(int(math.ceil(remaining)))
            color = TEXT_WHITE

        text_surf = font_giant.render(txt, True, color)
        text_rect = text_surf.get_rect(center=(cx, cy - 10))
        surface.blit(text_surf, text_rect)

        sub_surf = font_sub.render("GET READY", True, TEXT_MUTED)
        sub_rect = sub_surf.get_rect(center=(cx, cy + 65))
        surface.blit(sub_surf, sub_rect)


class PreviewToast:
    """Floating polaroid-style card displaying the last captured photo and face crop."""

    def __init__(self, display_duration: float = 4.5):
        self.display_duration = display_duration
        self.start_time: Optional[float] = None
        self.thumbnail_surface: Optional[pygame.Surface] = None
        self.face_thumbnail_surface: Optional[pygame.Surface] = None
        self.saved_filename: str = ""
        self.face_filename: str = ""

    def show(
        self,
        bgr_image,
        filename: str,
        face_bgr_image: Optional[np.ndarray] = None,
        face_filename: str = "",
    ):
        self.saved_filename = filename
        self.face_filename = face_filename
        self.start_time = time.time()

        # Convert OpenCV BGR image to Pygame Surface thumbnail
        import cv2
        h, w = bgr_image.shape[:2]
        thumb_w = 180
        thumb_h = int(h * (thumb_w / w))
        resized = cv2.resize(bgr_image, (thumb_w, thumb_h))
        rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)
        self.thumbnail_surface = pygame.image.frombuffer(
            rgb.tobytes(), (thumb_w, thumb_h), "RGB"
        )

        # Convert face crop if present
        if face_bgr_image is not None and face_bgr_image.size > 0:
            fh, fw = face_bgr_image.shape[:2]
            f_size = 70
            f_resized = cv2.resize(face_bgr_image, (f_size, f_size))
            f_rgb = cv2.cvtColor(f_resized, cv2.COLOR_BGR2RGB)
            self.face_thumbnail_surface = pygame.image.frombuffer(
                f_rgb.tobytes(), (f_size, f_size), "RGB"
            )
        else:
            self.face_thumbnail_surface = None

    def draw(self, surface: pygame.Surface, font_title: pygame.font.Font, font_desc: pygame.font.Font):
        if self.start_time is None or self.thumbnail_surface is None:
            return

        elapsed = time.time() - self.start_time
        if elapsed >= self.display_duration:
            self.start_time = None
            self.thumbnail_surface = None
            self.face_thumbnail_surface = None
            return

        # Slide-in / fade-out alpha
        alpha = 255
        if elapsed > self.display_duration - 1.0:
            fade_frac = (self.display_duration - elapsed)
            alpha = max(0, min(255, int(255 * fade_frac)))

        thumb_w, thumb_h = self.thumbnail_surface.get_size()
        has_face = self.face_thumbnail_surface is not None
        card_w = thumb_w + (90 if has_face else 24)
        card_h = thumb_h + 60

        card_x = surface.get_width() - card_w - 24
        card_y = 20

        card_surf = pygame.Surface((card_w, card_h), pygame.SRCALPHA)
        # White polaroid body with shadow
        card_surf.fill((250, 250, 250, alpha))
        pygame.draw.rect(card_surf, (200, 200, 205, alpha), card_surf.get_rect(), width=1, border_radius=6)

        # Blit main thumbnail inside
        thumb_with_alpha = self.thumbnail_surface.copy()
        thumb_with_alpha.set_alpha(alpha)
        card_surf.blit(thumb_with_alpha, (12, 12))

        # Blit face thumbnail if available
        if has_face and self.face_thumbnail_surface:
            face_with_alpha = self.face_thumbnail_surface.copy()
            face_with_alpha.set_alpha(alpha)
            fx = 12 + thumb_w + 10
            fy = 12
            # Face box outline
            pygame.draw.rect(card_surf, (230, 230, 235, alpha), pygame.Rect(fx - 2, fy - 2, 74, 74), border_radius=4)
            card_surf.blit(face_with_alpha, (fx, fy))
            face_tag = font_desc.render("CROP", True, (60, 60, 70))
            face_tag.set_alpha(alpha)
            card_surf.blit(face_tag, (fx + 18, fy + 78))

        # Bottom label
        tag_text = "FULL + FACE SAVED" if has_face else "SAVED TO DISK"
        tag_surf = font_desc.render(tag_text, True, (40, 160, 60))
        tag_surf.set_alpha(alpha)
        card_surf.blit(tag_surf, (12, 12 + thumb_h + 6))

        name_surf = font_title.render(self.saved_filename[:20], True, (30, 30, 35))
        name_surf.set_alpha(alpha)
        card_surf.blit(name_surf, (12, 12 + thumb_h + 24))

        surface.blit(card_surf, (card_x, card_y))


def draw_face_box(surface: pygame.Surface, rect: pygame.Rect, confidence: float = 1.0):
    """Draws sleek corner bracket guide around a detected face."""
    x, y, w, h = rect
    arm_len = max(12, min(24, w // 4))
    color = (50, 220, 120)  # Vibrant green/emerald for locked face
    thickness = 2

    # Draw corners
    # Top-Left
    pygame.draw.line(surface, color, (x, y), (x + arm_len, y), thickness)
    pygame.draw.line(surface, color, (x, y), (x, y + arm_len), thickness)
    # Top-Right
    pygame.draw.line(surface, color, (x + w, y), (x + w - arm_len, y), thickness)
    pygame.draw.line(surface, color, (x + w, y), (x + w, y + arm_len), thickness)
    # Bottom-Left
    pygame.draw.line(surface, color, (x, y + h), (x + arm_len, y + h), thickness)
    pygame.draw.line(surface, color, (x, y + h), (x, y + h - arm_len), thickness)
    # Bottom-Right
    pygame.draw.line(surface, color, (x + w, y + h), (x + w - arm_len, y + h), thickness)
    pygame.draw.line(surface, color, (x + w, y + h), (x + w, y + h - arm_len), thickness)


def draw_viewfinder_guides(surface: pygame.Surface, rect: pygame.Rect):
    """Draws elegant photobooth viewfinder corner markers and center target."""
    x, y, w, h = rect
    arm_len = 24
    color = ACCENT_AMBER
    thickness = 3

    # Top-Left
    pygame.draw.line(surface, color, (x, y), (x + arm_len, y), thickness)
    pygame.draw.line(surface, color, (x, y), (x, y + arm_len), thickness)

    # Top-Right
    pygame.draw.line(surface, color, (x + w, y), (x + w - arm_len, y), thickness)
    pygame.draw.line(surface, color, (x + w, y), (x + w, y + arm_len), thickness)

    # Bottom-Left
    pygame.draw.line(surface, color, (x, y + h), (x + arm_len, y + h), thickness)
    pygame.draw.line(surface, color, (x, y + h), (x, y + h - arm_len), thickness)

    # Bottom-Right
    pygame.draw.line(surface, color, (x + w, y + h), (x + w - arm_len, y + h), thickness)
    pygame.draw.line(surface, color, (x + w, y + h), (x + w, y + h - arm_len), thickness)

    # Center crosshair dots
    cx, cy = x + w // 2, y + h // 2
    guide_color = (255, 255, 255, 60)
    center_surf = pygame.Surface((30, 30), pygame.SRCALPHA)
    pygame.draw.circle(center_surf, guide_color, (15, 15), 4)
    pygame.draw.line(center_surf, guide_color, (15, 5), (15, 10), 1)
    pygame.draw.line(center_surf, guide_color, (15, 20), (15, 25), 1)
    pygame.draw.line(center_surf, guide_color, (5, 15), (10, 15), 1)
    pygame.draw.line(center_surf, guide_color, (20, 15), (25, 15), 1)
    surface.blit(center_surf, (cx - 15, cy - 15))
