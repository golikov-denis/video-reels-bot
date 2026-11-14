import { readJsonBody, uploadErrorResponse } from "@/lib/http";
import { prepareUpload } from "@/lib/uploads";
import { UploadError } from "@/lib/upload-validation";

export async function POST(
  request: Request,
  context: RouteContext<"/api/uploads/[token]/prepare">,
) {
  try {
    const { token } = await context.params;
    const body = await readJsonBody(request);
    const result = await prepareUpload(token, body);
    return Response.json(
      { ok: true, ...result },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof UploadError) return uploadErrorResponse(error);
    console.error("Upload preparation failed");
    return Response.json(
      { ok: false, error: "Не удалось подготовить загрузку. Попробуйте ещё раз." },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
