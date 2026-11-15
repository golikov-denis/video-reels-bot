import { eq } from "drizzle-orm";
import { withDatabase } from "@/db";
import { jobs, users } from "@/db/schema";
import { readTelegramConfig, readWorkerSharedSecret } from "./config";
import { createDownloadUrl } from "./storage";
import {
  sendProcessingFailedMessage,
  sendResultVideo,
} from "./telegram";
import { workerSignatureMatches } from "./worker-auth";

const MAX_CALLBACK_BYTES = 16_384;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FAILURE_CODES = new Set(["invalid_video", "too_long", "processing_failed"]);

export type WorkerCallbackPayload =
  | {
      jobId: string;
      status: "completed";
      resultObjectKey: string;
      resultSize: number;
      resultContentType: "video/mp4";
      durationSeconds: number;
      sourceDurationSeconds?: number | undefined;
      selectionStartSeconds?: number | undefined;
      selectionEndSeconds?: number | undefined;
      selectionConfidence?: number | undefined;
      selectionStrategy?:
        | "full_source"
        | "speech"
        | "safe_speech"
        | "no_speech"
        | undefined;
      detectedLanguage?: string | null | undefined;
    }
  | {
      jobId: string;
      status: "failed";
      errorCode: "invalid_video" | "too_long" | "processing_failed";
    };

export class WorkerCallbackError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseWorkerCallbackPayload(value: unknown): WorkerCallbackPayload {
  if (!isRecord(value) || typeof value.jobId !== "string") {
    throw new WorkerCallbackError(400, "Invalid callback payload");
  }
  if (!UUID_PATTERN.test(value.jobId)) {
    throw new WorkerCallbackError(400, "Invalid job ID");
  }

  if (value.status === "failed") {
    if (typeof value.errorCode !== "string" || !FAILURE_CODES.has(value.errorCode)) {
      throw new WorkerCallbackError(400, "Invalid failure code");
    }
    return {
      jobId: value.jobId,
      status: "failed",
      errorCode: value.errorCode as "invalid_video" | "too_long" | "processing_failed",
    };
  }

  if (
    value.status !== "completed" ||
    value.resultObjectKey !== `results/${value.jobId}/reel.mp4` ||
    !Number.isSafeInteger(value.resultSize) ||
    (value.resultSize as number) <= 0 ||
    (value.resultSize as number) > 200 * 1024 * 1024 ||
    value.resultContentType !== "video/mp4" ||
    !Number.isInteger(value.durationSeconds) ||
    (value.durationSeconds as number) < 1 ||
    (value.durationSeconds as number) > 30
  ) {
    throw new WorkerCallbackError(400, "Invalid result payload");
  }

  const result = {
    jobId: value.jobId,
    status: "completed" as const,
    resultObjectKey: value.resultObjectKey,
    resultSize: value.resultSize as number,
    resultContentType: "video/mp4" as const,
    durationSeconds: value.durationSeconds as number,
  };
  const selectionKeys = [
    "sourceDurationSeconds",
    "selectionStartSeconds",
    "selectionEndSeconds",
    "selectionConfidence",
    "selectionStrategy",
    "detectedLanguage",
  ];
  if (!selectionKeys.some((key) => value[key] !== undefined)) return result;

  const numericFields = [
    value.sourceDurationSeconds,
    value.selectionStartSeconds,
    value.selectionEndSeconds,
    value.selectionConfidence,
  ];
  const languageIsValid =
    value.detectedLanguage === undefined ||
    value.detectedLanguage === null ||
    (typeof value.detectedLanguage === "string" &&
      value.detectedLanguage.trim().length > 0 &&
      value.detectedLanguage.length <= 16);
  if (
    numericFields.some(
      (field) => typeof field !== "number" || !Number.isFinite(field),
    ) ||
    (value.sourceDurationSeconds as number) <= 0 ||
    (value.sourceDurationSeconds as number) > 3600 ||
    (value.selectionStartSeconds as number) < 0 ||
    (value.selectionEndSeconds as number) <=
      (value.selectionStartSeconds as number) ||
    (value.selectionEndSeconds as number) -
      (value.selectionStartSeconds as number) >
      30 ||
    (value.selectionEndSeconds as number) >
      (value.sourceDurationSeconds as number) + 0.25 ||
    (value.selectionConfidence as number) < 0 ||
    (value.selectionConfidence as number) > 1 ||
    typeof value.selectionStrategy !== "string" ||
    !["full_source", "speech", "safe_speech", "no_speech"].includes(
      value.selectionStrategy,
    ) ||
    !languageIsValid
  ) {
    throw new WorkerCallbackError(400, "Invalid selection metadata");
  }

