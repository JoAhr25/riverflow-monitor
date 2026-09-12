import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent.parent

DATA_DIR = Path(os.environ.get("RIVERFLOW_DATA_DIR", str(BACKEND_DIR / "data" / "appdata")))
UPLOAD_DIR = Path(os.environ.get("RIVERFLOW_UPLOAD_DIR", str(BACKEND_DIR / "uploads")))

REPO_DATA_RAW = PROJECT_ROOT / "data" / "raw"
REPO_DATA_CONFIG = PROJECT_ROOT / "data" / "config"
REPO_CROSS_SECTION = PROJECT_ROOT / "data" / "cross_section"


def ensure_dirs() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
