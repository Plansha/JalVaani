
import json

import pytest

from backend.shorproof import evaluate_transcript
from backend.critical_details import evaluate_critical_details
from backend.result_store import save_evaluation


def test_identical_transcripts_have_zero_error():
    result = evaluate_transcript(
        reference_transcript="आज का दिन अच्छा है",
        predicted_transcript="आज का दिन अच्छा है",
        latency_ms=623,
    )

    assert result["wer_percent"] == 0
    assert result["cer_percent"] == 0
    assert result["latency_ms"] == 623


def test_different_word_is_detected():
    result = evaluate_transcript(
        reference_transcript="आज का दिन अच्छा है",
        predicted_transcript="आज का दिन खराब है",
        latency_ms=623,
    )

    assert result["wer_percent"] > 0
    assert result["cer_percent"] > 0


def test_empty_reference_is_rejected():
    with pytest.raises(ValueError):
        evaluate_transcript(
            reference_transcript=" ",
            predicted_transcript="कुछ शब्द",
        )


def test_critical_detail_change_is_detected():
    result = evaluate_critical_details(
        reference_transcript=(
            "Flood warning for coastal village Dhanipur at 6 PM."
        ),
        predicted_transcript=(
            "Flood warning for coastal village Dhanipur at 8 PM."
        ),
        critical_details=["Dhanipur", "6 PM"],
    )

    assert result["critical_detail_accuracy_percent"] == 50
    assert result["critical_details"][0]["status"] == "preserved"
    assert result["critical_details"][1]["status"] == "missing_or_changed"


def test_results_are_saved_to_json(tmp_path, monkeypatch):
    import backend.result_store as result_store

    test_file = tmp_path / "test_results.json"
    monkeypatch.setattr(result_store, "RESULTS_FILE", test_file)

    save_evaluation("shorproof", {"wer_percent": 20})
    save_evaluation("critical_details", {"critical_detail_accuracy_percent": 50})

    with test_file.open("r", encoding="utf-8") as file:
        records = json.load(file)

    assert len(records) == 2
    assert records[0]["result_type"] == "shorproof"
    assert records[1]["result_type"] == "critical_details"
