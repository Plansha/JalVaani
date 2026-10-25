from pathlib import Path
from gtts import gTTS

audio_dir = Path(__file__).parent / "benchmark_audio"
audio_dir.mkdir(parents=True, exist_ok=True)

samples = [
    (
        "hindi_sample.mp3",
        "hi",
        "आज मौसम अच्छा है। हमें तटीय गाँव में बाढ़ की चेतावनी देनी चाहिए।",
    ),
    (
        "english_sample.mp3",
        "en",
        "The weather is good today. We should issue a flood warning for the coastal village.",
    ),
]

for filename, language, text in samples:
    output = audio_dir / filename
    print(f"Generating {filename}...")
    gTTS(text=text, lang=language, slow=False).save(str(output))
    print(f"Saved: {output}")

print("Done! Both sample audio files have been created.")