  return {
    ...result,
    sourceDurationSeconds: value.sourceDurationSeconds as number,
    selectionStartSeconds: value.selectionStartSeconds as number,
    selectionEndSeconds: value.selectionEndSeconds as number,
    selectionConfidence: value.selectionConfidence as number,
    selectionStrategy: value.selectionStrategy as
      | "full_source"
      | "speech"
      | "safe_speech"
      | "no_speech",
    detectedLanguage: (value.detectedLanguage ?? null) as string | null,
  };
}

export async function readWorkerCallback(
  request: Request,
  now = Date.now(),
): Promise<WorkerCallbackPayload> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new WorkerCallbackError(415, "Expected JSON");
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_CALLBACK_BYTES) {
    throw new WorkerCallbackError(413, "Callback is too large");
  }
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_CALLBACK_BYTES) {
    throw new WorkerCallbackError(413, "Callback is too large");
  }

  if (
    !workerSignatureMatches(
      rawBody,
      readWorkerSharedSecret(),
      request.headers.get("x-worker-timestamp"),
      request.headers.get("x-worker-signature"),
      now,
    )
  ) {
    throw new WorkerCallbackError(401, "Invalid callback signature");
  }

  try {
    return parseWorkerCallbackPayload(JSON.parse(rawBody) as unknown);
  } catch (error) {
    if (error instanceof WorkerCallbackError) throw error;
    throw new WorkerCallbackError(400, "Invalid JSON");
  }
}

export async function processWorkerCallback(
  payload: WorkerCallbackPayload,
  fetchImpl: typeof fetch = fetch,
): Promise<{ duplicate: boolean }> {
  const notification = await withDatabase((database) =>
    database.transaction(async (transaction) => {
      const [row] = await transaction
        .select({ job: jobs, chatId: users.telegramChatId })
        .from(jobs)
        .innerJoin(users, eq(users.id, jobs.userId))
        .where(eq(jobs.id, payload.jobId))
        .limit(1)
        .for("update");

      if (!row) throw new WorkerCallbackError(404, "Job not found");
      if (row.job.notificationSentAt) return { duplicate: true as const };

      const now = new Date();
      if (payload.status === "completed") {
        if (!["queued", "processing", "completed"].includes(row.job.status)) {
          throw new WorkerCallbackError(409, "Job cannot be completed");
        }
        await transaction
          .update(jobs)
          .set({
            status: "completed",
            resultObjectKey: payload.resultObjectKey,
            resultSize: payload.resultSize,
            resultContentType: payload.resultContentType,
            durationSeconds: payload.durationSeconds,
            sourceDurationSeconds: payload.sourceDurationSeconds ?? null,
            selectionStartSeconds: payload.selectionStartSeconds ?? null,
            selectionEndSeconds: payload.selectionEndSeconds ?? null,
            selectionConfidence: payload.selectionConfidence ?? null,
            selectionStrategy: payload.selectionStrategy ?? null,
            detectedLanguage: payload.detectedLanguage ?? null,
            errorCode: null,
            leaseOwner: null,
            leaseExpiresAt: null,
            finishedAt: now,
            updatedAt: now,
          })
          .where(eq(jobs.id, payload.jobId));
      } else {
        if (!["queued", "processing", "failed"].includes(row.job.status)) {
          throw new WorkerCallbackError(409, "Job cannot be failed");
        }
        await transaction
          .update(jobs)
          .set({
            status: "failed",
            errorCode: payload.errorCode,
            leaseOwner: null,
            leaseExpiresAt: null,
            finishedAt: now,
            updatedAt: now,
          })
          .where(eq(jobs.id, payload.jobId));
      }

      return { duplicate: false as const, chatId: row.chatId };
    }),
  );

  if (notification.duplicate) return { duplicate: true };

  const config = readTelegramConfig();
  if (payload.status === "completed") {
    const downloadUrl = await createDownloadUrl(payload.resultObjectKey);
    await sendResultVideo(config, notification.chatId, downloadUrl, fetchImpl);
  } else {
    await sendProcessingFailedMessage(config, notification.chatId, fetchImpl);
  }

  await withDatabase(async (database) => {
    await database
      .update(jobs)
      .set({ notificationSentAt: new Date(), updatedAt: new Date() })
      .where(eq(jobs.id, payload.jobId));
  });
  return { duplicate: false };
}
