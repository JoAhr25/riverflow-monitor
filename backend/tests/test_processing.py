import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np

from processing.optical_flow import FarnebackFlowProcessor
from processing.lspiv import BlockPIVProcessor
from processing.water_edge import WaterEdgeDetector
from processing.tracking import CentroidTracker
from sensors.tf_luna import parse_tfluna_frame


def _frame(seed: int, h=120, w=160) -> np.ndarray:
    rng = np.random.default_rng(seed)
    return rng.integers(0, 255, size=(h, w), dtype=np.uint8)


def test_farneback_measures_known_shift():
    a = _frame(1)
    b = np.roll(a, 6, axis=1)
    proc = FarnebackFlowProcessor()
    assert proc.process_frame(a) is None
    result = proc.process_frame(b)
    assert result is not None
    assert result["motion_x"] > 3.0
    assert abs(result["motion_y"]) < 2.0
    assert result["magnitude"] > 3.0
    assert -10 < result["direction"] < 10


def test_farneback_direction_up():
    a = _frame(2)
    b = np.roll(a, -5, axis=0)
    proc = FarnebackFlowProcessor()
    proc.process_frame(a)
    result = proc.process_frame(b)
    assert result["direction"] > 70


def test_block_piv_measures_known_shift():
    a = _frame(3)
    b = np.roll(a, 4, axis=1)
    proc = BlockPIVProcessor({"window": 32, "search_radius": 12, "grid_step": 32})
    assert proc.process_frame(a) is None
    result = proc.process_frame(b)
    assert result is not None
    assert result["motion_x"] > 2.0
    assert len(result["vectors"]) > 0


def test_water_edge_detected_on_synthetic_boundary():
    top = np.full((60, 160), 200, dtype=np.uint8)
    rng = np.random.default_rng(5)
    bottom = rng.integers(0, 90, size=(60, 160), dtype=np.uint8)
    img = np.vstack([top, bottom])
    det = WaterEdgeDetector()
    result = det.detect(img)
    assert result["detected"] is True
    assert result["edge_y"] is not None
    assert 40 <= result["edge_y"] <= 80


def test_water_edge_not_detected_on_uniform_image():
    img = np.full((120, 160), 128, dtype=np.uint8)
    rng = np.random.default_rng(6)
    img = img + rng.integers(0, 6, size=img.shape).astype(np.uint8)
    det = WaterEdgeDetector()
    result = det.detect(img)
    assert result["detected"] is False


def test_centroid_tracker_counts_unique_objects():
    tracker = CentroidTracker(max_distance=50, max_missing=3)
    det_a = [{"class": "debris", "confidence": 0.9, "x": 100, "y": 100, "width": 20, "height": 20}]
    out1 = tracker.update(det_a)
    assert tracker.unique_total == 1
    det_moved = [{"class": "debris", "confidence": 0.9, "x": 112, "y": 104, "width": 20, "height": 20}]
    tracker.update(det_moved)
    assert tracker.unique_total == 1
    tracker.update([{"class": "debris", "confidence": 0.9, "x": 10, "y": 10, "width": 20, "height": 20}])
    assert tracker.unique_total == 2


def test_tfluna_frame_parsing():
    dist_cm = 231
    frame = bytes([0x59, 0x59, dist_cm & 0xFF, (dist_cm >> 8) & 0xFF, 0x20, 0x07, 0x00, 0x80, 0x00])
    frame = frame[:8] + bytes([sum(frame[:8]) & 0xFF])
    parsed = parse_tfluna_frame(b"\x00\x11" + frame)
    assert parsed is not None
    assert parsed["distance_cm"] == 231
    assert parsed["distance_m"] == 2.31


def test_tfluna_rejects_bad_checksum():
    frame = bytes([0x59, 0x59, 0xE7, 0x00, 0x20, 0x07, 0x00, 0x80, 0x00])
    assert parse_tfluna_frame(frame) is None
