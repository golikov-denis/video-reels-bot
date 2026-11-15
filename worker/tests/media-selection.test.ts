import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inspectResult, renderVerticalVideo } from "../src/media";

const ffmpegPath = ffmpegStatic ?? undefined;
const ffprobePath = ffprobeStatic.path;
let directory: string;

beforeAll(async () => {
  await mkdir(join(process.cwd(), "tmp"), { recursive: true });
  directory = await mkdtemp(join(process.cwd(), "tmp", "media-selection-test-"));
});

afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});

function generate(source: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      ffmpegPath ?? "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "testsrc=size=320x240:rate=15",
        "-t",
        "8",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        source,
      ],
      { shell: false },
    );
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error("Fixture failed")),
    );
  });
}

describe("обрезка выбранного фрагмента", () => {
  it("применяет смещение и сохраняет точную длительность", async () => {
    const source = join(directory, "source.mp4");
    const output = join(directory, "selected.mp4");
    await generate(source);

    const result = await renderVerticalVideo(source, output, {
      ffmpegPath,
      ffprobePath,
      selection: {
        startSeconds: 2,
        endSeconds: 4,
        confidence: 0.8,
        strategy: "speech",
        detectedLanguage: "en",
      },
    });

    expect(result.durationSeconds).toBe(2);
    expect(await inspectResult(output, ffprobePath)).toBeCloseTo(2, 1);
  }, 30_000);
});
