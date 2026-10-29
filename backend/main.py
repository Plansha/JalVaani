
import os
import time
import shutil
import subprocess
import tempfile
from pathlib import Path
from secrets import compare_digest
from typing import List

from dotenv import load_dotenv
from fastapi import (
    FastAPI,
    UploadFile,
    File,
    Form,
    HTTPException,
    Depends,
)
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from gnani.stt import GnaniSTTClient
from pydantic import BaseModel

from .context_echo import review_transcript
from .shorproof import evaluate_transcript
from .critical_details import evaluate_critical_details
from .result_store import save_evaluation
from .yaadvault import (
    save_history,
    list_histories,
    get_history,
    delete_history,
)


load_dotenv(Path(__file__).with_name(".env"))

GNANI_API_KEY = os.getenv("GNANI_API_KEY")
YAADVAULT_API_TOKEN = os.getenv("YAADVAULT_API_TOKEN")

MAX_AUDIO_BYTES = 15 * 1024 * 1024

ALLOWED_TYPES = {
    "audio/mpeg",
    "audio/mp3",
    "audio/wav",
    "audio/x-wav",
    "audio/wave",
    "audio/mp4",
    "audio/x-m4a",
    "audio/aac",
    "audio/ogg",
    "application/ogg",
    "audio/webm",
    "audio/flac",
    "audio/x-flac",
}

SUPPORTED_LANGUAGES = {
    "en-IN": "English (India)",
    "hi-IN": "Hindi",
    "bn-IN": "Bengali",
    "gu-IN": "Gujarati",
    "kn-IN": "Kannada",
    "ml-IN": "Malayalam",
    "mr-IN": "Marathi",
    "od-IN": "Odia",
    "pa-IN": "Punjabi",
    "ta-IN": "Tamil",
    "te-IN": "Telugu",
}

yaadvault_bearer = HTTPBearer(auto_error=False)


def require_yaadvault_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(
        yaadvault_bearer
    ),
):
    if not YAADVAULT_API_TOKEN:
        raise HTTPException(
            status_code=503,
            detail="YaadVault authentication is not configured",
        )

    if (
        credentials is None
        or credentials.scheme.lower() != "bearer"
        or not compare_digest(
            credentials.credentials,
            YAADVAULT_API_TOKEN,
        )
    ):
        raise HTTPException(
            status_code=401,
            detail="Valid bearer token required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return True


app = FastAPI(
    title="JalVaani API",
    description="Noise-resilient voice intelligence for coastal communities",
    version="0.6.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5500",
        "http://localhost:5500",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://jalvaani-frontend.onrender.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "project": "JalVaani",
        "message": "Backend is running",
    }


@app.get("/api/languages")
def get_languages():
    return {
        "languages": [
            {"code": code, "name": name}
            for code, name in sorted(SUPPORTED_LANGUAGES.items())
        ]
    }


def convert_webm_to_wav(audio_bytes: bytes) -> bytes:
    """Convert browser WebM/Opus audio to mono, 16 kHz WAV."""
    ffmpeg = shutil.which("ffmpeg")

    if not ffmpeg:
        raise RuntimeError("FFmpeg is not installed or is not on PATH.")

    with tempfile.TemporaryDirectory() as temp_dir:
        input_path = Path(temp_dir) / "input.webm"
        output_path = Path(temp_dir) / "output.wav"
        input_path.write_bytes(audio_bytes)

        result = subprocess.run(
            [
                ffmpeg,
                "-nostdin",
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-i",
                str(input_path),
                "-vn",
                "-ac",
                "1",
                "-ar",
                "16000",
                "-c:a",
                "pcm_s16le",
                str(output_path),
            ],
            capture_output=True,
            timeout=30,
            check=False,
        )

        if result.returncode != 0 or not output_path.exists():
            raise ValueError("Could not convert the uploaded audio.")

        return output_path.read_bytes()


async def _transcribe_upload(
    audio: UploadFile,
    language_code: str,
) -> dict:
    """
    Validate and transcribe one uploaded audio file.
    The calling route is responsible for closing the upload.
    """
    if not audio.filename:
        raise HTTPException(
            status_code=400,
            detail="No filename provided",
        )

    content_type = (
        (audio.content_type or "")
        .lower()
        .split(";", 1)[0]
        .strip()
    )

    if content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported audio format: {audio.content_type}",
        )

    if language_code not in SUPPORTED_LANGUAGES:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "Unsupported language code",
                "supported_languages": SUPPORTED_LANGUAGES,
            },
        )

    if not GNANI_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="Speech-to-text is not configured on the server.",
        )

    content = await audio.read()

    if not content:
        raise HTTPException(
            status_code=400,
            detail="Uploaded audio is empty",
        )

    if len(content) > MAX_AUDIO_BYTES:
        raise HTTPException(
            status_code=413,
            detail="Audio exceeds the 15 MB limit",
        )

    filename = audio.filename

    if content_type == "audio/webm":
        content = await run_in_threadpool(
            convert_webm_to_wav,
            content,
        )
        filename = "recording.wav"

    client = GnaniSTTClient(api_key=GNANI_API_KEY)
    start_time = time.perf_counter()

    result = await run_in_threadpool(
        client.transcribe_bytes,
        content,
        filename=filename,
        language_code=language_code,
    )

    latency_ms = round((time.perf_counter() - start_time) * 1000)

    if not isinstance(result, dict):
        raise HTTPException(
            status_code=502,
            detail="The speech service returned an unexpected response.",
        )

    transcript = result.get("transcript")

    if not isinstance(transcript, str):
        raise HTTPException(
            status_code=502,
            detail="The speech service returned no usable transcript.",
        )

    review = review_transcript(transcript)

    return {
        "status": "success",
        "filename": audio.filename,
        "size_bytes": len(content),
        "language_code": language_code,
        "language_name": SUPPORTED_LANGUAGES[language_code],
        "transcript": transcript,
        "needs_review": review["needs_review"],
        "review_phrases": review["review_phrases"],
        "review_reasons": review["review_reasons"],
        "latency_ms": latency_ms,
    }


