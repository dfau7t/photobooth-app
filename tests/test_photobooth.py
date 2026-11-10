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
    app = PhotoboothApp(save_dir=test_dir, window_width=800, window_height=600)

    # Initial state assertions
    assert app.photos_taken_count == 0
    assert os.path.exists(test_dir)

    # Test taking an immediate photo (saves full photo + cropped face)
    app.take_photo()
    assert app.photos_taken_count == 1

    # Check that full photo and face crop were saved to test_dir
    full_photos = [f for f in glob.glob(os.path.join(test_dir, "photobooth_*.jpg")) if "_face" not in f]
    face_crops = [f for f in glob.glob(os.path.join(test_dir, "*_face*.jpg"))]

    assert len(full_photos) == 1, f"Expected 1 full photo, found: {full_photos}"
    assert len(face_crops) == 1, f"Expected 1 cropped face photo, found: {face_crops}"
    print(f"Verified full photo: {full_photos[0]} ({os.path.getsize(full_photos[0])} bytes)")
    print(f"Verified face crop:  {face_crops[0]} ({os.path.getsize(face_crops[0])} bytes)")

    # Test countdown trigger
    app.start_countdown()
    assert app.countdown_overlay.is_active is True

    # Fast forward countdown by adjusting start time
    app.countdown_overlay.start_time = time.time() - 3.1
    countdown_finished = app.countdown_overlay.update()
    assert countdown_finished is True
    assert app.countdown_overlay.is_active is False

    # Simulate taking photo after countdown
    app.take_photo()
    assert app.photos_taken_count == 2
    full_photos = [f for f in glob.glob(os.path.join(test_dir, "photobooth_*.jpg")) if "_face" not in f]
    face_crops = [f for f in glob.glob(os.path.join(test_dir, "*_face*.jpg"))]
    assert len(full_photos) == 2, f"Expected 2 full photos, found: {full_photos}"
    assert len(face_crops) == 2, f"Expected 2 cropped face photos, found: {face_crops}"

    # Test Fullscreen Toggle
    assert app.is_fullscreen is False
    app.toggle_fullscreen()
    assert app.is_fullscreen is True
    # Button label should now indicate "WINDOWED"
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
