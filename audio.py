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
        self.slot_tick_sound = self._create_slot_tick()
        self.slot_lock_sound = self._create_slot_lock()
        self.line_sweep_sound = self._create_line_sweep()

    def _create_slot_tick(self):
        if not self.enabled:
            return None
        try:
            sample_rate = 22050
            duration = 0.018
            n_samples = int(sample_rate * duration)
            t = np.linspace(0, duration, n_samples, endpoint=False)
            wave = (np.random.rand(n_samples) * 2 - 1) * np.exp(-t * 220.0)
            audio = (wave * 20000).astype(np.int16)
            return pygame.sndarray.make_sound(audio)
        except Exception:
            return None

    def _create_slot_lock(self):
        if not self.enabled:
            return None
        try:
            sample_rate = 22050
            duration = 0.14
            n_samples = int(sample_rate * duration)
            t = np.linspace(0, duration, n_samples, endpoint=False)
            wave = (np.sin(2 * math.pi * 1046.5 * t) + 0.35 * np.sin(2 * math.pi * 2093.0 * t)) * np.exp(-t * 18.0)
            audio = (wave * 22000).astype(np.int16)
            return pygame.sndarray.make_sound(audio)
        except Exception:
            return None

    def _create_line_sweep(self):
        if not self.enabled:
            return None
        try:
            sample_rate = 22050
            duration = 0.35
            n_samples = int(sample_rate * duration)
            t = np.linspace(0, duration, n_samples, endpoint=False)
            freq = 523.25 + (1046.5 - 523.25) * ((t / duration) ** 1.3)
            wave = np.sin(2 * math.pi * freq * t) * np.exp(-t * 3.5)
            audio = (wave * 20000).astype(np.int16)
            return pygame.sndarray.make_sound(audio)
        except Exception:
            return None

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

    def play_slot_tick(self):
        if not self.enabled:
            return
        if self.slot_tick_sound:
            try:
                self.slot_tick_sound.play()
            except Exception:
                pass

    def play_slot_lock(self):
        if not self.enabled:
            return
        if self.slot_lock_sound:
            try:
                self.slot_lock_sound.play()
            except Exception:
                pass

    def play_line_sweep(self):
        if not self.enabled:
            return
        if self.line_sweep_sound:
            try:
                self.line_sweep_sound.play()
            except Exception:
                pass
