import { eq } from "drizzle-orm";
import { withDatabase } from "@/db";
import { telegramUpdates, uploadSessions, users } from "@/db/schema";
import { getStartDetails, type TelegramUpdate } from "./telegram";
import { createUploadToken, hashUploadToken } from "./upload-validation";

const SESSION_TTL_MS = 30 * 60 * 1000;

export type TelegramUpdateAction =
  | { kind: "duplicate" }
  | { kind: "ignored" }
  | { kind: "start"; chatId: number; token: string };

export async function registerTelegramUpdate(
  update: TelegramUpdate,
): Promise<TelegramUpdateAction> {
  const start = getStartDetails(update);
  const token = start ? createUploadToken() : null;

  return withDatabase((database) =>
    database.transaction(async (transaction) => {
      const inserted = await transaction
        .insert(telegramUpdates)
        .values({ updateId: BigInt(update.update_id) })
        .onConflictDoNothing()
        .returning({ updateId: telegramUpdates.updateId });

      if (inserted.length === 0) return { kind: "duplicate" };
      if (!start || !token) return { kind: "ignored" };

      const [user] = await transaction
        .insert(users)
        .values({
          telegramUserId: BigInt(start.userId),
          telegramChatId: BigInt(start.chatId),
        })
        .onConflictDoUpdate({
          target: users.telegramUserId,
          set: {
            telegramChatId: BigInt(start.chatId),
            updatedAt: new Date(),
          },
        })
        .returning({ id: users.id });

      if (!user) throw new Error("User creation failed");

      await transaction.insert(uploadSessions).values({
        userId: user.id,
        tokenHash: hashUploadToken(token),
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      });

      return { kind: "start", chatId: start.chatId, token };
    }),
  );
}

export async function releaseTelegramUpdate(updateId: number): Promise<void> {
  await withDatabase(async (database) => {
    await database
      .delete(telegramUpdates)
      .where(eq(telegramUpdates.updateId, BigInt(updateId)));
  });
}
