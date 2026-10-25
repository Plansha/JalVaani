
import re


def review_transcript(transcript: str) -> dict:
    """Flag repeated adjacent words for human review."""
    words = transcript.split()
    review_phrases = []

    for index in range(len(words) - 1):
        first = re.sub(r"[^\w']", "", words[index]).casefold()
        second = re.sub(r"[^\w']", "", words[index + 1]).casefold()

        if first and first == second:
            phrase = f"{words[index]} {words[index + 1]}"

            if phrase not in review_phrases:
                review_phrases.append(phrase)

    if review_phrases:
        return {
            "needs_review": True,
            "review_phrases": review_phrases,
            "review_reasons": [
                "Repeated words detected; please check whether they were spoken."
            ],
        }

    return {
        "needs_review": False,
        "review_phrases": [],
        "review_reasons": [],
    }
