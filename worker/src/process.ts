import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSourceUrl, uploadResult } from "../../src/lib/storage";
import { deliverCallback } from "./callback";
import {
  claimJob,
  createLeaseOwner,
  heartbeatJob,
  MAX_ATTEMPTS,
  releaseJobForRetry,
  type ClaimedJob,
} from "./jobs";
import { MediaError, renderVerticalVideo } from "./media";
import { selectSourceFragment } from "./transcription";

const scheduledJobs = new Set<string>();
const pendingJobs: string[] = [];
let running = false;
const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function startHeartbeat(claim: ClaimedJob): () => void {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    void heartbeatJob(claim.job.id, claim.owner)
      .catch(() => console.error("Job heartbeat failed"))
      .finally(() => {
        running = false;
      });
  }, 30_000);
  return () => clearInterval(timer);
}

async function renderClaim(claim: ClaimedJob) {
  const directory = await mkdtemp(join(tmpdir(), "video-reels-"));
  try {
    const sourceUrl = await createSourceUrl(claim.job.sourceObjectKey);
    const outputPath = join(directory, "reel.mp4");
    const { sourceDurationSeconds, selection } =
      await selectSourceFragment(sourceUrl);
    const rendered = await renderVerticalVideo(sourceUrl, outputPath, {
      selection,
    });
    const resultObjectKey = `results/${claim.job.id}/reel.mp4`;
    const resultSize = await uploadResult(resultObjectKey, outputPath);
    return {
      resultObjectKey,
      resultSize,
      resultContentType: "video/mp4" as const,
      durationSeconds: rendered.durationSeconds,
      sourceDurationSeconds,
      selectionStartSeconds: selection.startSeconds,
      selectionEndSeconds: selection.endSeconds,
      selectionConfidence: selection.confidence,
      selectionStrategy: selection.strategy,
      detectedLanguage: selection.detectedLanguage,
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function runJob(jobId: string): Promise<void> {
  const owner = createLeaseOwner();

  for (;;) {
    const claim = await claimJob(jobId, owner);
    if (!claim) return;
    const stopHeartbeat = startHeartbeat(claim);

    try {
      const result = await renderClaim(claim);
      await deliverCallback({ jobId, status: "completed", ...result });
      return;
    } catch (error) {
      const mediaError = error instanceof MediaError ? error : null;
      const canRetry =
        claim.job.attempts < MAX_ATTEMPTS && mediaError?.retryable !== false;

      if (canRetry) {
        await releaseJobForRetry(jobId, owner);
        stopHeartbeat();
        await delay(1000);
        continue;
      }

      await deliverCallback({
        jobId,
        status: "failed",
        errorCode: mediaError?.code ?? "processing_failed",
      });
      return;
    } finally {
      stopHeartbeat();
    }
  }
}

async function drainQueue(): Promise<void> {
  if (running) return;
  running = true;
  try {
    for (let jobId = pendingJobs.shift(); jobId; jobId = pendingJobs.shift()) {
      try {
        await runJob(jobId);
      } catch {
        console.error("Job processing failed");
      } finally {
        scheduledJobs.delete(jobId);
      }
    }
  } finally {
    running = false;
  }
}

export function startJob(jobId: string): boolean {
  if (scheduledJobs.has(jobId)) return false;
  scheduledJobs.add(jobId);
  pendingJobs.push(jobId);
  void drainQueue();
  return true;
}
