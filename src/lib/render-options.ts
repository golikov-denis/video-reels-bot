export const MAX_BANNER_BYTES = 5 * 1024 * 1024;

export type SubtitleMode = "off" | "original" | "translated";
export type SubtitleStyle = "standard" | "karaoke";
export type TranslationDirection = "ru_en" | "en_ru";
export type BannerPosition =
  | "top_left"
  | "top_center"
  | "top_right"
  | "bottom_left"
  | "bottom_center"
  | "bottom_right";

export type RenderOptions = {
  subtitleMode: SubtitleMode;
  subtitleStyle: SubtitleStyle;
  translationDirection: TranslationDirection | null;
  bannerPosition: BannerPosition;
  bannerScale: number;
};

export const DEFAULT_RENDER_OPTIONS: RenderOptions = {
  subtitleMode: "off",
  subtitleStyle: "standard",
  translationDirection: null,
  bannerPosition: "top_right",
  bannerScale: 0.25,
};

const SUBTITLE_MODES = new Set(["off", "original", "translated"]);
const SUBTITLE_STYLES = new Set(["standard", "karaoke"]);
const TRANSLATION_DIRECTIONS = new Set(["ru_en", "en_ru"]);
const BANNER_POSITIONS = new Set([
  "top_left",
  "top_center",
  "top_right",
  "bottom_left",
  "bottom_center",
  "bottom_right",
]);
const BANNER_CONTENT_TYPES = new Set(["image/png", "image/jpeg"]);

export function resolveBannerContentType(
  fileName: string,
  contentType: string,
): string {
  const normalizedType = contentType.trim().toLowerCase().split(";", 1)[0] ?? "";
  if (normalizedType) return normalizedType;
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith(".png")) return "image/png";
  if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  return "";
}

export function isAllowedBannerContentType(contentType: string): boolean {
  return BANNER_CONTENT_TYPES.has(contentType);
}

export function parseRenderOptions(value: unknown): RenderOptions {
  if (value === undefined) return { ...DEFAULT_RENDER_OPTIONS };
  if (typeof value !== "object" || value === null) {
    throw new Error("Invalid render options");
  }

  const input = value as Record<string, unknown>;
  const subtitleMode = input.subtitleMode ?? DEFAULT_RENDER_OPTIONS.subtitleMode;
  const subtitleStyle = input.subtitleStyle ?? DEFAULT_RENDER_OPTIONS.subtitleStyle;
  const translationDirection = input.translationDirection ?? null;
  const bannerPosition = input.bannerPosition ?? DEFAULT_RENDER_OPTIONS.bannerPosition;
  const bannerScale = input.bannerScale ?? DEFAULT_RENDER_OPTIONS.bannerScale;

  if (
    typeof subtitleMode !== "string" ||
    !SUBTITLE_MODES.has(subtitleMode) ||
    typeof subtitleStyle !== "string" ||
    !SUBTITLE_STYLES.has(subtitleStyle) ||
    (translationDirection !== null &&
      (typeof translationDirection !== "string" ||
        !TRANSLATION_DIRECTIONS.has(translationDirection))) ||
    typeof bannerPosition !== "string" ||
    !BANNER_POSITIONS.has(bannerPosition) ||
    typeof bannerScale !== "number" ||
    !Number.isFinite(bannerScale) ||
    bannerScale < 0.1 ||
    bannerScale > 0.5
  ) {
    throw new Error("Invalid render options");
  }

  if (subtitleMode === "translated") {
    if (translationDirection === null || subtitleStyle !== "standard") {
      throw new Error("Invalid translation options");
    }
  } else if (translationDirection !== null) {
    throw new Error("Unexpected translation direction");
  }

  if (subtitleMode === "off" && subtitleStyle !== "standard") {
    throw new Error("Invalid disabled subtitle options");
  }

  return {
    subtitleMode: subtitleMode as SubtitleMode,
    subtitleStyle: subtitleStyle as SubtitleStyle,
    translationDirection: translationDirection as TranslationDirection | null,
    bannerPosition: bannerPosition as BannerPosition,
    bannerScale,
  };
}
