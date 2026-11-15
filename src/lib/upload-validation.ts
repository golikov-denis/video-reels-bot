import { createHash, randomBytes } from "node:crypto";
import {
  isAllowedBannerContentType,
  MAX_BANNER_BYTES,
  parseRenderOptions,
  resolveBannerContentType,
  type RenderOptions,
} from "./render-options";
import {
  isAllowedContentType,
  MAX_FILE_BYTES,
  resolveContentType,
} from "./upload-rules";

export class UploadError extends Error {
  constructor(
    public readonly status: number,
    public readonly publicMessage: string,
  ) {
    super(publicMessage);
    this.name = "UploadError";
  }
}

export type UploadMetadata = {
  fileName: string;
  size: number;
  contentType: string;
};

export type BannerMetadata = UploadMetadata & {
  contentType: "image/png" | "image/jpeg";
};

export type RenderConfiguration = {
  options: RenderOptions;
  banner: BannerMetadata | null;
};

export function isUploadToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function createUploadToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashUploadToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function requireUploadToken(token: string): string {
  if (!isUploadToken(token)) {
    throw new UploadError(404, "Ссылка недействительна. Получите новую через /start в боте.");
  }
  return token;
}

function cleanFileName(value: string): string {
  return (value.split(/[\\/]/).pop() ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
}

export function parseUploadMetadata(value: unknown): UploadMetadata {
  if (typeof value !== "object" || value === null) {
    throw new UploadError(400, "Проверьте данные файла и повторите попытку.");
  }

  const input = value as Record<string, unknown>;
  if (
    typeof input.fileName !== "string" ||
    typeof input.size !== "number" ||
    typeof input.contentType !== "string"
  ) {
    throw new UploadError(400, "Проверьте данные файла и повторите попытку.");
  }

  const fileName = cleanFileName(input.fileName);
  if (!fileName || fileName.length > 255 || !Number.isSafeInteger(input.size)) {
    throw new UploadError(400, "Некорректное имя или размер файла.");
  }
  if (input.size <= 0) {
    throw new UploadError(400, "Выбранный файл пуст.");
  }
  if (input.size > MAX_FILE_BYTES) {
    throw new UploadError(413, "Файл больше 2 ГБ. Выберите видео меньшего размера.");
  }

  const contentType = resolveContentType(fileName, input.contentType);
  if (!isAllowedContentType(contentType)) {
    throw new UploadError(415, "Поддерживаются видео MP4, MOV, MKV и WebM.");
  }

  return { fileName, size: input.size, contentType };
}

export function parseBannerMetadata(value: unknown): BannerMetadata {
  if (typeof value !== "object" || value === null) {
    throw new UploadError(400, "Проверьте данные баннера.");
  }
  const input = value as Record<string, unknown>;
  if (
    typeof input.fileName !== "string" ||
    typeof input.size !== "number" ||
    typeof input.contentType !== "string"
  ) {
    throw new UploadError(400, "Проверьте данные баннера.");
  }
  const fileName = cleanFileName(input.fileName);
  if (!fileName || fileName.length > 255 || !Number.isSafeInteger(input.size)) {
    throw new UploadError(400, "Некорректное имя или размер баннера.");
  }
  if (input.size <= 0) throw new UploadError(400, "Выбранный баннер пуст.");
  if (input.size > MAX_BANNER_BYTES) {
    throw new UploadError(413, "Баннер больше 5 МБ. Выберите изображение меньшего размера.");
  }
  const contentType = resolveBannerContentType(fileName, input.contentType);
  if (!isAllowedBannerContentType(contentType)) {
    throw new UploadError(415, "Баннер должен быть изображением PNG или JPG.");
  }
  return {
    fileName,
    size: input.size,
    contentType: contentType as "image/png" | "image/jpeg",
  };
}

export function parseRenderConfiguration(value: unknown): RenderConfiguration {
  if (typeof value !== "object" || value === null) {
    throw new UploadError(400, "Проверьте настройки монтажа.");
  }
  const input = value as Record<string, unknown>;
  let options: RenderOptions;
  try {
    options = parseRenderOptions(input.renderOptions);
  } catch {
    throw new UploadError(
      400,
      "Проверьте настройки субтитров и перевода. Для переведённых субтитров доступен обычный стиль.",
    );
  }
  const banner = input.banner === undefined || input.banner === null
    ? null
    : parseBannerMetadata(input.banner);
  return { options, banner };
}
