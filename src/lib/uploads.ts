import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { withDatabase } from "@/db";
import { jobs, uploadSessions, users } from "@/db/schema";
import { createUploadUrl, inspectUpload } from "./storage";
import {
  hashUploadToken,
  isUploadToken,
  parseRenderConfiguration,
  parseUploadMetadata,
  requireUploadToken,
  UploadError,
  type BannerMetadata,
  type UploadMetadata,
} from "./upload-validation";

type UploadSession = typeof uploadSessions.$inferSelect;

export type UploadSessionState =
  | { status: "invalid" | "expired" | "unavailable" }
  | { status: "ready"; expiresAt: string }
  | { status: "completed"; jobId: string };

function assertActiveSession(session: UploadSession | undefined): UploadSession {
  if (!session) {
    throw new UploadError(404, "Ссылка недействительна. Получите новую через /start в боте.");
  }
  if (session.status === "completed") {
    throw new UploadError(409, "Эта ссылка уже использована. Задача создана.");
  }
  if (session.expiresAt.getTime() <= Date.now()) {
    throw new UploadError(410, "Срок действия ссылки истёк. Получите новую через /start в боте.");
  }
  return session;
}

function assertUploadMetadata(session: UploadSession): UploadMetadata {
  if (
    session.status !== "uploading" ||
    !session.objectKey ||
    !session.originalFileName ||
    session.fileSize === null ||
    !session.contentType
  ) {
    throw new UploadError(409, "Сначала подготовьте загрузку файла.");
  }

  return {
    fileName: session.originalFileName,
    size: session.fileSize,
    contentType: session.contentType,
  };
}

function bannerMetadata(session: UploadSession): BannerMetadata | null {
  if (!session.bannerObjectKey) return null;
  if (session.bannerFileSize === null || !session.bannerContentType) {
    throw new UploadError(409, "Данные баннера не сохранены. Подготовьте загрузку ещё раз.");
  }
  return {
    fileName: "banner",
    size: session.bannerFileSize,
    contentType: session.bannerContentType as "image/png" | "image/jpeg",
  };
}

export async function getUploadSessionState(
  token: string,
): Promise<UploadSessionState> {
  if (!isUploadToken(token)) return { status: "invalid" };

  try {
    return await withDatabase(async (database) => {
      const [row] = await database
        .select({ session: uploadSessions, jobId: jobs.id })
        .from(uploadSessions)
        .leftJoin(jobs, eq(jobs.uploadSessionId, uploadSessions.id))
        .where(eq(uploadSessions.tokenHash, hashUploadToken(token)))
        .limit(1);

      if (!row) return { status: "invalid" };
      if (row.session.status === "completed" && row.jobId) {
        return { status: "completed", jobId: row.jobId };
      }
      if (row.session.expiresAt.getTime() <= Date.now()) {
        return { status: "expired" };
      }
      return {
        status: "ready",
        expiresAt: row.session.expiresAt.toISOString(),
      };
    });
  } catch {
    return { status: "unavailable" };
  }
}

export async function prepareUpload(
  token: string,
  input: unknown,
): Promise<{ uploadUrl: string; bannerUploadUrl: string | null; expiresIn: number }> {
  requireUploadToken(token);
  const metadata = parseUploadMetadata(input);
  const configuration = parseRenderConfiguration(input);

  const prepared = await withDatabase((database) =>
    database.transaction(async (transaction) => {
      const [row] = await transaction
        .select()
        .from(uploadSessions)
        .where(eq(uploadSessions.tokenHash, hashUploadToken(token)))
        .limit(1)
        .for("update");
      const session = assertActiveSession(row);
      const objectKey = `uploads/${session.id}/${randomUUID()}`;
      const bannerObjectKey = configuration.banner
        ? `banners/${session.id}/${randomUUID()}`
        : null;

      await transaction
        .update(uploadSessions)
        .set({
          status: "uploading",
          objectKey,
          originalFileName: metadata.fileName,
          fileSize: metadata.size,
          contentType: metadata.contentType,
          subtitleMode: configuration.options.subtitleMode,
          subtitleStyle: configuration.options.subtitleStyle,
          translationDirection: configuration.options.translationDirection,
          bannerPosition: configuration.options.bannerPosition,
          bannerScale: configuration.options.bannerScale,
          bannerObjectKey,
          bannerFileSize: configuration.banner?.size ?? null,
          bannerContentType: configuration.banner?.contentType ?? null,
          updatedAt: new Date(),
        })
        .where(eq(uploadSessions.id, session.id));

      return { objectKey, bannerObjectKey };
    }),
  );

  const uploadUrl = await createUploadUrl(prepared.objectKey, metadata.contentType);
  const bannerUploadUrl = prepared.bannerObjectKey && configuration.banner
    ? await createUploadUrl(prepared.bannerObjectKey, configuration.banner.contentType)
    : null;
  return { uploadUrl, bannerUploadUrl, expiresIn: 600 };
}

