
import re
from typing import List


def normalize_text(text: str) -> str:
    """Normalize whitespace and compare text without case differences."""
    return re.sub(r"\s+", " ", text.strip()).casefold()


def evaluate_critical_details(
    reference_transcript: str,
    predicted_transcript: str,
    critical_details: List[str],
) -> dict:
    if not reference_transcript.strip():
        raise ValueError("Reference transcript cannot be empty.")

    if not predicted_transcript.strip():
        raise ValueError("Predicted transcript cannot be empty.")

    if not critical_details:
        raise ValueError("Provide at least one critical detail.")

    reference = normalize_text(reference_transcript)
    predicted = normalize_text(predicted_transcript)

    results = []

    for detail in critical_details:
        if not detail or not detail.strip():
            continue

        normalized_detail = normalize_text(detail)

        in_reference = normalized_detail in reference
        in_prediction = normalized_detail in predicted

        if not in_reference:
            status = "not_in_reference"
        elif in_prediction:
            status = "preserved"
        else:
            status = "missing_or_changed"

        results.append({
            "detail": detail,
            "status": status,
            "present_in_reference": in_reference,
            "present_in_prediction": in_prediction,
        })

    if not results:
        raise ValueError("Provide at least one non-empty critical detail.")

    expected_details = sum(
        item["present_in_reference"] for item in results
    )
    preserved_details = sum(
        item["status"] == "preserved" for item in results
    )

    accuracy = (
        preserved_details / expected_details * 100
        if expected_details
        else None
    )

    return {
        "critical_details": results,
        "expected_detail_count": expected_details,
        "preserved_detail_count": preserved_details,
        "critical_detail_accuracy_percent": (
            round(accuracy, 2) if accuracy is not None else None
        ),
        "evaluation_status": "completed",
        "warning": (
            "Text matching only; verify important details with a human."
        ),
    }
