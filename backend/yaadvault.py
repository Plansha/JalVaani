
import json
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from uuid import uuid4

HISTORIES_FILE = Path(__file__).with_name("yaadvault_histories.json")
_FILE_LOCK = Lock()


def _read_histories() -> list[dict]:
    if not HISTORIES_FILE.exists():
        return []

    try:
        with HISTORIES_FILE.open("r", encoding="utf-8") as file:
            records = json.load(file)
    except (json.JSONDecodeError, OSError) as exc:
        raise RuntimeError("Could not read YaadVault storage.") from exc

    if not isinstance(records, list):
        raise RuntimeError("YaadVault storage must contain a JSON list.")

    return records


def save_history(
    title: str,
    transcript: str,
    consent_given: bool,
) -> dict:
    """Save a transcript only after explicit consent."""
    if consent_given is not True:
        raise ValueError("Explicit consent is required.")

    title = title.strip()
    transcript = transcript.strip()

    if not title:
        raise ValueError("Title cannot be empty.")

    if not transcript:
        raise ValueError("Transcript cannot be empty.")

    record = {
        "history_id": str(uuid4()),
        "title": title,
        "transcript": transcript,
        "consent_given": True,
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
    }

    with _FILE_LOCK:
        records = _read_histories()
        records.append(record)
        temporary_file = HISTORIES_FILE.with_suffix(".tmp")

        try:
            with temporary_file.open("w", encoding="utf-8") as file:
                json.dump(records, file, ensure_ascii=False, indent=2)
            temporary_file.replace(HISTORIES_FILE)
        except OSError as exc:
            raise RuntimeError("Could not save YaadVault history.") from exc

    return record


def list_histories() -> list[dict]:
    """List saved oral-history metadata without returning transcripts."""
    with _FILE_LOCK:
        records = _read_histories()

    return [
        {
            "history_id": record["history_id"],
            "title": record["title"],
            "consent_given": record["consent_given"],
            "created_at_utc": record["created_at_utc"],
        }
        for record in records
    ]


def get_history(history_id: str) -> dict | None:
    with _FILE_LOCK:
        records = _read_histories()

    return next(
        (record for record in records if record["history_id"] == history_id),
        None,
    )


def delete_history(history_id: str) -> bool:
    """Delete a saved history by its ID."""
    with _FILE_LOCK:
        records = _read_histories()
        updated_records = [
            record for record in records
            if record["history_id"] != history_id
        ]

        if len(updated_records) == len(records):
            return False

        temporary_file = HISTORIES_FILE.with_suffix(".tmp")

        try:
            with temporary_file.open("w", encoding="utf-8") as file:
                json.dump(updated_records, file, ensure_ascii=False, indent=2)
            temporary_file.replace(HISTORIES_FILE)
        except OSError as exc:
            raise RuntimeError("Could not delete YaadVault history.") from exc

    return True
