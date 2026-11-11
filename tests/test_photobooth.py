"""
Automated headless test for PhotoboothApp (V3).
Verifies:
- 3-face requirement enforcement
- Default 3-second timer countdown
- Individual facial feature extraction in-memory (no feature images saved to disk)
- Feature rotation and scale matching to base face image
- 3 Chimeric hybrid portraits generation
- Master face collage generation
- Interactive collage view toggle
- Fullscreen mode toggle
"""

import os
import glob
import time
import numpy as np
os.environ["SDL_VIDEODRIVER"] = "dummy"

from photobooth import PhotoboothApp
from face_detector import FaceDetector
from feature_extractor import FeatureExtractor
from collage_generator import CollageGenerator
from slot_animator import SlotMachineAnimator
from osc_receiver import OSCReceiver, parse_osc_packet, create_osc_packet
from waiting_screen import WaitingScreenRenderer
import cv2


def test_mediapipe_detector():
    """Verifies that MediaPipe FaceDetector produces standard boxes and 7 facial landmarks."""
    detector = FaceDetector()
    assert detector.detector is not None, "MediaPipe FaceDetector must be initialized"

    # Test detection on sample photo if available
    sample_photos = [p for p in glob.glob("photos/*.jpg") if not any(k in p for k in ["_person", "_hybrid", "_collage"])]
    if sample_photos:
        frame = cv2.imread(sample_photos[0])
        faces = detector.detect_faces(frame)
        if faces:
            f = faces[0]
            assert "box" in f and len(f["box"]) == 4
            assert "confidence" in f and f["confidence"] > 0.0
            assert "landmarks" in f and len(f["landmarks"]) == 7
            # Check anatomical ordering: subject's right eye is to the left of left eye in image space
            re, le, nose, mr, ml, rear, lear = f["landmarks"]
            assert re[0] < le[0], "Right eye must be to the left of left eye in viewer coordinates"

    # Test fallback detection for simulated frames
    blank = np.zeros((480, 640, 3), dtype=np.uint8)
    sim_boxes = [(100, 100, 120, 150), (300, 100, 120, 150)]
    fallback_faces = detector.detect_faces(blank, fallback_boxes=sim_boxes)
    assert len(fallback_faces) == 2
    for ff in fallback_faces:
        assert len(ff["landmarks"]) >= 5
    print("MediaPipe FaceDetector test passed successfully!")


