export const MAX_FILE_BYTES = 2_147_483_648;

export const ALLOWED_CONTENT_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/x-matroska",
  "video/webm",
]);

const EXTENSION_CONTENT_TYPES: Record<string, string> = {
  ".mkv": "video/x-matroska",
  ".mov": "video/quicktime",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

export function resolveContentType(fileName: string, contentType: string): string {
  const normalizedType = contentType.trim().toLowerCase();
  if (normalizedType) return normalizedType;

  const extension = Object.keys(EXTENSION_CONTENT_TYPES).find((suffix) =>
    fileName.toLowerCase().endsWith(suffix),
  );
  return extension ? EXTENSION_CONTENT_TYPES[extension] : "";
}

export function isAllowedContentType(contentType: string): boolean {
  return ALLOWED_CONTENT_TYPES.has(contentType);
}
