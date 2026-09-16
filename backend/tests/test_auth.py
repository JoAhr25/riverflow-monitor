import importlib
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def _reload_with_auth(user, password):
    os.environ["RIVERFLOW_AUTH_USER"] = user
    os.environ["RIVERFLOW_AUTH_PASSWORD"] = password
    os.environ["RIVERFLOW_AUTH_SECRET"] = "test-secret"
    import main as main_module
    from services import auth as auth_module

    importlib.reload(auth_module)
    importlib.reload(main_module)
    return auth_module, main_module


def _reload_without_auth():
    os.environ.pop("RIVERFLOW_AUTH_USER", None)
    os.environ.pop("RIVERFLOW_AUTH_PASSWORD", None)
    os.environ.pop("RIVERFLOW_AUTH_SECRET", None)
    import main as main_module
    from services import auth as auth_module

    importlib.reload(auth_module)
    importlib.reload(main_module)
    return auth_module, main_module


def test_auth_disabled_by_default():
    from fastapi.testclient import TestClient

    auth_module, main_module = _reload_without_auth()
    assert auth_module.enabled() is False
    client = TestClient(main_module.app)
    assert client.get("/api/status").status_code == 200
    assert client.get("/api/status").json()["auth_required"] is False


def test_auth_blocks_and_allows():
    from fastapi.testclient import TestClient

    auth_module, main_module = _reload_with_auth("admin", "correct-password")
    assert auth_module.enabled() is True
    client = TestClient(main_module.app)

    resp = client.get("/api/status")
    assert resp.status_code == 401

    resp = client.post("/api/auth/login", json={"username": "admin", "password": "wrong"})
    assert resp.status_code == 401

    resp = client.post("/api/auth/login", json={"username": "admin", "password": "correct-password"})
    assert resp.status_code == 200

    resp = client.get("/api/status")
    assert resp.status_code == 200
    assert resp.json()["auth_required"] is True

    frame = client.get("/api/video/frame")
    assert frame.status_code == 200

    client.post("/api/auth/logout")
    resp = client.get("/api/status")
    assert resp.status_code == 401


def test_auth_tampered_token_rejected():
    from fastapi.testclient import TestClient

    auth_module, main_module = _reload_with_auth("admin", "correct-password")
    client = TestClient(main_module.app)
    client.cookies.set(auth_module.COOKIE_NAME, "admin|99999999999|deadbeef")
    assert client.get("/api/status").status_code == 401


def test_auth_cleanup():
    _reload_without_auth()
    from services import auth as auth_module

    assert auth_module.enabled() is False