@app.post("/api/transcribe")
async def transcribe_audio(
    audio: UploadFile = File(...),
    language_code: str = Form("en-IN"),
):
    try:
        result = await _transcribe_upload(audio, language_code)

        if not result["transcript"].strip():
            raise HTTPException(
                status_code=422,
                detail=(
                    "No speech was recognized. Check the audio content, "
                    "recording quality, and selected language."
                ),
            )

        return result

    except HTTPException:
        raise

    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=str(exc),
        ) from exc

    except RuntimeError as exc:
        raise HTTPException(
            status_code=502,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        print(
            f"Transcription error type: {type(exc).__name__}",
            flush=True,
        )
        print(f"Transcription error: {exc!r}", flush=True)

        raise HTTPException(
            status_code=502,
            detail="Transcription failed. Check the server logs for the error.",
        ) from exc

    finally:
        await audio.close()


class ShorProofRequest(BaseModel):
    reference_transcript: str
    predicted_transcript: str
    latency_ms: float | None = None


@app.post("/api/shorproof/evaluate")
def evaluate_shorproof(request: ShorProofRequest):
    try:
        result = evaluate_transcript(
            reference_transcript=request.reference_transcript,
            predicted_transcript=request.predicted_transcript,
            latency_ms=request.latency_ms,
        )

        save_evaluation("shorproof", result)
        return result

    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=str(exc),
        ) from exc

    except RuntimeError as exc:
        raise HTTPException(
            status_code=500,
            detail=str(exc),
        ) from exc


