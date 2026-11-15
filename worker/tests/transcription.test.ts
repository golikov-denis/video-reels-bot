import { describe, expect, it } from "vitest";
import { parseTranscription } from "../src/transcription";

describe("результат faster-whisper", () => {
  it("принимает сегменты и ограничивает длину языка", () => {
    expect(
      parseTranscription({
        language: "english-language-name",
        languageProbability: 0.87,
        segments: [{ start: 1.2, end: 4.8, text: "A complete thought." }],
      }),
    ).toEqual({
      language: "english-language",
      languageProbability: 0.87,
      segments: [{ start: 1.2, end: 4.8, text: "A complete thought." }],
    });
  });

  it("отклоняет повреждённые сегменты", () => {
    expect(() =>
      parseTranscription({
        language: "ru",
        segments: [{ start: "1", end: 4, text: "Ошибка" }],
      }),
    ).toThrow("Invalid transcription segment");
    expect(() => parseTranscription({ segments: null })).toThrow(
      "Invalid transcription",
    );
  });
});
