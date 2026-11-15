import { describe, expect, it } from "vitest";
import {
  DEFAULT_RENDER_OPTIONS,
  parseRenderOptions,
  resolveBannerContentType,
} from "../src/lib/render-options";
import {
  parseBannerMetadata,
  parseRenderConfiguration,
  UploadError,
} from "../src/lib/upload-validation";

const video = { fileName: "lecture.mp4", size: 1024, contentType: "video/mp4" };

describe("настройки монтажа", () => {
  it("совместима со старыми запросами без новых полей", () => {
    expect(parseRenderConfiguration(video)).toEqual({
      options: DEFAULT_RENDER_OPTIONS,
      banner: null,
    });
  });

  it("принимает перевод и независимые настройки баннера", () => {
    expect(
      parseRenderConfiguration({
        ...video,
        renderOptions: {
          subtitleMode: "translated",
          subtitleStyle: "standard",
          translationDirection: "ru_en",
          bannerPosition: "bottom_left",
          bannerScale: 0.35,
        },
        banner: { fileName: "logo.PNG", size: 2048, contentType: "" },
      }),
    ).toEqual({
      options: {
        subtitleMode: "translated",
        subtitleStyle: "standard",
        translationDirection: "ru_en",
        bannerPosition: "bottom_left",
        bannerScale: 0.35,
      },
      banner: { fileName: "logo.PNG", size: 2048, contentType: "image/png" },
    });
  });

  it.each([
    {
      subtitleMode: "translated",
      subtitleStyle: "karaoke",
      translationDirection: "ru_en",
    },
    {
      subtitleMode: "translated",
      subtitleStyle: "standard",
      translationDirection: null,
    },
    {
      subtitleMode: "original",
      subtitleStyle: "standard",
      translationDirection: "ru_en",
    },
    {
      subtitleMode: "off",
      subtitleStyle: "karaoke",
      translationDirection: null,
    },
    {
      subtitleMode: "off",
      subtitleStyle: "standard",
      translationDirection: null,
      bannerScale: 0.8,
    },
  ])("отклоняет противоречивые настройки %#", (renderOptions) => {
    expect(() => parseRenderOptions(renderOptions)).toThrow();
  });

  it("проверяет размер и MIME баннера на сервере", () => {
    expect(resolveBannerContentType("photo.jpeg", "")).toBe("image/jpeg");
    expect(
      parseBannerMetadata({ fileName: "logo.jpg", size: 10, contentType: "image/jpeg" }),
    ).toEqual({ fileName: "logo.jpg", size: 10, contentType: "image/jpeg" });
    for (const banner of [
      { fileName: "logo.gif", size: 10, contentType: "image/gif" },
      { fileName: "logo.png", size: 5 * 1024 * 1024 + 1, contentType: "image/png" },
      { fileName: "logo.png", size: 0, contentType: "image/png" },
    ]) {
      try {
        parseBannerMetadata(banner);
        throw new Error("Expected banner validation to fail");
      } catch (error) {
        expect(error).toBeInstanceOf(UploadError);
      }
    }
  });
});
