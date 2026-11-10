"""
Audio module for photobooth sound effects (synthesized so no audio files needed).
"""

import math
import numpy as np
import pygame


class SoundEffects:
    def __init__(self):
        self.enabled = False
        try:
            pygame.mixer.init(frequency=22050, size=-16, channels=1, buffer=512)
            self.enabled = True
        except Exception:
            self.enabled = False

        self.beep_sound = self._create_beep(freq=880, duration=0.12)
        self.beep_final_sound = self._create_beep(freq=1320, duration=0.25)
        self.shutter_sound = self._create_shutter()

    def _create_beep(self, freq: float, duration: float):
        if not self.enabled:
            return None
        try:
            sample_rate = 22050
            n_samples = int(sample_rate * duration)
            t = np.linspace(0, duration, n_samples, endpoint=False)
            # Sine wave with exponential decay
            decay = np.exp(-t * 6.0)
            wave = 0.4 * np.sin(2 * math.pi * freq * t) * decay
            audio = (wave * 32767).astype(np.int16)
            return pygame.sndarray.make_sound(audio)
        except Exception:
            return None

    def _create_shutter(self):
        if not self.enabled:
            return None
        try:
            sample_rate = 22050
            duration = 0.15
            n_samples = int(sample_rate * duration)
            t = np.linspace(0, duration, n_samples, endpoint=False)
            noise = (np.random.rand(n_samples) * 2 - 1) * np.exp(-t * 25.0)
            audio = (noise * 28000).astype(np.int16)
            return pygame.sndarray.make_sound(audio)
        except Exception:
            return None

    def play_countdown_beep(self, is_final: bool = False):
        if not self.enabled:
            return
        sound = self.beep_final_sound if is_final else self.beep_sound
        if sound:
            try:
                sound.play()
            except Exception:
                pass

    def play_shutter(self):
        if not self.enabled:
            return
        if self.shutter_sound:
            try:
                self.shutter_sound.play()
            except Exception:
                pass