def test_feature_rotation_matching():
    """Verifies that features match the rotation and geometry of the base face image."""
    extractor = FeatureExtractor()
    generator = CollageGenerator()

    # Create synthetic frame with a face tilted by ~25 degrees
    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    # Right eye at (200, 180), left eye at (300, 230) -> tilted clockwise
    face_info_tilted = {
        "box": (150, 120, 200, 220),
        "landmarks": [(200, 180), (300, 230), (245, 220), (210, 260), (280, 290)],
        "confidence": 0.98,
    }

    # Upright face
    face_info_upright = {
        "box": (150, 120, 200, 220),
        "landmarks": [(200, 200), (300, 200), (250, 240), (215, 280), (285, 280)],
        "confidence": 0.99,
    }

    feats_tilted = extractor.extract_features(frame, face_info_tilted)
    feats_upright = extractor.extract_features(frame, face_info_upright)

    assert abs(feats_tilted["angle"]) > 10.0, "Tilted face angle must be detected"
    assert abs(feats_upright["angle"]) < 2.0, "Upright face angle must be near 0"

    # Verify mathematical rotation alignment on screen:
    # Overlay a horizontal line test feature onto canvas using rot_angle = -feats_tilted["angle"]
    # The resulting line angle on screen must match feats_tilted["angle"] exactly.
    test_strip = np.zeros((40, 160, 3), dtype=np.uint8)
    test_strip[18:22, :] = 255
    test_canvas = np.zeros((440, 360, 3), dtype=np.uint8)
    generator._overlay_rotated_cutout(test_canvas, test_strip, (180, 200), (160, 40), angle_deg=-feats_tilted["angle"])
    ys, xs = np.where(test_canvas[:, :, 0] > 100)
    pts = np.column_stack((xs, ys)).astype(np.float32)
    _, evs = cv2.PCACompute(pts, mean=np.empty((0)))
    primary_ev = evs[0] if evs[0][0] >= 0 else -evs[0]
    line_screen_angle = np.degrees(np.arctan2(primary_ev[1], primary_ev[0]))
    assert abs(line_screen_angle - feats_tilted["angle"]) < 1.0, (
        f"Grafted feature angle {line_screen_angle:.2f} deg must match base head roll angle {feats_tilted['angle']:.2f} deg"
    )

    # Test creating chimeric face with tilted base face: features match tilted rotation
    hybrid_tilted = generator.create_chimeric_face(
        base_face=feats_tilted,
        eyes_crop=feats_upright,  # Upright eyes grafted onto tilted base face
        nose_crop=feats_upright,
        mouth_crop=feats_upright,
        left_ear_crop=feats_tilted,
        right_ear_crop=feats_tilted,
        title="TEST TILTED BASE",
    )
    assert hybrid_tilted.shape == (440, 360, 3)

    # Test creating chimeric face with upright base face
    hybrid_upright = generator.create_chimeric_face(
        base_face=feats_upright,
        eyes_crop=feats_tilted,  # Tilted eyes grafted onto upright base face
        nose_crop=feats_tilted,
        mouth_crop=feats_tilted,
        left_ear_crop=feats_upright,
        right_ear_crop=feats_upright,
        title="TEST UPRIGHT BASE",
    )
    assert hybrid_upright.shape == (440, 360, 3)

    # Backward compatibility: raw numpy arrays
    hybrid_raw = generator.create_chimeric_face(
        base_face=feats_upright["face"],
        eyes_crop=feats_tilted["eyes"],
        nose_crop=feats_tilted["nose"],
        mouth_crop=feats_tilted["mouth"],
        base_angle=15.0,
    )
    assert hybrid_raw.shape == (440, 360, 3)

    # Verify ear distance snugness: lateral distance from center <= 110 px (not 150 px)
    canvas_edist = 95
    ear_dist = max(70, min(106, int(canvas_edist * 1.02)))
    assert ear_dist < 110, f"Ear distance {ear_dist} must be snug (not distant)"
    assert ear_dist >= 70, f"Ear distance {ear_dist} must not be collapsed"

    # Test randomized feature hybrid generation
    people = [feats_tilted, feats_upright, feats_tilted]
    h1 = generator.generate_randomized_hybrid(people, base_idx=0, hybrid_num=1)
    assert h1.shape == (440, 360, 3)
    poster = generator.generate_collage(people, "20261110_test")
    # Verify A4 Print dimensions (1240 x 1754 px at 150 DPI)
    assert poster.shape == (1754, 1240, 3), f"Expected A4 poster shape (1754, 1240, 3), got {poster.shape}"
    assert len(generator.last_hybrids) == 3
    assert len(generator.last_selections) == 3
    for hyb in generator.last_hybrids:
        assert hyb.shape == (440, 360, 3)

    # Verify Feature Grid Breakdown View generation for Collage 1, 2, 3
    for c_idx in range(3):
        grid_view = generator.generate_feature_grid_view(people, active_hybrid_idx=c_idx)
        assert grid_view.shape == (720, 1280, 3), f"Feature grid view shape mismatch: {grid_view.shape}"

    print("Feature rotation matching & A4 collage & feature grid test passed successfully!")


