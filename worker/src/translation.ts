import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { TranslationDirection } from "../../src/lib/render-options";
import type { TranscriptSegment } from "./selection";

export interface TranslationProvider {
  translateSegments(
    segments: TranscriptSegment[],
    direction: TranslationDirection,
  ): Promise<TranscriptSegment[]>;
}

function parseTranslations(value: unknown, expectedLength: number): string[] {
  if (typeof value !== "object" || value === null) {
    throw new Error("Invalid translation response");
  }
  const texts = (value as Record<string, unknown>).texts;
  if (
    !Array.isArray(texts) ||
    texts.length !== expectedLength ||
    texts.some((text) => typeof text !== "string")
  ) {
    throw new Error("Invalid translation response");
  }
  return texts as string[];
}

async function runArgos(
  segments: TranscriptSegment[],
  direction: TranslationDirection,
): Promise<TranscriptSegment[]> {
  const script = fileURLToPath(new URL("./translate.py", import.meta.url));
  const python = process.env.PYTHON_PATH || "python3";
  const [from, to] = direction.split("_");
  const input = JSON.stringify({
    from,
    to,
    texts: segments.map((segment) => segment.text),
  });

  return new Promise((resolve, reject) => {
    const child = spawn(python, [script], {
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        ARGOS_DEVICE_TYPE: "cpu",
        ARGOS_COMPUTE_TYPE: "int8",
        ARGOS_INTER_THREADS: "1",
        ARGOS_INTRA_THREADS: "2",
        ARGOS_BEAM_SIZE: "1",
      },
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error("Translation timeout"));
    }, 5 * 60 * 1000);

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      if (stdout.length < 2_000_000) stdout += chunk;
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      if (stderr.length < 64_000) stderr += chunk;
    });
    child.on("error", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error("Translation unavailable"));
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error("Translation failed"));
        return;
      }
      try {
        const texts = parseTranslations(JSON.parse(stdout) as unknown, segments.length);
        resolve(segments.map((segment, index) => ({
          ...segment,
          text: texts[index]?.trim() ?? "",
          words: undefined,
        })));
      } catch {
        reject(new Error("Invalid translation response"));
      }
    });
    child.stdin.on("error", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill("SIGKILL");
      reject(new Error("Translation input failed"));
    });
    child.stdin.end(input, "utf8");
  });
}

export const argosTranslationProvider: TranslationProvider = {
  translateSegments: runArgos,
};
