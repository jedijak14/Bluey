"""Original assistant-authored facts/templates. No scraping or private user data.
This writes a tiny engineering curriculum, NOT a general knowledge corpus.
Held-out splits change phrasing, not the underlying facts.
"""
import json
from pathlib import Path

FACTS = [
    ("bluey", "an experimental assistant"),
    ("the default voice setting", "silent"),
    ("a triangle", "a shape with three sides"),
    ("a square", "a shape with four equal sides"),
    ("a week", "seven days"),
    ("a day", "twenty four hours"),
    ("an hour", "sixty minutes"),
    ("a minute", "sixty seconds"),
    ("water", "a substance made of hydrogen and oxygen"),
    ("the sun", "a star"),
    ("earth", "a planet"),
    ("the moon", "a natural satellite of earth"),
    ("gravity", "attraction between objects with mass"),
    ("a plant", "a living organism"),
    ("photosynthesis", "the process plants use to make food using light"),
    ("ice", "frozen water"),
    ("steam", "water in its gas form"),
    ("a noun", "a word naming a person place thing or idea"),
    ("a verb", "a word expressing an action or state"),
    ("an adjective", "a word describing a noun"),
    ("a computer", "a machine that processes information"),
    ("a password", "a secret used to protect access"),
    ("a browser", "an application for viewing websites"),
    ("a keyboard", "an input device for typing"),
    ("a microphone", "an input device for sound"),
    ("an algorithm", "a sequence of instructions for a task"),
    ("a source citation", "a reference showing where information came from"),
    ("web search", "a way to find information online"),
    ("wifi", "a wireless network connection"),
    ("pc pairing", "connecting a phone to a computer with permission"),
    ("training", "adjusting model weights using examples"),
    ("a model prediction", "an output that can be wrong"),
]
TEMPLATES = {
    "train": ["what is {s}?", "define {s}.", "tell me about {s}.", "can you explain {s}?", "explain {s} to me.", "give me a definition of {s}.", "please explain {s} for a beginner.", "what does {s} mean?", "describe {s} in simple words.", "give a short definition for {s}.", "tell me what {s} is.", "how would you define {s}?"],
    "validation": ["can you define {s} for me?"],
    "test": ["what is the definition of {s}?"],
}
if __name__ == "__main__":
    root = Path(__file__).parent / "data"
    root.mkdir(exist_ok=True)
    for split, templates in TEMPLATES.items():
        rows = [{"question": template.format(s=subject), "answer": answer + "."}
                for subject, answer in FACTS for template in templates]
        (root / f"{split}.jsonl").write_text("".join(json.dumps(r) + "\n" for r in rows))