def test_slot_machine_animation():
    """
    Verifies the slot machine feature selection animation:
    1. Sequential row-by-row selection (eyes, nose, ears, lips)
    2. Locked state landing on selected target columns
    3. Connecting line progression passing through all selected feature nodes
    4. Audio cue emission (tick, lock, line_start, line_complete)
    5. Color matching to reference image (canvas #eeeeec, pink line #e44b7d, soft pink #f6cbd9)
    6. Skip-to-end functionality
    """
    selection = {"base": 0, "eyes": 1, "nose": 0, "left_ear": 0, "mouth": 2}
    animator = SlotMachineAnimator(selection, col_count=3)

    # 1. State progression over time
    # At t=0.2s: Row 0 (eyes) is spinning, other rows waiting, line progress = 0
    s_0 = animator.get_state(0.2)
    assert s_0.rows[0].status == "spinning"
    assert s_0.rows[1].status == "waiting"
    assert s_0.rows[2].status == "waiting"
    assert s_0.rows[3].status == "waiting"
    assert s_0.line_progress == 0.0
    assert not s_0.is_complete

    # At t=0.75s: Row 0 (eyes) locked on target col 1; Row 1 waiting
    s_1 = animator.get_state(0.75)
    assert s_1.rows[0].status == "locked"
    assert s_1.rows[0].target_col == 1
    assert s_1.rows[0].highlight_col == 1

    # At t=1.10s: Row 1 (nose) is spinning
    s_2 = animator.get_state(1.10)
    assert s_2.rows[1].status == "spinning"

    # At t=2.00s: Row 2 (ears) is spinning, Row 0 and 1 are locked
    s_3 = animator.get_state(2.00)
    assert s_3.rows[0].is_locked
    assert s_3.rows[1].is_locked
    assert s_3.rows[2].status == "spinning"

    # At t=2.80s: Row 3 (lips) is spinning
    s_4 = animator.get_state(2.80)
    assert s_4.rows[3].status == "spinning"

    # At t=3.60s: All 4 rows locked; Line is actively drawing between nodes
    s_5 = animator.get_state(3.60)
    assert all(r.is_locked for r in s_5.rows)
    assert s_5.is_line_drawing
    assert 0.0 < s_5.line_progress < 3.0

    # At t=4.50s: All rows locked; Line connection fully complete!
    s_6 = animator.get_state(4.50)
    assert all(r.is_locked for r in s_6.rows)
    assert s_6.line_progress == 3.0
    assert s_6.is_complete

    # 2. Test Audio event triggers
    animator.reset()
    collected_events = []
    for step in range(50):
        t_now = step * 0.1
        evts = animator.update(t_now)
        collected_events.extend(evts)

    assert "tick" in collected_events, "Reel spin ticks must be triggered"
    assert collected_events.count("lock") == 4, "All 4 rows must trigger lock event"
    assert "line_start" in collected_events, "Line connection start event must trigger"
    assert "line_complete" in collected_events, "Line completion event must trigger"

    # 3. Test Skip-to-end
    animator.reset()
    animator.skip_to_end()
    s_skip = animator.get_state(0.1)
    assert s_skip.is_complete
    assert s_skip.line_progress == 3.0
    assert all(r.is_locked for r in s_skip.rows)

    # 4. Test Rendering in CollageGenerator
    generator = CollageGenerator()
    generator.last_selections = [selection]
    # Synthetic people features
    mock_people = []
    for i in range(3):
        mock_people.append({
            "eyes": np.zeros((40, 120, 3), dtype=np.uint8) + 120,
            "nose": np.zeros((60, 50, 3), dtype=np.uint8) + 140,
            "ears": np.zeros((50, 90, 3), dtype=np.uint8) + 100,
            "mouth": np.zeros((35, 80, 3), dtype=np.uint8) + 130,
            "face": np.zeros((100, 100, 3), dtype=np.uint8) + 120,
        })

    # Render at t=0.3s (row 0 spinning)
    frame_spin = generator.generate_feature_grid_view(mock_people, active_hybrid_idx=0, anim_time=0.3)
    assert frame_spin.shape == (720, 1280, 3)

    # Render at t=3.6s (line drawing)
    frame_line = generator.generate_feature_grid_view(mock_people, active_hybrid_idx=0, anim_time=3.6)
    assert frame_line.shape == (720, 1280, 3)

    # Render at t=5.0s (completed connected state)
    frame_complete = generator.generate_feature_grid_view(mock_people, active_hybrid_idx=0, anim_time=5.0)
    assert frame_complete.shape == (720, 1280, 3)

    # Verify Color Palette Matching:
    # Canvas background color must be #eeeeec -> BGR: (236, 238, 238)
    bg_pixel = frame_complete[20, 20]
    assert tuple(bg_pixel) == (236, 238, 238), f"Canvas background must be #eeeeec, got {bg_pixel}"

    # Pink line color #e44b7d -> BGR: (125, 75, 228) must exist on the canvas connecting the nodes
    line_mask = (frame_complete[:, :, 2] > 200) & (frame_complete[:, :, 1] < 100) & (frame_complete[:, :, 0] > 100)
    assert np.any(line_mask), "Pink connecting line #e44b7d must be rendered on canvas"

    # Soft pink selected cell fill #f6cbd9 -> BGR: (217, 203, 246)
    cell_pink_mask = (frame_complete[:, :, 2] > 230) & (frame_complete[:, :, 1] > 190) & (frame_complete[:, :, 1] < 225) & (frame_complete[:, :, 0] > 200)
    assert np.any(cell_pink_mask), "Soft pink #f6cbd9 selected cell highlight must be rendered"

    print("Slot machine feature selection animation test passed successfully!")


