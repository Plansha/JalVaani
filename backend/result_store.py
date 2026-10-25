
import json
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock

RESULTS_FILE = Path(__file__).with_name("evaluation_results.json")
_FILE_LOCK = Lock()


def save_evaluation(result_type: str, result: dict) -> dict:
    """Append an evaluation result to a local JSON file."""
    record = {
        "result_id": datetime.now(timezone.utc).strftime(
            "%Y%m%dT%H%M%S%fZ"
        ),
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "result_type": result_type,
        "result": result,
    }

    with _FILE_LOCK:
        if RESULTS_FILE.exists():
            try:
                with RESULTS_FILE.open("r", encoding="utf-8") as file:
                    records = json.load(file)
                if not isinstance(records, list):
                    raise ValueError("Results file must contain a JSON list.")
            except (json.JSONDecodeError, OSError) as exc:
                raise RuntimeError(
                    "Could not read the existing evaluation results file."
                ) from exc
        else:
            records = []

        records.append(record)

        temporary_file = RESULTS_FILE.with_suffix(".tmp")
        try:
            with temporary_file.open("w", encoding="utf-8") as file:
                json.dump(records, file, ensure_ascii=False, indent=2)
            temporary_file.replace(RESULTS_FILE)
        except OSError as exc:
            raise RuntimeError("Could not save evaluation results.") from exc

    return record
