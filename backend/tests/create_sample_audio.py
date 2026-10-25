
from pathlib import Path
from gtts import gTTS

# Save recordings in the benchmark audio folder
AUDIO_DIR = Path(__file__).parent / "benchmark_audio"
AUDIO_DIR.mkdir(parents=True, exist_ok=True)

samples = [
    {
        "filename": "hindi_sample.mp3",
        "language": "hi",
        "text": "आज मौसम अच्छा है। हमें तटीय गाँव में बाढ़ की चेतावनी देनी चाहिए।",
    },
    {
        "filename": "english_sample.mp3",
        "language": "en",
        "text": "The weather is good today. We should issue a flood warning for the coastal village.",
    },
]

for sample in samples:
    output_path = AUDIO_DIR / sample["filename"]

    speech = gTTS(
        text=sample["text"],
        lang=sample["language"],
        slow=False,
    )
    speech.save(str(output_path))

    print(f"Created: {output_path}")

print("\nSample audio generation complete!")
