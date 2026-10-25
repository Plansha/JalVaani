
import os
import time
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.concurrency import run_in_threadpool
from gnani.stt import GnaniSTTClient
from .context_echo import review_transcript
from pydantic import BaseModel
from .shorproof import evaluate_transcript
from typing import List
from pydantic import BaseModel
from .critical_details import evaluate_critical_details
from .result_store import save_evaluation

load_dotenv(Path(__file__).with_name(".env"))
GNANI_API_KEY = os.getenv("GNANI_API_KEY")

app = FastAPI(
    title="JalVaani API",
    description="Noise-resilient voice intelligence for coastal communities",
    version="0.5.0",
)

SUPPORTED_LANGUAGES = GnaniSTTClient.supported_languages()

ALLOWED_TYPES = {
    "audio/wav",
    "audio/x-wav",
    "audio/mpeg",
    "audio/mp4",
    "audio/webm",
    "audio/ogg",
    "audio/aac",
    "audio/flac",
    "audio/x-flac",
    "application/octet-stream",
}


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

        if audio.content_type not in ALLOWED_TYPES:
            raise HTTPException(
                status_code=415,
                detail="Unsupported audio format",
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

        result = await run_in_threadpool(
            client.transcribe_bytes,
            content,
            filename=audio.filename,
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

        # ContextEcho: flag possible repeated words for human review.
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
            detail="Transcription failed. Check the server terminal for the error.",
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
