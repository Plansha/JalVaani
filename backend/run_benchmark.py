
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from gnani.stt import GnaniSTTClient
from jiwer import wer, cer

BASE_DIR = Path(__file__).parent
AUDIO_DIR = BASE_DIR / "benchmark_audio"
REPORT_PATH = BASE_DIR / "benchmark_report.json"

load_dotenv(BASE_DIR / ".env")
API_KEY = os.getenv("GNANI_API_KEY")

SAMPLES = [
    {
        "filename": "hindi_sample.mp3",
        "language_code": "hi-IN",
        "reference": "आज मौसम अच्छा है। हमें तटीय गाँव में बाढ़ की चेतावनी देनी चाहिए।",
    },
    {
        "filename": "english_sample.mp3",
        "language_code": "en-IN",
        "reference": (
            "The weather is good today. We should issue a flood "
            "warning for the coastal village."
        ),
    },
]


def main():
    if not API_KEY:
        raise SystemExit(
            "GNANI_API_KEY missing. Check backend/.env."
        )

    missing = [
        item["filename"]
        for item in SAMPLES
        if not (AUDIO_DIR / item["filename"]).is_file()
    ]

    if missing:
        raise SystemExit(
            "Missing audio files: "
            + ", ".join(missing)
            + f"\nExpected folder: {AUDIO_DIR}"
        )

    client = GnaniSTTClient(api_key=API_KEY)
    results = []

    for sample in SAMPLES:
        audio_path = AUDIO_DIR / sample["filename"]
        audio_bytes = audio_path.read_bytes()

        print(
            f"\nTranscribing {audio_path.name} "
            f"({sample['language_code']})..."
        )

        start = time.perf_counter()

        try:
            response = client.transcribe_bytes(
                audio_bytes,
                filename=audio_path.name,
                language_code=sample["language_code"],
            )
            latency_ms = round(
                (time.perf_counter() - start) * 1000, 2
            )

            if not isinstance(response, dict):
                raise ValueError("Unexpected response from Gnani.")

            prediction = response.get("transcript")
            if not isinstance(prediction, str) or not prediction.strip():
                raise ValueError("Gnani returned an empty transcript.")

            reference = sample["reference"]

            result = {
                "filename": audio_path.name,
                "language_code": sample["language_code"],
                "reference_transcript": reference,
                "predicted_transcript": prediction,
                "wer": round(wer(reference, prediction), 4),
                "cer": round(cer(reference, prediction), 4),
                "wer_percent": round(wer(reference, prediction) * 100, 2),
                "cer_percent": round(cer(reference, prediction) * 100, 2),
                "latency_ms": latency_ms,
                "status": "success",
            }

        except Exception as exc:
            latency_ms = round(
                (time.perf_counter() - start) * 1000, 2
            )
            result = {
                "filename": audio_path.name,
                "language_code": sample["language_code"],
                "latency_ms": latency_ms,
                "status": "error",
                "error_type": type(exc).__name__,
                "error": str(exc),
            }

        results.append(result)

        print(f"Status: {result['status']}")
        if result["status"] == "success":
            print(f"Reference:  {result['reference_transcript']}")
            print(f"Prediction: {result['predicted_transcript']}")
            print(f"WER: {result['wer_percent']}%")
            print(f"CER: {result['cer_percent']}%")
            print(f"Latency: {result['latency_ms']} ms")
        else:
            print(f"Error: {result['error']}")

    report = {
        "project": "JalVaani",
        "benchmark_type": "synthetic_speech_initial_test",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "notes": [
            "References must match the exact spoken audio.",
            "Synthetic speech results are not real-world accuracy evidence.",
            "WER and CER are error rates; lower is better.",
            "Latency includes the measured STT call, not audio upload from a browser.",
        ],
        "results": results,
    }

    REPORT_PATH.write_text(
        json.dumps(report, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"\nReport saved to: {REPORT_PATH}")
    print("Benchmark finished.")


if __name__ == "__main__":
    main()