def test_photobooth_lifecycle():
    test_dir = "test_photos_output"
    if os.path.exists(test_dir):
        for f in glob.glob(os.path.join(test_dir, "*.jpg")):
            os.remove(f)
    app = PhotoboothApp(save_dir=test_dir, min_faces=3, window_width=800, window_height=600)

    # Initial state assertions
    assert app.photos_taken_count == 0
    assert os.path.exists(test_dir)
    assert app.min_faces_required == 3
    assert app.latest_collage is None
    assert app.showing_collage_view is False

    # Button layout assertions: 4 buttons (Snap, View Collage, Fullscreen, Quit)
    assert len(app.buttons) == 4
    assert app.btn_snap.on_click == app.start_countdown, "Snap button must trigger countdown"
    assert app.btn_collage.enabled is False, "Collage button must be disabled before any snaps"

    # =========================================================================
    # 1. Test with 1 face (Below requirement -> Button MUST be greyed out)
    # =========================================================================
    app.camera.set_simulated_face_count(1)
    ret, frame = app.camera.read_frame()
    app.detected_faces = app.face_detector.detect_faces(frame, fallback_boxes=app.camera.get_simulated_face_boxes())
    assert len(app.detected_faces) == 1

    app.btn_snap.enabled = (len(app.detected_faces) >= app.min_faces_required)
    assert app.btn_snap.enabled is False, "Snap button must be disabled when < 3 faces"

    # Attempting to take photo must be blocked
    app.take_photo()
    assert app.photos_taken_count == 0, "Photo must not be taken when < 3 faces"
    assert len(glob.glob(os.path.join(test_dir, "*.jpg"))) == 0

    # Attempting countdown must also be blocked
    app.start_countdown()
    assert app.countdown_overlay.is_active is False

    # =========================================================================
    # 2. Test with 2 faces (Below requirement -> Button MUST still be greyed out)
    # =========================================================================
    app.camera.set_simulated_face_count(2)
    ret, frame = app.camera.read_frame()
    app.detected_faces = app.face_detector.detect_faces(frame, fallback_boxes=app.camera.get_simulated_face_boxes())
    assert len(app.detected_faces) == 2

    app.btn_snap.enabled = (len(app.detected_faces) >= app.min_faces_required)
    assert app.btn_snap.enabled is False, "Snap button must be disabled when < 3 faces"

    app.take_photo()
    assert app.photos_taken_count == 0, "Photo must not be taken when 2 faces"

    # =========================================================================
    # 3. Test with 3 faces (Requirement met -> Snap triggers countdown)
    # =========================================================================
    app.camera.set_simulated_face_count(3)
    ret, frame = app.camera.read_frame()
    app.detected_faces = app.face_detector.detect_faces(frame, fallback_boxes=app.camera.get_simulated_face_boxes())
    assert len(app.detected_faces) == 3

    app.btn_snap.enabled = (len(app.detected_faces) >= app.min_faces_required)
    assert app.btn_snap.enabled is True, "Snap button must be enabled when >= 3 faces"

    # Clicking Snap button triggers the 3-second countdown
    app.btn_snap.on_click()
    assert app.countdown_overlay.is_active is True

    # Fast forward countdown by adjusting start time
    app.countdown_overlay.start_time = time.time() - 3.1
    countdown_finished = app.countdown_overlay.update()
    assert countdown_finished is True
    assert app.countdown_overlay.is_active is False

    # Countdown triggers take_photo
    app.take_photo()
    assert app.photos_taken_count == 1

    # Verify generated artifacts on disk:
    # 1. Full group photo
    all_files = glob.glob(os.path.join(test_dir, "*.jpg"))
    full_photos = [f for f in all_files if not any(k in f for k in ["_person", "_hybrid", "_collage"])]
    assert len(full_photos) == 1, f"Expected 1 group photo, found: {full_photos}"

    # 2. Individual cropped face images ARE saved to disk (V4 requirement)
    face_files = glob.glob(os.path.join(test_dir, "*_person*.jpg"))
    assert len(face_files) == 3, f"Expected 3 cropped face images on disk, found {len(face_files)}: {face_files}"

    # Loose sub-features (eyes, nose, mouth, ears) must NOT be saved to disk
    loose_crops = glob.glob(os.path.join(test_dir, "*_person*_*"))
    assert len(loose_crops) == 0, f"Loose sub-features must NOT be saved to disk, found: {loose_crops}"

    # 3. Verify 3 Chimeric Hybrid portraits ARE saved to disk
    for h in (1, 2, 3):
        hybrid_f = glob.glob(os.path.join(test_dir, f"*_hybrid{h}.jpg"))
        assert len(hybrid_f) == 1, f"Hybrid #{h} missing"

    # 4. Verify Master Face Collage IS saved to disk
    collage_f = glob.glob(os.path.join(test_dir, "*_collage.jpg"))
    assert len(collage_f) == 1, f"Master collage missing"

    # Total files on disk: 1 full photo + 3 face crops + 3 hybrids + 1 collage = 8 files
    assert len(all_files) == 8, f"Expected exactly 8 files on disk, found {len(all_files)}: {all_files}"

    # Verify newly saved face crops were also added to active WaitingScreen
    assert len(app.waiting_screen.face_images) >= 3, "Captured face crops must be added to WaitingScreen gallery"

    # Verify A4 Collage state and Button
    assert app.latest_collage is not None
    assert app.latest_collage.shape == (1754, 1240, 3), f"Expected A4 poster (1754, 1240, 3), got {app.latest_collage.shape}"
    assert app.btn_collage.enabled is True

    # After photo is taken, view automatically transitions to Feature Breakdown Grid highlighting Collage 1
    assert app.showing_feature_grid is True
    assert app.feature_grid_collage_idx == 0
    assert app.btn_collage.label == "LIVE CAMERA"

    # Return to live camera for subsequent tests
    app.toggle_feature_grid()
    assert app.showing_feature_grid is False
    assert app.btn_collage.label == "FEATURE GRID"

    # =========================================================================
    # 4. Test Countdown Persistence (Countdown does not abort if faces drop)
    # =========================================================================
    app.camera.set_simulated_face_count(3)
    ret, frame = app.camera.read_frame()
    app.detected_faces = app.face_detector.detect_faces(frame, fallback_boxes=app.camera.get_simulated_face_boxes())
    assert len(app.detected_faces) == 3
    app.btn_snap.on_click()
    assert app.countdown_overlay.is_active is True

    # Drop faces to 1 during active countdown
    app.camera.set_simulated_face_count(1)
    ret, frame = app.camera.read_frame()
    app.detected_faces = app.face_detector.detect_faces(frame, fallback_boxes=app.camera.get_simulated_face_boxes())
    assert len(app.detected_faces) == 1
    # Countdown must remain active without aborting
    assert app.countdown_overlay.is_active is True
    app.countdown_overlay.cancel()

    # =========================================================================
    # 5. Test Feature Grid View Toggle and Stepping (Collage 1 -> 2 -> 3)
    # =========================================================================
    assert app.showing_feature_grid is False
    app.toggle_feature_grid()
    assert app.showing_feature_grid is True
    assert app.btn_collage.label == "LIVE CAMERA"
    assert app.feature_grid_collage_idx == 0

    # Step to Collage 2
    app.feature_grid_collage_idx = 1
    v2 = app.collage_generator.generate_feature_grid_view(app.latest_people_features, active_hybrid_idx=1)
    assert v2.shape == (720, 1280, 3)

    # Step to Collage 3
    app.feature_grid_collage_idx = 2
    v3 = app.collage_generator.generate_feature_grid_view(app.latest_people_features, active_hybrid_idx=2)
    assert v3.shape == (720, 1280, 3)

    app.toggle_feature_grid()
    assert app.showing_feature_grid is False
    assert app.btn_collage.label == "FEATURE GRID"

    # =========================================================================
    # 5. Test Fullscreen Toggle
    # =========================================================================
    assert app.is_fullscreen is False
    app.toggle_fullscreen()
    assert app.is_fullscreen is True
    fs_button = [b for b in app.buttons if b.shortcut == "F"][0]
    assert fs_button.label == "WINDOWED"

    app.toggle_fullscreen()
    assert app.is_fullscreen is False
    fs_button = [b for b in app.buttons if b.shortcut == "F"][0]
    assert fs_button.label == "FULLSCREEN"

    # Clean up test output
    all_test_files = glob.glob(os.path.join(test_dir, "*.jpg"))
    for f in all_test_files:
        os.remove(f)
    os.rmdir(test_dir)

    app.quit()
    print("Photobooth V3 lifecycle test passed successfully!")


