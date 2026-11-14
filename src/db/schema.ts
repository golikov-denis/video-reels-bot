import {
  bigint,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const uploadSessionStatus = pgEnum("upload_session_status", [
  "pending",
  "uploading",
  "completed",
]);

export const jobStatus = pgEnum("job_status", ["queued"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  telegramUserId: bigint("telegram_user_id", { mode: "bigint" })
    .notNull()
    .unique(),
  telegramChatId: bigint("telegram_chat_id", { mode: "bigint" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const uploadSessions = pgTable(
  "upload_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    status: uploadSessionStatus("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    objectKey: text("object_key"),
    originalFileName: text("original_file_name"),
    fileSize: bigint("file_size", { mode: "number" }),
    contentType: text("content_type"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [index("upload_sessions_expires_at_idx").on(table.expiresAt)],
);

export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  uploadSessionId: uuid("upload_session_id")
    .notNull()
    .unique()
    .references(() => uploadSessions.id, { onDelete: "restrict" }),
  sourceObjectKey: text("source_object_key").notNull(),
  originalFileName: text("original_file_name").notNull(),
  sourceSize: bigint("source_size", { mode: "number" }).notNull(),
  sourceContentType: text("source_content_type").notNull(),
  status: jobStatus("status").notNull().default("queued"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const telegramUpdates = pgTable("telegram_updates", {
  updateId: bigint("update_id", { mode: "bigint" }).primaryKey(),
  processedAt: timestamp("processed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
