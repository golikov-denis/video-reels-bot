import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { withDatabase } from "../../src/db/index";
import { jobs } from "../../src/db/schema";

export const MAX_ATTEMPTS = 2;
const LEASE_MS = 120_000;

export type Job = typeof jobs.$inferSelect;
export type ClaimedJob = { job: Job; owner: string };

export function createLeaseOwner(): string {
  return `${process.env.RAILWAY_REPLICA_ID ?? "local"}-${randomUUID()}`.slice(0, 128);
}

export function canClaimJob(
  current: Pick<Job, "status" | "attempts" | "leaseExpiresAt">,
  now = new Date(),
): boolean {
  if (current.attempts >= MAX_ATTEMPTS) return false;
  const leaseExpired =
    !current.leaseExpiresAt || current.leaseExpiresAt.getTime() <= now.getTime();
  return (
    current.status === "queued" ||
    (current.status === "processing" && leaseExpired)
  );
}

export async function claimJob(
  jobId: string,
  owner: string,
  now = new Date(),
): Promise<ClaimedJob | null> {
  return withDatabase((database) =>
    database.transaction(async (transaction) => {
      const [current] = await transaction
        .select()
        .from(jobs)
        .where(eq(jobs.id, jobId))
        .limit(1)
        .for("update", { skipLocked: true });
      if (!current || !canClaimJob(current, now)) return null;

      const [job] = await transaction
        .update(jobs)
        .set({
          status: "processing",
          attempts: current.attempts + 1,
          leaseOwner: owner,
          leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
          heartbeatAt: now,
          startedAt: current.startedAt ?? now,
          finishedAt: null,
          errorCode: null,
          updatedAt: now,
        })
        .where(eq(jobs.id, jobId))
        .returning();
      return job ? { job, owner } : null;
    }),
  );
}

export async function heartbeatJob(jobId: string, owner: string): Promise<void> {
  const now = new Date();
  await withDatabase(async (database) => {
    await database
      .update(jobs)
      .set({
        heartbeatAt: now,
        leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
        updatedAt: now,
      })
      .where(
        and(
          eq(jobs.id, jobId),
          eq(jobs.leaseOwner, owner),
          eq(jobs.status, "processing"),
        ),
      );
  });
}

export async function releaseJobForRetry(
  jobId: string,
  owner: string,
): Promise<void> {
  await withDatabase(async (database) => {
    await database
      .update(jobs)
      .set({
        status: "queued",
        leaseOwner: null,
        leaseExpiresAt: null,
        heartbeatAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(jobs.id, jobId), eq(jobs.leaseOwner, owner)));
  });
}
