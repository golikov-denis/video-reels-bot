import json
import os
import sys

from faster_whisper import WhisperModel


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit(2)

    model = WhisperModel(
        os.environ.get("WHISPER_MODEL", "tiny"),
        device="cpu",
        compute_type="int8",
        cpu_threads=2,
    )
    segments, info = model.transcribe(
        sys.argv[1],
        beam_size=1,
        best_of=1,
        condition_on_previous_text=False,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 700},
    )
    result = {
        "language": info.language,
        "languageProbability": info.language_probability,
        "segments": [
            {"start": segment.start, "end": segment.end, "text": segment.text.strip()}
            for segment in segments
            if segment.text.strip()
        ],
    }
    json.dump(result, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
