import os
import sys
import tempfile
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

_TEST_DIR = Path(tempfile.mkdtemp(prefix="riverflow-test-"))
os.environ["RIVERFLOW_DATA_DIR"] = str(_TEST_DIR / "appdata")
os.environ["RIVERFLOW_UPLOAD_DIR"] = str(_TEST_DIR / "uploads")
