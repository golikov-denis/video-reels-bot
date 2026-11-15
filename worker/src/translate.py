import json
import sys

import stanza

_stanza_pipeline = stanza.Pipeline


def _offline_stanza_pipeline(*args, **kwargs):
    kwargs["download_method"] = None
    return _stanza_pipeline(*args, **kwargs)


# Argos does not expose this flag; all required models are baked into the image.
stanza.Pipeline = _offline_stanza_pipeline

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
