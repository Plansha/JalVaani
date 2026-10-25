
from fastapi.testclient import TestClient

from backend.main import app
from backend import yaadvault
import backend.main as main_module


TEST_TOKEN = "test-only-secret"


def auth_headers():
    return {"Authorization": f"Bearer {TEST_TOKEN}"}


client = TestClient(app)


def setup_test_token(monkeypatch):
    monkeypatch.setattr(
        main_module,
        "YAADVAULT_API_TOKEN",
        TEST_TOKEN,
    )


def test_yaadvault_rejects_missing_token(monkeypatch):
    setup_test_token(monkeypatch)

    response = client.get("/api/yaadvault")

    assert response.status_code == 401


def test_yaadvault_requires_consent(monkeypatch):
    setup_test_token(monkeypatch)

    response = client.post(
        "/api/yaadvault",
        json={
            "title": "Test story",
            "transcript": "A story from a coastal village.",
            "consent_given": False,
        },
        headers=auth_headers(),
    )

    assert response.status_code == 400


def test_yaadvault_save_list_get_delete(tmp_path, monkeypatch):
    setup_test_token(monkeypatch)

    monkeypatch.setattr(
        yaadvault,
        "HISTORIES_FILE",
        tmp_path / "test_histories.json",
    )

    payload = {
        "title": "Test story",
        "transcript": "A story from a coastal village.",
        "consent_given": True,
    }

    # Save a history.
    created = client.post(
        "/api/yaadvault",
        json=payload,
        headers=auth_headers(),
    )
    assert created.status_code == 201

    record = created.json()
    history_id = record["history_id"]
    assert record["title"] == "Test story"
    assert record["consent_given"] is True

    # List histories.
    listed = client.get(
        "/api/yaadvault",
        headers=auth_headers(),
    )
    assert listed.status_code == 200
    assert len(listed.json()["histories"]) == 1
    assert "transcript" not in listed.json()["histories"][0]

    # Retrieve the complete history.
    retrieved = client.get(
        f"/api/yaadvault/{history_id}",
        headers=auth_headers(),
    )
    assert retrieved.status_code == 200
    assert retrieved.json()["transcript"] == payload["transcript"]

    # Delete it.
    deleted = client.delete(
        f"/api/yaadvault/{history_id}",
        headers=auth_headers(),
    )
    assert deleted.status_code == 200
    assert deleted.json()["deleted"] is True

    # Confirm it no longer exists.
    missing = client.get(
        f"/api/yaadvault/{history_id}",
        headers=auth_headers(),
    )
    assert missing.status_code == 404


def test_yaadvault_rejects_blank_title(tmp_path, monkeypatch):
    setup_test_token(monkeypatch)

    monkeypatch.setattr(
        yaadvault,
        "HISTORIES_FILE",
        tmp_path / "blank_title.json",
    )

    response = client.post(
        "/api/yaadvault",
        json={
            "title": "   ",
            "transcript": "A test story.",
            "consent_given": True,
        },
        headers=auth_headers(),
    )

    assert response.status_code == 400


def test_yaadvault_rejects_blank_transcript(tmp_path, monkeypatch):
    setup_test_token(monkeypatch)

    monkeypatch.setattr(
        yaadvault,
        "HISTORIES_FILE",
        tmp_path / "blank_transcript.json",
    )

    response = client.post(
        "/api/yaadvault",
        json={
            "title": "Test story",
            "transcript": "   ",
            "consent_given": True,
        },
        headers=auth_headers(),
    )

    assert response.status_code == 400


def test_yaadvault_delete_nonexistent_history(tmp_path, monkeypatch):
    setup_test_token(monkeypatch)

    monkeypatch.setattr(
        yaadvault,
        "HISTORIES_FILE",
        tmp_path / "missing_history.json",
    )

    response = client.delete(
        "/api/yaadvault/nonexistent-id",
        headers=auth_headers(),
    )

    assert response.status_code == 404
