import { describe, expect, it } from "vitest";
import { MAX_FRAGMENT_SECONDS, selectFragment } from "../src/selection";

const segment = (start: number, end: number, text: string) => ({ start, end, text });

describe("автоматический выбор фрагмента", () => {
  it("сохраняет короткое видео целиком", () => {
    expect(selectFragment(12, [segment(0, 4, "Короткая мысль.")], "ru")).toEqual({
      startSeconds: 0,
      endSeconds: 12,
      confidence: 0.9,
      strategy: "full_source",
      detectedLanguage: "ru",
    });
  });

  it("использует безопасный фрагмент при отсутствии речи", () => {
    const result = selectFragment(120, []);
    expect(result).toMatchObject({
      startSeconds: 0,
      endSeconds: 30,
      strategy: "no_speech",
      detectedLanguage: null,
    });
  });

  it("выбирает законченную информативную мысль вместо рекламы", () => {
    const result = selectFragment(
      150,
      [
        segment(0, 8, "Подписывайтесь и используйте промокод на скидку."),
        segment(12, 20, "Сегодня разберём три причины, почему это работает."),
        segment(20.5, 29, "Первая причина показывает главную ошибку новичков."),
        segment(29.5, 38, "Теперь вы знаете, как применить это на практике."),
        segment(60, 70, "Совершенно другая часть разговора без завершения"),
      ],
      "ru",
    );

    expect(result.startSeconds).toBeCloseTo(11.85);
    expect(result.endSeconds).toBeCloseTo(38.25);
    expect(result.strategy).toBe("speech");
    expect(result.detectedLanguage).toBe("ru");
    expect(result.confidence).toBeGreaterThanOrEqual(0.45);
  });

  it("не обрезает фрагмент дольше 30 секунд и отмечает низкую уверенность", () => {
    const result = selectFragment(
      100,
      [segment(10, 50, "Очень длинная незавершённая мысль без конца")],
      "ru",
    );

    expect(result.endSeconds - result.startSeconds).toBeLessThanOrEqual(
      MAX_FRAGMENT_SECONDS,
    );
    expect(result.strategy).toBe("safe_speech");
    expect(result.confidence).toBeLessThan(0.45);
  });

  it("игнорирует повреждённые временные метки", () => {
    const result = selectFragment(
      80,
      [
        segment(Number.NaN, 4, "Не учитываем."),
        segment(9, 5, "Обратный порядок."),
        segment(5, 12, "Это законченный ответ."),
      ],
      "en",
    );
    expect(result.startSeconds).toBeCloseTo(4.85);
    expect(result.endSeconds).toBeCloseTo(12.25);
  });
});
