
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


from unittest.mock import AsyncMock, patch




def test_shorproof_compare_endpoint():
    from unittest.mock import AsyncMock, patch

    reference = "Flood warning at 6 PM."

    quiet_result = {
        "status": "success",
        "transcript": reference,
        "latency_ms": 500,
    }
    noisy_result = {
        "status": "success",
        "transcript": "Flood warning at 8 PM.",
        "latency_ms": 700,
    }

    with (
        patch(
            "backend.main._transcribe_upload",
            new_callable=AsyncMock,
            side_effect=[quiet_result, noisy_result],
        ),
        patch(
            "backend.main.save_evaluation",
            return_value={"result_id": "test-report-123"},
        ),
    ):
        response = client.post(
            "/api/shorproof/compare",
            files=[
                ("quiet_audio", ("quiet.wav", b"fake audio", "audio/wav")),
                ("noisy_audio", ("noisy.wav", b"fake audio", "audio/wav")),
            ],
            data={
                "language_code": "en-IN",
                "reference_transcript": reference,
            },
        )

    assert response.status_code == 200, response.text
    result = response.json()
    assert result["report_id"] == "test-report-123"
    assert result["status"] == "success"
    assert result["quiet"]["transcript"] == reference
    assert result["noisy"]["transcript"] == "Flood warning at 8 PM."

def test_shorproof_compare_rejects_empty_reference():
    response = client.post(
        "/api/shorproof/compare",
        files=[
            ("quiet_audio", ("quiet.wav", b"fake audio", "audio/wav")),
            ("noisy_audio", ("noisy.wav", b"fake audio", "audio/wav")),
        ],
        data={
            "language_code": "en-IN",
            "reference_transcript": "   ",
        },
    )

    assert response.status_code == 422