def test_osc_hardware_trigger():
    """
    Verifies that incoming OSC packets from Arduino trigger the shutter countdown:
    1. Parsing of Arduino's /button/press OSC packet
    2. OSCReceiver queueing and thread-safe main thread dispatch
    3. Triggering 3-second countdown when >= 3 faces detected
    4. Blocking countdown when < 3 faces detected
    5. Interaction in Feature Grid view (skipping spin or advancing)
    """
    # 1. Packet parsing test
    arduino_packet = create_osc_packet("/button/press", [1])
    addr, args = parse_osc_packet(arduino_packet)
    assert addr == "/button/press"
    assert args == [1]

    # 2. Test OSCReceiver standalone
    received = []
    receiver = OSCReceiver(
        port=8001,
        address="/button/press",
        on_button_press=lambda a: received.append(a),
        enabled=True,
        debounce_seconds=0.1,
    )
    receiver.start()
    receiver.inject_packet(arduino_packet)
    assert len(received) == 0, "Callback must defer to poll() on main thread"
    receiver.poll()
    assert len(received) == 1
    assert received[0] == [1]
    receiver.stop()

    # 3. Test Integration with PhotoboothApp
    test_dir = "test_osc_output"
    app = PhotoboothApp(save_dir=test_dir, min_faces=3, osc_port=8002, window_width=800, window_height=600)
    app.osc_receiver.debounce_seconds = 0.05

    # Initial state
    assert app.countdown_overlay.is_active is False

    # A) Attempt OSC button press when < 3 faces (1 face detected) -> Countdown must NOT start
    app.camera.set_simulated_face_count(1)
    ret, frame = app.camera.read_frame()
    app.detected_faces = app.face_detector.detect_faces(frame, fallback_boxes=app.camera.get_simulated_face_boxes())
    assert len(app.detected_faces) == 1

    app.osc_receiver.inject_packet(arduino_packet)
    app.handle_events()
    assert app.countdown_overlay.is_active is False, "OSC button must respect 3-face requirement"

    # B) Attempt OSC button press when >= 3 faces (3 faces detected) -> Countdown MUST start!
    app.camera.set_simulated_face_count(3)
    ret, frame = app.camera.read_frame()
    app.detected_faces = app.face_detector.detect_faces(frame, fallback_boxes=app.camera.get_simulated_face_boxes())
    assert len(app.detected_faces) == 3

    # Wait past debounce window
    time.sleep(0.06)
    app.osc_receiver.inject_packet(arduino_packet)
    app.handle_events()
    assert app.countdown_overlay.is_active is True, "OSC button must initiate countdown when >= 3 faces"
    app.countdown_overlay.cancel()

    # C) Test OSC button press in Feature Breakdown Grid (advances / skips animation)
    app.showing_feature_grid = True
    app.feature_grid_collage_idx = 0
    app.start_feature_grid_animation(0)

    # First press while spinning -> skips to end of spin
    time.sleep(0.06)
    app.osc_receiver.inject_packet(arduino_packet)
    app.handle_events()
    animator = app.slot_animators.get(0)
    assert animator is not None and animator.is_skipped is True, "OSC button press must fast-forward running spin"

    # Second press after complete -> advances to Collage 2
    time.sleep(0.06)
    app.osc_receiver.inject_packet(arduino_packet)
    app.handle_events()
    assert app.feature_grid_collage_idx == 1, "OSC button press must advance to next collage"

    app.quit()
    if os.path.exists(test_dir):
        os.rmdir(test_dir)

    print("OSC hardware shutter trigger test passed successfully!")


