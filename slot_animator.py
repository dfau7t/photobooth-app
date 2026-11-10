"""
Slot Machine Animation module for Photobooth Feature Breakdown Grid.
Simulates a tactile slot machine reel spinning row-by-row to select facial features
(eyes, nose, ears, lips/mouth), locks them in one by one, and then sweeps an animated
connecting line through the selected nodes, matching the Swiss minimalist design aesthetic.
"""

from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass


@dataclass
class RowState:
    name: str
    feature_key: str
    status: str  # 'waiting', 'spinning', 'locked'
    highlight_col: Optional[int]
    target_col: int
    is_locked: bool


@dataclass
class SlotAnimationState:
    anim_time: float
    rows: List[RowState]
    active_row_idx: int
    line_progress: float  # 0.0 to 3.0
    is_line_drawing: bool
    is_complete: bool
    base_col: int


class SlotMachineAnimator:
    """Controls the slot machine reel spin timing, lock-in easing, and line drawing progression."""

    ROW_DEFINITIONS = [
        ("eyes", "eyes"),
        ("nose", "nose"),
        ("ears", "ears"),
        ("lips", "mouth"),
    ]

    # Timing configuration (seconds)
    ROW_SPIN_DURATION = 0.70
    ROW_GAP = 0.10
    LINE_START_DELAY = 0.15
    LINE_DURATION = 1.05  # 0.35s per segment

    def __init__(self, selection: Dict[str, int], col_count: int = 3):
        self.col_count = max(1, col_count)
        self.selection = selection or {}
        self.base_col = int(self.selection.get("base", 0)) % self.col_count

        # Target column for each row
        self.target_cols = [
            int(self.selection.get("eyes", 0)) % self.col_count,
            int(self.selection.get("nose", 0)) % self.col_count,
            int(self.selection.get("left_ear", self.selection.get("ears", 0))) % self.col_count,
            int(self.selection.get("mouth", 0)) % self.col_count,
        ]

        # Calculate row start/end timestamps
        self.row_timings: List[Tuple[float, float]] = []
        curr_t = 0.0
        for _ in range(4):
            r_start = curr_t
            r_end = r_start + self.ROW_SPIN_DURATION
            self.row_timings.append((r_start, r_end))
            curr_t = r_end + self.ROW_GAP

        self.all_rows_locked_time = self.row_timings[-1][1]
        self.line_start_time = self.all_rows_locked_time + self.LINE_START_DELAY
        self.line_end_time = self.line_start_time + self.LINE_DURATION
        self.total_anim_duration = self.line_end_time

        # State tracking for sound events
        self.last_t = -1.0
        self.last_shifts: List[int] = [-1, -1, -1, -1]
        self.fired_locks: List[bool] = [False, False, False, False]
        self.fired_line_start = False
        self.fired_line_complete = False

        self.time_offset = 0.0
        self.is_skipped = False

    def reset(self):
        """Resets the animator to the beginning."""
        self.last_t = -1.0
        self.last_shifts = [-1, -1, -1, -1]
        self.fired_locks = [False, False, False, False]
        self.fired_line_start = False
        self.fired_line_complete = False
        self.time_offset = 0.0
        self.is_skipped = False

    def skip_to_end(self):
        """Fast-forwards animation immediately to the completed connected state."""
        self.is_skipped = True

    def get_state(self, raw_time: float) -> SlotAnimationState:
        """Returns the precise animation state for the given timestamp (seconds)."""
        if self.is_skipped or raw_time < 0:
            t = self.total_anim_duration + 0.1
        else:
            t = raw_time + self.time_offset

        row_states: List[RowState] = []
        active_row_idx = -1

        for r_idx in range(4):
            name, feat_key = self.ROW_DEFINITIONS[r_idx]
            target_col = self.target_cols[r_idx]
            r_start, r_end = self.row_timings[r_idx]

            if t < r_start:
                # Waiting to spin
                row_states.append(RowState(
                    name=name,
                    feature_key=feat_key,
                    status="waiting",
                    highlight_col=None,
                    target_col=target_col,
                    is_locked=False,
                ))
            elif r_start <= t < r_end:
                # Spinning! Ease-out deceleration landing on target_col
                active_row_idx = r_idx
                tau = max(0.0, min(1.0, (t - r_start) / self.ROW_SPIN_DURATION))
                prog = 1.0 - (1.0 - tau) ** 2.5
                n_shifts = 16
                shift = int(prog * n_shifts)
                col = (target_col - n_shifts + shift) % self.col_count
                row_states.append(RowState(
                    name=name,
                    feature_key=feat_key,
                    status="spinning",
                    highlight_col=col,
                    target_col=target_col,
                    is_locked=False,
                ))
            else:
                # Locked in!
                row_states.append(RowState(
                    name=name,
                    feature_key=feat_key,
                    status="locked",
                    highlight_col=target_col,
                    target_col=target_col,
                    is_locked=True,
                ))

        # Connecting line calculation
        if t < self.line_start_time:
            line_progress = 0.0
            is_line_drawing = False
        elif self.line_start_time <= t < self.line_end_time:
            tau_line = (t - self.line_start_time) / self.LINE_DURATION
            line_progress = max(0.0, min(3.0, tau_line * 3.0))
            is_line_drawing = True
        else:
            line_progress = 3.0
            is_line_drawing = False

        is_complete = (t >= self.line_end_time)

        return SlotAnimationState(
            anim_time=t,
            rows=row_states,
            active_row_idx=active_row_idx,
            line_progress=line_progress,
            is_line_drawing=is_line_drawing,
            is_complete=is_complete,
            base_col=self.base_col,
        )

    def update(self, raw_time: float) -> List[str]:
        """
        Updates internal clock and returns audio event triggers since the last call.
        Events: 'tick', 'lock', 'line_start', 'line_complete'
        """
        if self.is_skipped:
            return []

        state = self.get_state(raw_time)
        t = state.anim_time
        events: List[str] = []

        # Check reel tick and lock events per row
        for r_idx in range(4):
            r_start, r_end = self.row_timings[r_idx]
            if r_start <= t < r_end:
                tau = max(0.0, min(1.0, (t - r_start) / self.ROW_SPIN_DURATION))
                prog = 1.0 - (1.0 - tau) ** 2.5
                shift = int(prog * 16)
                if shift != self.last_shifts[r_idx]:
                    self.last_shifts[r_idx] = shift
                    events.append("tick")
            elif t >= r_end and not self.fired_locks[r_idx]:
                self.fired_locks[r_idx] = True
                events.append("lock")

        # Check line start
        if t >= self.line_start_time and not self.fired_line_start:
            self.fired_line_start = True
            events.append("line_start")

        # Check line complete
        if t >= self.line_end_time and not self.fired_line_complete:
            self.fired_line_complete = True
            events.append("line_complete")

        self.last_t = t
        return events
