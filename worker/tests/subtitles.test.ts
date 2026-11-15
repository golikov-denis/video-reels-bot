import { describe, expect, it, vi } from "vitest";
import { parseRenderOptions } from "../../src/lib/render-options";
import type { FragmentSelection } from "../src/selection";
import {
  createSubtitleCues,
  createSubtitleFileContent,
  generateAss,
  transcriptForSelection,
} from "../src/subtitles";
import type { Transcription } from "../src/transcription";
import type { TranslationProvider } from "../src/translation";

const selection: FragmentSelection = {
  startSeconds: 10,
  endSeconds: 20,
  confidence: 0.9,
  strategy: "speech",
  detectedLanguage: "ru",
};

const transcription: Transcription = {
  language: "ru",
  languageProbability: 0.95,
  segments: [
    { start: 1, end: 3, text: "До фрагмента" },
    {
      start: 10.5,
      end: 14.5,
      text: "Привет, это проверка!",
      words: [
        { start: 10.5, end: 11.1, word: "Привет," },
        { start: 11.2, end: 11.6, word: "это" },
        { start: 11.7, end: 12.8, word: "проверка!" },
      ],
    },
    { start: 19.5, end: 22, text: "После фрагмента" },
  ],
};

describe("субтитры выбранного фрагмента", () => {
  it("обрезает речь по границам и сдвигает время к началу ролика", () => {
    const selected = transcriptForSelection(transcription, selection);
    expect(selected.segments).toHaveLength(1);
    expect(selected.segments[0]).toMatchObject({
      start: 0.5,
      end: 4.5,
      text: "Привет, это проверка!",
    });
    expect(selected.segments[0]?.words?.[0]).toMatchObject({
      start: 0.5,
      word: "Привет,",
    });
    expect(selected.segments[0]?.words?.[0]?.end).toBeCloseTo(1.1, 10);
  });

  it("создаёт ASS с экранированием и не более двух строк", () => {
    const ass = generateAss(
      [
        {
          start: 0,
          end: 2.345,
          lines: ["Привет, {мир}! \\ тест", "вторая строка"],
        },
      ],
      "standard",
    );
    expect(ass).toContain("Dialogue: 0,0:00:00.00,0:00:02.35");
    expect(ass).toContain("Привет, \\{мир\\}! \\\\ тест\\Nвторая строка");
    expect(ass).toContain("DejaVu Sans");
  });

  it("добавляет точные karaoke-тайминги слов", async () => {
    const selected = transcriptForSelection(transcription, selection);
    const ass = await createSubtitleFileContent(
      selected,
      parseRenderOptions({
        subtitleMode: "original",
        subtitleStyle: "karaoke",
        translationDirection: null,
      }),
    );
    expect(ass).toContain("{\\k60}Привет,");
    expect(ass).toContain("{\\k40} это");
    expect(ass).toContain("{\\k110} проверка!");
  });

  it("не имитирует караоке без таймингов слов", async () => {
    await expect(
      createSubtitleFileContent(
        { ...transcription, segments: [{ start: 0, end: 2, text: "Нет слов" }] },
        parseRenderOptions({
          subtitleMode: "original",
          subtitleStyle: "karaoke",
          translationDirection: null,
        }),
      ),
    ).rejects.toThrow("Word timestamps unavailable");
  });

  it("разбивает длинный текст на короткие cues", () => {
    const cues = createSubtitleCues([
      {
        start: 0,
        end: 12,
        text: "Это достаточно длинная фраза с большим количеством слов, которую нужно аккуратно разделить на несколько читаемых субтитров.",
      },
    ]);
    expect(cues.length).toBeGreaterThan(1);
    for (const cue of cues) {
      expect(cue.lines.length).toBeLessThanOrEqual(2);
      expect(cue.lines.every((line) => line.length <= 34)).toBe(true);
      expect(cue.end - cue.start).toBeLessThanOrEqual(5.01);
    }
  });
});

describe("офлайн-перевод субтитров", () => {
  it("переводит только текст выбранных сегментов и убирает karaoke", async () => {
    const translateSegments = vi.fn(async (segments: typeof transcription.segments) =>
      segments.map((segment) => ({
        start: segment.start,
        end: segment.end,
        text: `EN: ${segment.text}`,
      })),
    );
    const translator: TranslationProvider = { translateSegments };
    const selected = transcriptForSelection(transcription, selection);
    const ass = await createSubtitleFileContent(
      selected,
      parseRenderOptions({
        subtitleMode: "translated",
        subtitleStyle: "standard",
        translationDirection: "ru_en",
      }),
      translator,
    );
    expect(translateSegments).toHaveBeenCalledOnce();
    expect(translateSegments.mock.calls[0]?.[0]).toHaveLength(1);
    expect(ass).toContain("EN: Привет, это проверка!");
    expect(ass).not.toContain("{\\k");
  });

  it("не выдаёт оригинал при несовпадении языка", async () => {
    await expect(
      createSubtitleFileContent(
        { ...transcription, language: "en" },
        parseRenderOptions({
          subtitleMode: "translated",
          subtitleStyle: "standard",
          translationDirection: "ru_en",
        }),
        { translateSegments: vi.fn() },
      ),
    ).rejects.toThrow("Translation language mismatch");
  });
});