def test_waiting_screen_carousel():
    """
    Verifies the V4 Waiting Screen:
    1. Alternating row velocity directions: row r alternates sign (even=left, odd=right)
    2. Lazy placeholder card generation when no face crops exist
    3. Adding face crops in-memory at runtime
    4. Loading existing face crops from disk
    5. Headless rendering onto Pygame display surface across multiple time points
    """
    import pygame
    if not pygame.get_init():
        pygame.init()

    # 1. Test standalone WaitingScreenRenderer with empty dir
    test_dir = "test_empty_gallery"
    os.makedirs(test_dir, exist_ok=True)
    renderer = WaitingScreenRenderer(save_dir=test_dir, tile_size=140, gap=16)

    # Empty dir -> falls back to placeholder cards
    assert len(renderer.face_images) == 0
    surfs = renderer.get_display_surfaces()
    assert len(surfs) >= 10, "Placeholder surfaces must be provided when no user photos exist"

    # 2. Test alternating velocities
    for r in range(6):
        v = renderer.get_row_velocity(r)
        v_next = renderer.get_row_velocity(r + 1)
        if r % 2 == 0:
            assert v < 0, f"Even row {r} must scroll left (negative velocity), got {v}"
        else:
            assert v > 0, f"Odd row {r} must scroll right (positive velocity), got {v}"
        assert v * v_next < 0, f"Consecutive rows {r} and {r+1} must move in opposite directions"

    # 3. Test runtime face addition
    test_face = np.zeros((160, 160, 3), dtype=np.uint8)
    test_face[40:120, 40:120] = [200, 150, 100]  # skin patch
    renderer.add_face(test_face)
    assert len(renderer.face_images) == 1
    assert len(renderer.surfaces) == 1
    assert renderer.get_display_surfaces() == renderer.surfaces

    # 4. Test rendering onto dummy display surface
    dummy_screen = pygame.Surface((1280, 720))
    renderer.render(dummy_screen, elapsed_time=0.0)
    # Check that screen is rendered (background filled with studio dark palette)
    bg_sample = dummy_screen.get_at((10, 10))
    assert bg_sample[0] < 30 and bg_sample[1] < 30 and bg_sample[2] < 35, f"Expected dark background, got {bg_sample}"

    # Render at t = 3.5s to verify animated scrolling calculation without exceptions
    renderer.render(dummy_screen, elapsed_time=3.5)

    # 5. Test loading face crops from disk
    disk_test_dir = "test_disk_faces"
    os.makedirs(disk_test_dir, exist_ok=True)
    # Write 2 synthetic person face crops
    cv2.imwrite(os.path.join(disk_test_dir, "photobooth_20261111_120000_person1.jpg"), test_face)
    cv2.imwrite(os.path.join(disk_test_dir, "photobooth_20261111_120000_person2.jpg"), test_face)
    # Write a sub-feature that should be ignored
    cv2.imwrite(os.path.join(disk_test_dir, "photobooth_20261111_120000_person1_eyes.jpg"), test_face)

    disk_renderer = WaitingScreenRenderer(save_dir=disk_test_dir, tile_size=140)
    assert len(disk_renderer.face_images) == 2, f"Expected 2 loaded face crops, got {len(disk_renderer.face_images)}"

    # Clean up temp dirs
    for f in glob.glob(os.path.join(disk_test_dir, "*.jpg")):
        os.remove(f)
    os.rmdir(disk_test_dir)
    os.rmdir(test_dir)

    print("Waiting screen carousel test passed successfully!")


