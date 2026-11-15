import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseRenderOptions } from "../../src/lib/render-options";
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
import { createSubtitleFileContent, transcriptForSelection } from "./subtitles";
import { argosTranslationProvider } from "./translation";

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
    const options = parseRenderOptions({
      subtitleMode: claim.job.subtitleMode,
      subtitleStyle: claim.job.subtitleStyle,
      translationDirection: claim.job.translationDirection,
      bannerPosition: claim.job.bannerPosition,
      bannerScale: claim.job.bannerScale,
    });
    const sourceUrl = await createSourceUrl(claim.job.sourceObjectKey);
    const outputPath = join(directory, "reel.mp4");
    const { sourceDurationSeconds, selection, transcription } =
      await selectSourceFragment(sourceUrl, undefined, {
        requireTranscription: options.subtitleMode !== "off",
      });

    let subtitlesPath: string | undefined;
    if (options.subtitleMode !== "off") {
      if (!transcription) throw new MediaError("subtitles_unavailable", false);
      const selectedTranscript = transcriptForSelection(transcription, selection);
      if (selectedTranscript.segments.length === 0) {
        throw new MediaError("subtitles_unavailable", false);
      }
      if (options.subtitleMode === "translated") {
        const sourceLanguage = options.translationDirection?.split("_")[0];
        if (selectedTranscript.language?.toLowerCase() !== sourceLanguage) {
          console.error("Translation language mismatch", {
            expected: sourceLanguage,
            detected: selectedTranscript.language,
          });
          throw new MediaError("translation_language_mismatch", false);
        }
      }
      try {
        const ass = await createSubtitleFileContent(
          selectedTranscript,
          options,
          argosTranslationProvider,
        );
        subtitlesPath = join(directory, "subtitles.ass");
        await writeFile(subtitlesPath, ass, "utf8");
      } catch (error) {
        console.error("Subtitle creation failed", error);
        if (error instanceof MediaError) throw error;
        throw new MediaError(
          options.subtitleMode === "translated"
            ? "translation_failed"
            : "subtitles_unavailable",
          false,
        );
      }
    }

    const rendered = await renderVerticalVideo(sourceUrl, outputPath, {
      selection,
      ...(subtitlesPath !== undefined ? { subtitlesPath } : {}),
      ...(claim.job.bannerObjectKey
        ? {
            banner: {
              source: await createSourceUrl(claim.job.bannerObjectKey),
              position: options.bannerPosition,
              scale: options.bannerScale,
            },
          }
        : {}),
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
      console.error("Job rendering failed", error);
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
