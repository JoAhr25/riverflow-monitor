from typing import Any

from pydantic import BaseModel, Field


class AnalysisStartRequest(BaseModel):
    source_type: str = Field(default="upload", description="upload | camera | stream")
    video_id: str | None = None
    repo_path: str | None = None
    device_index: int = 0
    stream_url: str | None = None
    playback_speed: float = 1.0
    loop: bool = False
    roi: list[float] | None = None
    frame_interval: int | None = None


class ConfigUpdateRequest(BaseModel):
    config: dict[str, Any]


class CalibrationUpdateRequest(BaseModel):
    calibration: dict[str, Any]


class ValidationTestRequest(BaseModel):
    test_name: str = "Test"
    reference_flow_rate: float | None = None
    measured_flow_rate: float | None = None
    reference_water_level: float | None = None
    measured_water_level: float | None = None
    reference_debris_count: int | None = None
    measured_debris_count: int | None = None
    notes: str = ""


class WaterLevelCalibrationRequest(BaseModel):
    mounting_height_m: float | None = None
    datum_offset_m: float = 0.0
