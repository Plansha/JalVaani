
from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)


def test_health_endpoint():
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_shorproof_endpoint():
    response = client.post(
        "/api/shorproof/evaluate",
        json={
            "reference_transcript": "आज का दिन अच्छा है",
            "predicted_transcript": "आज का दिन अच्छा है",
            "latency_ms": 623,
        },
    )

    assert response.status_code == 200
    assert response.json()["wer_percent"] == 0
    assert response.json()["cer_percent"] == 0


def test_critical_details_endpoint():
    response = client.post(
        "/api/shorproof/critical-details",
        json={
            "reference_transcript": (
                "Flood warning for coastal village Dhanipur at 6 PM."
            ),
            "predicted_transcript": (
                "Flood warning for coastal village Dhanipur at 8 PM."
            ),
            "critical_details": ["Dhanipur", "6 PM"],
        },
    )

    assert response.status_code == 200
    result = response.json()
    assert result["critical_detail_accuracy_percent"] == 50
    assert result["critical_details"][1]["status"] == "missing_or_changed"


def test_shorproof_rejects_missing_fields():
    response = client.post(
        "/api/shorproof/evaluate",
        json={"reference_transcript": "आज का दिन अच्छा है"},
    )

    assert response.status_code == 422