@app.post("/api/shorproof/compare")
async def compare_shorproof(
    quiet_audio: UploadFile = File(...),
    noisy_audio: UploadFile = File(...),
    language_code: str = Form("en-IN"),
    reference_transcript: str = Form(...),
):
    """Transcribe quiet/noisy recordings and compare against a reference."""
    try:
        reference = reference_transcript.strip()

        if not reference:
            raise HTTPException(
                status_code=422,
                detail="Reference transcript cannot be empty.",
            )

        if language_code not in SUPPORTED_LANGUAGES:
            raise HTTPException(
                status_code=422,
                detail={
                    "message": "Unsupported language code",
                    "supported_languages": SUPPORTED_LANGUAGES,
                },
            )

        quiet_result = await _transcribe_upload(
            quiet_audio,
            language_code,
        )

        noisy_result = await _transcribe_upload(
            noisy_audio,
            language_code,
        )

        quiet_transcript = quiet_result.get("transcript", "")
        noisy_transcript = noisy_result.get("transcript", "")

        if (
            not isinstance(quiet_transcript, str)
            or not quiet_transcript.strip()
        ):
            raise HTTPException(
                status_code=422,
                detail=(
                    "No speech was recognized in the quiet recording. "
                    "Check the recording and selected language."
                ),
            )

        if (
            not isinstance(noisy_transcript, str)
            or not noisy_transcript.strip()
        ):
            raise HTTPException(
                status_code=422,
                detail=(
                    "No speech was recognized in the noisy recording. "
                    "Check the recording, noise level, and selected language."
                ),
            )

        quiet_evaluation = evaluate_transcript(
            reference_transcript=reference,
            predicted_transcript=quiet_transcript,
            latency_ms=quiet_result["latency_ms"],
        )

        noisy_evaluation = evaluate_transcript(
            reference_transcript=reference,
            predicted_transcript=noisy_transcript,
            latency_ms=noisy_result["latency_ms"],
        )

        report = {
            "language_code": language_code,
            "reference_transcript": reference,
            "quiet": {
                "transcript": quiet_transcript,
                "latency_ms": quiet_result["latency_ms"],
                "wer_percent": quiet_evaluation["wer_percent"],
                "cer_percent": quiet_evaluation["cer_percent"],
                "evaluation": quiet_evaluation,
            },
            "noisy": {
                "transcript": noisy_transcript,
                "latency_ms": noisy_result["latency_ms"],
                "wer_percent": noisy_evaluation["wer_percent"],
                "cer_percent": noisy_evaluation["cer_percent"],
                "evaluation": noisy_evaluation,
            },
        }

        saved_record = save_evaluation(
            "shorproof_compare",
            report,
        )

        return {
            "status": "success",
            "report_id": saved_record["result_id"],
            "report_saved": True,
            **report,
        }

    except HTTPException:
        raise

    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=str(exc),
        ) from exc

    except RuntimeError as exc:
        raise HTTPException(
            status_code=500,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        print(
            f"ShorProof comparison error: {type(exc).__name__}: {exc}",
            flush=True,
        )

        raise HTTPException(
            status_code=502,
            detail="Comparison failed. Check the server logs for the error.",
        ) from exc

    finally:
        await quiet_audio.close()
        await noisy_audio.close()


class CriticalDetailsRequest(BaseModel):
    reference_transcript: str
    predicted_transcript: str
    critical_details: List[str]


@app.post("/api/shorproof/critical-details")
def evaluate_critical_details_endpoint(
    request: CriticalDetailsRequest,
):
    try:
        result = evaluate_critical_details(
            reference_transcript=request.reference_transcript,
            predicted_transcript=request.predicted_transcript,
            critical_details=request.critical_details,
        )

        save_evaluation("critical_details", result)
        return result

    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=str(exc),
        ) from exc

    except RuntimeError as exc:
        raise HTTPException(
            status_code=500,
            detail=str(exc),
        ) from exc


class YaadVaultCreate(BaseModel):
    title: str
    transcript: str
    consent_given: bool


@app.post(
    "/api/yaadvault",
    status_code=201,
    dependencies=[Depends(require_yaadvault_token)],
)
def create_yaadvault_history(payload: YaadVaultCreate):
    try:
        return save_history(
            title=payload.title,
            transcript=payload.transcript,
            consent_given=payload.consent_given,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    except RuntimeError as exc:
        raise HTTPException(
            status_code=500,
            detail=str(exc),
        ) from exc


@app.get(
    "/api/yaadvault",
    dependencies=[Depends(require_yaadvault_token)],
)
def get_yaadvault_histories():
    try:
        return {"histories": list_histories()}

    except RuntimeError as exc:
        raise HTTPException(
            status_code=500,
            detail=str(exc),
        ) from exc


@app.get(
    "/api/yaadvault/{history_id}",
    dependencies=[Depends(require_yaadvault_token)],
)
def get_yaadvault_history(history_id: str):
    try:
        record = get_history(history_id)

    except RuntimeError as exc:
        raise HTTPException(
            status_code=500,
            detail=str(exc),
        ) from exc

    if record is None:
        raise HTTPException(
            status_code=404,
            detail="History not found",
        )

    return record


@app.delete(
    "/api/yaadvault/{history_id}",
    dependencies=[Depends(require_yaadvault_token)],
)
def remove_yaadvault_history(history_id: str):
    try:
        deleted = delete_history(history_id)

    except RuntimeError as exc:
        raise HTTPException(
            status_code=500,
            detail=str(exc),
        ) from exc

    if not deleted:
        raise HTTPException(
            status_code=404,
            detail="History not found",
        )

    return {
        "deleted": True,
        "history_id": history_id,
    }
