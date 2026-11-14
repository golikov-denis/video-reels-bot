import {
  bigint,
  index,
  integer,
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

export const jobStatus = pgEnum("job_status", [
  "queued",
  "processing",
  "completed",
  "failed",
]);

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

export const jobs = pgTable(
  "jobs",
  {
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
    attempts: integer("attempts").notNull().default(0),
    leaseOwner: varchar("lease_owner", { length: 128 }),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
    durationSeconds: integer("duration_seconds"),
    resultObjectKey: text("result_object_key"),
    resultSize: bigint("result_size", { mode: "number" }),
    resultContentType: text("result_content_type"),
    errorCode: varchar("error_code", { length: 64 }),
    notificationSentAt: timestamp("notification_sent_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("jobs_status_lease_expires_at_idx").on(
      table.status,
      table.leaseExpiresAt,
    ),
  ],
);

export const telegramUpdates = pgTable("telegram_updates", {
  updateId: bigint("update_id", { mode: "bigint" }).primaryKey(),
  processedAt: timestamp("processed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
