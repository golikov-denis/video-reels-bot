import json
import sys

from argostranslate import translate


def main() -> None:
    payload = json.load(sys.stdin)
    source = payload["from"]
    target = payload["to"]
    texts = payload["texts"]
    if source not in {"ru", "en"} or target not in {"ru", "en"} or source == target:
        raise ValueError("Unsupported translation direction")
    if not isinstance(texts, list) or not all(isinstance(text, str) for text in texts):
        raise ValueError("Invalid translation input")
    result = [translate.translate(text, source, target) for text in texts]
    json.dump({"texts": result}, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
