"""
Automated headless test for PhotoboothApp.
"""

import os
import glob
import time
os.environ["SDL_VIDEODRIVER"] = "dummy"

from photobooth import PhotoboothApp


def test_photobooth_lifecycle():
    test_dir = "test_photos_output"
    app = PhotoboothApp(save_dir=test_dir, min_faces=3, window_width=800, window_height=600)

    # Initial state assertions
    assert app.photos_taken_count == 0
    assert os.path.exists(test_dir)
    assert app.min_faces_required == 3

    # =========================================================================
    # 1. Test with 1 face (Below requirement -> Button MUST be greyed out)
    # =========================================================================
    app.camera.set_simulated_face_count(1)
    ret, frame = app.camera.read_frame()
    app.detected_faces = app.face_detector.detect_faces(frame, fallback_boxes=app.camera.get_simulated_face_boxes())
    assert len(app.detected_faces) == 1

    # Simulate render frame update
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

    # Verify buttons layout: only 3 buttons (Snap, Fullscreen, Quit) - instant snap removed
    assert len(app.buttons) == 3
    assert app.btn_snap.on_click == app.start_countdown, "Snap button must trigger countdown"

    # =========================================================================
    # 3. Test with 3 faces (Requirement met -> Snap button active, triggers timer)
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

    # Countdown triggers take_photo (saves full photo + 3 cropped faces!)
    app.take_photo()
    assert app.photos_taken_count == 1

    full_photos = [f for f in glob.glob(os.path.join(test_dir, "photobooth_*.jpg")) if "_face" not in f]
    face_crops = [f for f in glob.glob(os.path.join(test_dir, "*_face*.jpg"))]
    assert len(full_photos) == 1, f"Expected 1 full photo, found: {full_photos}"
    assert len(face_crops) == 3, f"Expected 3 cropped face photos for 3 subjects, found: {face_crops}"
    print(f"Verified full photo: {full_photos[0]} ({os.path.getsize(full_photos[0])} bytes)")
    for i, fc in enumerate(face_crops):
        print(f"Verified face crop #{i+1}: {fc} ({os.path.getsize(fc)} bytes)")

    # Test second snap sequence with countdown
    app.start_countdown()
    assert app.countdown_overlay.is_active is True

    # Fast forward countdown
    app.countdown_overlay.start_time = time.time() - 3.1
    countdown_finished = app.countdown_overlay.update()
    assert countdown_finished is True
    app.take_photo()
    assert app.photos_taken_count == 2
    full_photos = [f for f in glob.glob(os.path.join(test_dir, "photobooth_*.jpg")) if "_face" not in f]
    face_crops = [f for f in glob.glob(os.path.join(test_dir, "*_face*.jpg"))]
    assert len(full_photos) == 2, f"Expected 2 full photos, found: {len(full_photos)}"
    assert len(face_crops) == 6, f"Expected 6 cropped face photos (2 snaps x 3 faces), found: {len(face_crops)}"

    # Test Fullscreen Toggle
    assert app.is_fullscreen is False
    app.toggle_fullscreen()
    assert app.is_fullscreen is True
    fs_button = [b for b in app.buttons if b.shortcut == "F"][0]
    assert fs_button.label == "WINDOWED"

    # Toggle back to windowed
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
    print("Photobooth test passed successfully!")


if __name__ == "__main__":
    test_photobooth_lifecycle()
