import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inspectResult, renderVerticalVideo } from "../src/media";

const ffmpegPath = ffmpegStatic ?? undefined;
const ffprobePath = ffprobeStatic.path;
let directory: string;

function generate(source: string, audio: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc=size=320x240:rate=15",
      ...(audio ? ["-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=44100"] : []),
      "-t",
      "1",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      ...(audio ? ["-c:a", "aac"] : []),
      source,
    ];
    const child = spawn(ffmpegPath ?? "ffmpeg", args, { shell: false });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error("Fixture failed"))));
  });
}

beforeAll(async () => {
  await mkdir(join(process.cwd(), "tmp"), { recursive: true });
  directory = await mkdtemp(join(process.cwd(), "tmp", "media-test-"));
});

afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe("реальный FFmpeg", () => {
  it("создаёт 720×1280 со звуком и сохраняет весь кадр", async () => {
    const source = join(directory, "with-audio.mp4");
    const output = join(directory, "with-audio-result.mp4");
    await generate(source, true);
    const result = await renderVerticalVideo(source, output, { ffmpegPath, ffprobePath });
    expect(result.size).toBeGreaterThan(0);
    expect(result.durationSeconds).toBeLessThanOrEqual(30);
    expect(await inspectResult(output, ffprobePath)).toBeLessThanOrEqual(1.1);
  }, 30_000);

  it("создаёт вертикальный ролик из видео без звуковой дорожки", async () => {
    const source = join(directory, "silent.mp4");
    const output = join(directory, "silent-result.mp4");
    await generate(source, false);
    const result = await renderVerticalVideo(source, output, { ffmpegPath, ffprobePath });
    expect(result.size).toBeGreaterThan(0);
    expect(await inspectResult(output, ffprobePath)).toBeLessThanOrEqual(1.1);
  }, 30_000);

  it("отклоняет повреждённый файл без внутренних деталей FFmpeg", async () => {
    const source = join(directory, "broken.mp4");
    await writeFile(source, "not a video");
    await expect(
      renderVerticalVideo(source, join(directory, "broken-result.mp4"), {
        ffmpegPath,
        ffprobePath,
      }),
    ).rejects.toMatchObject({ code: "invalid_video", retryable: false });
  }, 30_000);
});
