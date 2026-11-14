import { UploadError } from "./upload-validation";

const MAX_JSON_BYTES = 16_384;

export async function readJsonBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new UploadError(415, "Ожидались данные в формате JSON.");
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_JSON_BYTES) {
    throw new UploadError(413, "Слишком большой запрос.");
  }

  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_JSON_BYTES) {
    throw new UploadError(413, "Слишком большой запрос.");
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new UploadError(400, "Некорректный запрос.");
  }
}

export function uploadErrorResponse(error: UploadError): Response {
  return Response.json(
    { ok: false, error: error.publicMessage },
    { status: error.status, headers: { "cache-control": "no-store" } },
  );
}