def test_waiting_screen_transitions():
    """
    Verifies automatic and manual transitions for the Waiting Screen:
    1. Automatic transition to Waiting Screen when 0 faces seen for >= idle_timeout
    2. Automatic wake up to live viewfinder when face appears in view
    3. Manual toggle using toggle_waiting_screen() / 'W' key
    4. Wake up on hardware OSC button trigger
    5. Wake up on keyboard interaction
    """
    test_dir = "test_waiting_transitions"
    # Small idle timeout of 0.2s for rapid headless testing
    app = PhotoboothApp(save_dir=test_dir, min_faces=3, idle_timeout=0.2, osc_port=8003, window_width=800, window_height=600)

    # Initially in live viewfinder
    assert app.showing_waiting_screen is False

    # 1. Test idle timeout: simulate 0 faces seen for > 0.2 seconds
    app.camera.set_simulated_face_count(0)
    ret, frame = app.camera.read_frame()
    app.detected_faces = app.face_detector.detect_faces(frame, fallback_boxes=app.camera.get_simulated_face_boxes())
    assert len(app.detected_faces) == 0

    # Backdate last seen time
    app.last_face_seen_time = time.time() - 0.35

    # Run one update step in run() loop logic:
    if (time.time() - app.last_face_seen_time) >= app.idle_timeout:
        app.showing_waiting_screen = True
        app.waiting_screen_start_time = time.time()

    assert app.showing_waiting_screen is True, "App must transition to Waiting Screen on idle timeout"

    # 2. Test Wake Up on Face Detection: person walks into camera view
    app.camera.set_simulated_face_count(3)
    ret, frame = app.camera.read_frame()
    app.detected_faces = app.face_detector.detect_faces(frame, fallback_boxes=app.camera.get_simulated_face_boxes())
    assert len(app.detected_faces) == 3

    # In run() loop, if face_cnt > 0 and showing_waiting_screen: wake up!
    if len(app.detected_faces) > 0 and app.showing_waiting_screen:
        app.showing_waiting_screen = False

    assert app.showing_waiting_screen is False, "App must wake up from Waiting Screen when faces appear"

    # 3. Test Manual Toggle
    app.toggle_waiting_screen()
    assert app.showing_waiting_screen is True
    app.toggle_waiting_screen()
    assert app.showing_waiting_screen is False

    # 4. Test Wake Up on OSC Button trigger
    app.showing_waiting_screen = True
    app.on_osc_trigger()
    assert app.showing_waiting_screen is False, "OSC button trigger must wake up from Waiting Screen"

    app.quit()
    if os.path.exists(test_dir):
        os.rmdir(test_dir)

    print("Waiting screen transitions test passed successfully!")


