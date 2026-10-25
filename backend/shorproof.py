
from jiwer import wer, cer


def evaluate_transcript(
    reference_transcript: str,
    predicted_transcript: str,
    latency_ms: float | None = None,
) -> dict:
    """Compare an AI transcript against a verified reference."""

    if not reference_transcript or not reference_transcript.strip():
        raise ValueError("Reference transcript cannot be empty.")

    if not predicted_transcript or not predicted_transcript.strip():
        raise ValueError("Predicted transcript cannot be empty.")

    word_error_rate = wer(
        reference_transcript,
        predicted_transcript,
    )
    character_error_rate = cer(
        reference_transcript,
        predicted_transcript,
    )

    return {
        "reference_transcript": reference_transcript,
        "predicted_transcript": predicted_transcript,
        "wer": round(word_error_rate, 4),
        "wer_percent": round(word_error_rate * 100, 2),
        "cer": round(character_error_rate, 4),
        "cer_percent": round(character_error_rate * 100, 2),
        "latency_ms": latency_ms,
        "evaluation_status": "completed",
    }
