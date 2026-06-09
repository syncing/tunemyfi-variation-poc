import json
import requests
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

PROMPT_PATH = ROOT / "prompts" / "variation_judge_v1.txt"
SAMPLE_PATH = ROOT / "data" / "samples" / "bad_video.json"

OLLAMA_URL = "http://127.0.0.1:11434/api/generate"
MODEL = "qwen3:32b"


def main():
    system_prompt = PROMPT_PATH.read_text(encoding="utf-8")
    sample = json.loads(SAMPLE_PATH.read_text(encoding="utf-8"))

    user_prompt = (
        "Evaluate this YouTube candidate for TuneMyFi.\n\n"
        + json.dumps(sample, ensure_ascii=False, indent=2)
    )

    payload = {
        "model": MODEL,
        "prompt": system_prompt + "\n\n" + user_prompt,
        "stream": False,
        "format": "json",
        "options": {
            "temperature": 0.1
        }
    }

    response = requests.post(OLLAMA_URL, json=payload, timeout=300)
    response.raise_for_status()

    data = response.json()
    raw = data.get("response", "")

    print(raw)

    try:
        parsed = json.loads(raw)
        print("\n--- parsed ---")
        print(json.dumps(parsed, ensure_ascii=False, indent=2))
    except json.JSONDecodeError:
        print("\nFailed to parse JSON.")


if __name__ == "__main__":
    main()