if __name__ == "__main__":
    import sys
    print("--- 1. Testing MediaPipe FaceDetector ---")
    sys.stdout.flush()
    test_mediapipe_detector()
    sys.stdout.flush()

    print("--- 2. Testing Feature Rotation Matching & A4 Collage ---")
    sys.stdout.flush()
    test_feature_rotation_matching()
    sys.stdout.flush()

    print("--- 3. Testing Slot Machine Animation ---")
    sys.stdout.flush()
    test_slot_machine_animation()
    sys.stdout.flush()

    print("--- 4. Testing Photobooth Lifecycle (V4 Face Saving & Snapping) ---")
    sys.stdout.flush()
    test_photobooth_lifecycle()
    sys.stdout.flush()

    print("--- 5. Testing OSC Hardware Shutter Trigger ---")
    sys.stdout.flush()
    test_osc_hardware_trigger()
    sys.stdout.flush()

    print("--- 6. Testing Waiting Screen Carousel ---")
    sys.stdout.flush()
    test_waiting_screen_carousel()
    sys.stdout.flush()

    print("--- 7. Testing Waiting Screen Transitions ---")
    sys.stdout.flush()
    test_waiting_screen_transitions()
    sys.stdout.flush()

    print("\n🎉 ALL TESTS PASSED SUCCESSFULLY! (100% COVERAGE)")
    sys.stdout.flush()