function isMissingObjectError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as {
    name?: string;
    $metadata?: { httpStatusCode?: number };
  };
  return (
    candidate.name === "NoSuchKey" ||
    candidate.name === "NotFound" ||
    candidate.$metadata?.httpStatusCode === 404
  );
}

async function inspectRequiredUpload(objectKey: string, publicMessage: string) {
  try {
    return await inspectUpload(objectKey);
  } catch (error) {
    if (isMissingObjectError(error)) throw new UploadError(409, publicMessage);
    throw error;
  }
}

export async function completeUpload(token: string): Promise<{
  jobId: string;
  chatId: bigint;
  created: boolean;
}> {
  requireUploadToken(token);
  const tokenHash = hashUploadToken(token);

  const initial = await withDatabase(async (database) => {
    const [row] = await database
      .select({
        session: uploadSessions,
        chatId: users.telegramChatId,
        jobId: jobs.id,
      })
      .from(uploadSessions)
      .innerJoin(users, eq(users.id, uploadSessions.userId))
      .leftJoin(jobs, eq(jobs.uploadSessionId, uploadSessions.id))
      .where(eq(uploadSessions.tokenHash, tokenHash))
      .limit(1);

    if (!row) assertActiveSession(undefined);
    if (row.session.status === "completed") {
      if (!row.jobId) throw new Error("Completed upload has no job");
      return { completed: true as const, jobId: row.jobId, chatId: row.chatId };
    }

    const session = assertActiveSession(row.session);
    const metadata = assertUploadMetadata(session);
    return {
      completed: false as const,
      session,
      metadata,
      chatId: row.chatId,
    };
  });

  if (initial.completed) {
    return { jobId: initial.jobId, chatId: initial.chatId, created: false };
  }

  const storedFile = await inspectRequiredUpload(
    initial.session.objectKey ?? "",
    "Файл ещё не загружен. Повторите загрузку.",
  );
  if (storedFile.size !== initial.metadata.size) {
    throw new UploadError(400, "Размер загруженного файла не совпадает с выбранным.");
  }
  if (storedFile.contentType !== initial.metadata.contentType) {
    throw new UploadError(400, "Тип загруженного файла не совпадает с выбранным.");
  }

  const expectedBanner = bannerMetadata(initial.session);
  if (initial.session.bannerObjectKey && expectedBanner) {
    const storedBanner = await inspectRequiredUpload(
      initial.session.bannerObjectKey,
      "Баннер ещё не загружен. Повторите загрузку.",
    );
    if (storedBanner.size !== expectedBanner.size) {
      throw new UploadError(400, "Размер загруженного баннера не совпадает с выбранным.");
    }
    if (storedBanner.contentType !== expectedBanner.contentType) {
      throw new UploadError(400, "Тип загруженного баннера не совпадает с выбранным.");
    }
  }

  return withDatabase((database) =>
    database.transaction(async (transaction) => {
      const [row] = await transaction
        .select()
        .from(uploadSessions)
        .where(eq(uploadSessions.tokenHash, tokenHash))
        .limit(1)
        .for("update");

      if (row?.status === "completed") {
        const [existingJob] = await transaction
          .select({ id: jobs.id })
          .from(jobs)
          .where(eq(jobs.uploadSessionId, row.id))
          .limit(1);
        if (!existingJob) throw new Error("Completed upload has no job");
        return { jobId: existingJob.id, chatId: initial.chatId, created: false };
      }

      const session = assertActiveSession(row);
      if (
        session.objectKey !== initial.session.objectKey ||
        session.fileSize !== initial.metadata.size ||
        session.contentType !== initial.metadata.contentType ||
        session.bannerObjectKey !== initial.session.bannerObjectKey
      ) {
        throw new UploadError(409, "Загрузка изменилась. Начните ещё раз.");
      }

      const [job] = await transaction
        .insert(jobs)
        .values({
          userId: session.userId,
          uploadSessionId: session.id,
          sourceObjectKey: session.objectKey ?? "",
          originalFileName: session.originalFileName ?? initial.metadata.fileName,
          sourceSize: session.fileSize ?? initial.metadata.size,
          sourceContentType: session.contentType ?? initial.metadata.contentType,
          subtitleMode: session.subtitleMode,
          subtitleStyle: session.subtitleStyle,
          translationDirection: session.translationDirection,
          bannerPosition: session.bannerPosition,
          bannerScale: session.bannerScale,
          bannerObjectKey: session.bannerObjectKey,
          status: "queued",
        })
        .returning({ id: jobs.id });

      if (!job) throw new Error("Job creation failed");

      await transaction
        .update(uploadSessions)
        .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
        .where(eq(uploadSessions.id, session.id));

      return { jobId: job.id, chatId: initial.chatId, created: true };
    }),
  );
}
