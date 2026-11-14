import { readTelegramConfig } from "@/lib/config";
import { sendUploadCreatedMessage } from "@/lib/telegram";
import { uploadErrorResponse } from "@/lib/http";
import { completeUpload } from "@/lib/uploads";
import { UploadError } from "@/lib/upload-validation";

export async function POST(
  _request: Request,
  context: RouteContext<"/api/uploads/[token]/complete">,
) {
  try {
    const { token } = await context.params;
    const result = await completeUpload(token);

    if (result.created) {
      try {
        await sendUploadCreatedMessage(
          readTelegramConfig(),
          result.chatId,
          result.jobId,
        );
      } catch {
        console.error("Upload notification failed");
      }
    }

    return Response.json(
      { ok: true, jobId: result.jobId },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof UploadError) return uploadErrorResponse(error);
    console.error("Upload completion failed");
    return Response.json(
      { ok: false, error: "Не удалось создать задачу. Попробуйте ещё раз." },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
