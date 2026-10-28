
import os
import time
from pathlib import Path
from secrets import compare_digest
from typing import List
import os
import shutil
import subprocess
import tempfile

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

# Audio MIME types accepted by the upload endpoint.
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
    version="0.5.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5500",
        "http://localhost:5500",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://jalvaani-frontend.onrender.com",
        # Add the exact Vercel frontend origin here when available.
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
                "-loglevel", "error",
                "-y",
                "-i", str(input_path),
                "-vn",
                "-ac", "1",
                "-ar", "16000",
                "-c:a", "pcm_s16le",
                str(output_path),
            ],
            capture_output=True,
            timeout=30,
            check=False,
        )

        if result.returncode != 0 or not output_path.exists():
            raise ValueError("Could not convert the uploaded audio.")

        return output_path.read_bytes()
@app.post("/api/transcribe")
async def transcribe_audio(
    audio: UploadFile = File(...),
    language_code: str = Form("en-IN"),
):
    try:
        if not audio.filename:
            raise HTTPException(
                status_code=400,
                detail="No filename provided",
            )

        content_type = (audio.content_type or "").lower().split(";", 1)[0].strip()
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

        content = await audio.read()

        if not content:
            raise HTTPException(
                status_code=400,
                detail="Uploaded audio is empty",
            )

        if len(content) > 15 * 1024 * 1024:
            raise HTTPException(
                status_code=413,
                detail="Audio exceeds the 15 MB limit",
            )

        if not GNANI_API_KEY:
            raise HTTPException(
                status_code=503,
                detail="Speech-to-text is not configured on the server.",
            )

        client = GnaniSTTClient(api_key=GNANI_API_KEY)
        start_time = time.perf_counter()
        
        filename = audio.filename
        if content_type == "audio/webm":
            content = await run_in_threadpool(convert_webm_to_wav, content)
            filename = "recording.wav"


        result = await run_in_threadpool(
            client.transcribe_bytes,
            content,
            filename=filename,
            language_code=language_code,
            )

        latency_ms = round(
            (time.perf_counter() - start_time) * 1000
        )

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

    except HTTPException:
        raise

    except Exception as e:
        print(
            f"Transcription error type: {type(e).__name__}",
            flush=True,
        )
        print(
            f"Transcription error: {e!r}",
            flush=True,
        )
        raise HTTPException(
            status_code=502,
            detail="Transcription failed. Check the server logs for the error.",
        ) from e

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
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


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
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


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
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get(
    "/api/yaadvault",
    dependencies=[Depends(require_yaadvault_token)],
)
def get_yaadvault_histories():
    try:
        return {"histories": list_histories()}
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get(
    "/api/yaadvault/{history_id}",
    dependencies=[Depends(require_yaadvault_token)],
)
def get_yaadvault_history(history_id: str):
    try:
        record = get_history(history_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    if record is None:
        raise HTTPException(status_code=404, detail="History not found")

    return record


@app.delete(
    "/api/yaadvault/{history_id}",
    dependencies=[Depends(require_yaadvault_token)],
)
def remove_yaadvault_history(history_id: str):
    try:
        deleted = delete_history(history_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    if not deleted:
        raise HTTPException(status_code=404, detail="History not found")

    return {"deleted": True, "history_id": history_id}
