"""Optional PyORC adapter (pyOpenRiverCam).

PyORC is used in this project as a TESTING / CALIBRATION / VALIDATION tool for
LSPIV and reference flow-rate computation - NOT as the live monitoring engine.

The adapter never fabricates results: when pyorc is not importable in the
current environment it reports status "not_available" with instructions, and
all analysis functions raise instead of returning invented numbers.

Recommended: run PyORC work inside the existing `pyorc_env` conda environment
(pyorc 0.5.3, verified in this repository's notebooks) rather than installing
pyorc into the webapp environment.
"""
from typing import Any

from paths import REPO_DATA_CONFIG


class PyORCAdapter:
    def __init__(self) -> None:
        self._pyorc: Any = None
        self._import_error: str | None = None
        self._version: str | None = None
        try:
            import pyorc  # type: ignore

            self._pyorc = pyorc
            self._version = getattr(pyorc, "__version__", "unknown")
        except Exception as exc:  # pragma: no cover - environment dependent
            self._import_error = str(exc)

    @property
    def available(self) -> bool:
        return self._pyorc is not None

    def status(self) -> dict[str, Any]:
        if self.available:
            return {
                "available": True,
                "version": self._version,
                "note": "pyorc importable in this environment; version-sensitive APIs must be inspected before use.",
            }
        return {
            "available": False,
            "version": None,
            "note": (
                "pyorc is not installed in the webapp Python environment. This is expected: "
                "use the pyorc_env conda environment (pyorc 0.5.3) for LSPIV testing, calibration "
                "and validation work. Install pyopenrivercam here only if you want the adapter active."
            ),
            "import_error": self._import_error,
        }

    def camera_config_found(self) -> bool:
        return (REPO_DATA_CONFIG / "camera_config.json").exists()

    def run_reference_piv(self, video_path: str, camera_config_path: str | None = None,
                          resolution: float = 0.01) -> dict[str, Any]:
        """Run PyORC PIV on a video for reference/validation purposes.

        Requires: pyorc installed AND a real camera configuration file.
        """
        status = self.status()
        if not status["available"]:
            raise RuntimeError(status["note"])
        config_path = camera_config_path or str(REPO_DATA_CONFIG / "camera_config.json")
        try:
            cam_config = self._pyorc.load_camera_config(config_path)
        except Exception as exc:
            raise RuntimeError(
                f"Could not load camera configuration from {config_path}: {exc}. "
                "A real camera configuration (GCPs, CRS, reference elevation) is required."
            ) from exc

        import inspect

        video = self._pyorc.Video(video_path, camera_config=cam_config)
        frames = video.get_frames()
        frames_obj = self._pyorc.Frames(frames)
        if not hasattr(frames_obj, "project"):
            raise RuntimeError("Installed pyorc API does not expose Frames.project; inspect the installed API first.")
        projected = frames_obj.project(method="numpy", resolution=resolution)
        piv = frames_obj.get_piv(
            window_size=(25, 25),
            overlap=(12, 12),
            search_area_size=(25, 25),
            engine="numba",
        )
        del inspect
        return {"piv": piv, "projected": projected}
