import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";

export const MAX_SOURCE_DURATION_SECONDS = 3600;
export const MAX_RESULT_DURATION_SECONDS = 30;

const VERTICAL_FILTER = [
  "[0:v:0]split=2[bg][fg]",
  "[bg]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,gblur=sigma=30[background]",
  "[fg]scale=720:1280:force_original_aspect_ratio=decrease[foreground]",
  "[background][foreground]overlay=(W-w)/2:(H-h)/2:shortest=1,fps=30,setsar=1,format=yuv420p[v]",
].join(";");

export class MediaError extends Error {
  constructor(
    public readonly code: "invalid_video" | "too_long" | "processing_failed",
    public readonly retryable: boolean,
  ) {
    super(code);
  }
}

type CommandResult = { stdout: string };

function runCommand(
  executable: string,
  args: string[],
  timeoutMs: number,
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new MediaError("processing_failed", true));
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      if (stdout.length < 1_000_000) stdout += chunk;
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      if (stderr.length < 64_000) stderr += chunk;
    });
    child.on("error", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new MediaError("processing_failed", true));
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) resolve({ stdout });
      else reject(new MediaError("invalid_video", false));
    });
  });
}

type ProbeData = {
  format?: { duration?: string };
  streams?: Array<{ codec_type?: string; duration?: string; width?: number; height?: number }>;
};

async function probe(source: string, executable: string): Promise<ProbeData> {
  const result = await runCommand(
    executable,
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration:stream=codec_type,duration,width,height",
      "-of",
      "json",
      source,
    ],
    30_000,
  );
  try {
    return JSON.parse(result.stdout) as ProbeData;
  } catch {
    throw new MediaError("invalid_video", false);
  }
}

export async function inspectSource(
  source: string,
  ffprobePath = process.env.FFPROBE_PATH || "ffprobe",
): Promise<number> {
  const data = await probe(source, ffprobePath);
  const video = data.streams?.find((stream) => stream.codec_type === "video");
  const duration = Number(data.format?.duration ?? video?.duration);
  if (!video || !Number.isFinite(duration) || duration <= 0) {
    throw new MediaError("invalid_video", false);
  }
  if (duration > MAX_SOURCE_DURATION_SECONDS) {
    throw new MediaError("too_long", false);
  }
  return duration;
}

export async function inspectResult(
  source: string,
  ffprobePath = process.env.FFPROBE_PATH || "ffprobe",
): Promise<number> {
  const data = await probe(source, ffprobePath);
  const video = data.streams?.find((stream) => stream.codec_type === "video");
  const duration = Number(data.format?.duration ?? video?.duration);
  if (
    video?.width !== 720 ||
    video.height !== 1280 ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > MAX_RESULT_DURATION_SECONDS + 0.1
  ) {
    throw new MediaError("processing_failed", false);
  }
  return duration;
}

export async function renderVerticalVideo(
  source: string,
  outputPath: string,
  options: { ffmpegPath?: string; ffprobePath?: string } = {},
): Promise<{ size: number; durationSeconds: number }> {
  const ffmpegPath = options.ffmpegPath ?? process.env.FFMPEG_PATH ?? "ffmpeg";
  const ffprobePath = options.ffprobePath ?? process.env.FFPROBE_PATH ?? "ffprobe";
  await inspectSource(source, ffprobePath);

  const remoteOptions = /^https?:\/\//.test(source)
    ? ["-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_delay_max", "5"]
    : [];

  await runCommand(
    ffmpegPath,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostdin",
      ...remoteOptions,
      "-i",
      source,
      "-filter_complex",
      VERTICAL_FILTER,
      "-map",
      "[v]",
      "-map",
      "0:a:0?",
      "-t",
      String(MAX_RESULT_DURATION_SECONDS),
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "28",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-max_muxing_queue_size",
      "1024",
      "-movflags",
      "+faststart",
      outputPath,
    ],
    5 * 60 * 1000,
  );

  const duration = await inspectResult(outputPath, ffprobePath);
  const file = await stat(outputPath);
  if (file.size <= 0) throw new MediaError("processing_failed", false);
  return {
    size: file.size,
    durationSeconds: Math.max(1, Math.round(duration)),
  };
}
