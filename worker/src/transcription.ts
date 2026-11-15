import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { inspectSourceDetails } from "./media";
import { selectFragment, type FragmentSelection, type TranscriptSegment } from "./selection";

export type Transcription = {
  language: string | null;
  languageProbability: number;
  segments: TranscriptSegment[];
};

export interface TranscriptionProvider {
  transcribe(source: string): Promise<Transcription>;
}

export function parseTranscription(value: unknown): Transcription {
  if (typeof value !== "object" || value === null) {
    throw new Error("Invalid transcription");
  }
  const input = value as Record<string, unknown>;
  if (!Array.isArray(input.segments)) throw new Error("Invalid transcription");
  const segments = input.segments.map((item) => {
    const segment = item as Record<string, unknown>;
    if (
      typeof segment.start !== "number" ||
      typeof segment.end !== "number" ||
      typeof segment.text !== "string"
    ) {
      throw new Error("Invalid transcription segment");
    }
    return { start: segment.start, end: segment.end, text: segment.text };
  });
  return {
    language: typeof input.language === "string" ? input.language.slice(0, 16) : null,
    languageProbability:
      typeof input.languageProbability === "number" ? input.languageProbability : 0,
    segments,
  };
}

async function runWhisper(source: string): Promise<Transcription> {
  const script = fileURLToPath(new URL("./transcribe.py", import.meta.url));
  const python = process.env.PYTHON_PATH || "python3";
  return new Promise((resolve, reject) => {
    const child = spawn(python, [script, source], {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, OMP_NUM_THREADS: "2" },
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error("Transcription timeout"));
    }, 20 * 60 * 1000);

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      if (stdout.length < 16_000_000) stdout += chunk;
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      if (stderr.length < 64_000) stderr += chunk;
    });
    child.on("error", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error("Transcription unavailable"));
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error("Transcription failed"));
        return;
      }
      try {
        resolve(parseTranscription(JSON.parse(stdout) as unknown));
      } catch {
        reject(new Error("Invalid transcription"));
      }
    });
  });
}

export const fasterWhisperProvider: TranscriptionProvider = {
  transcribe: runWhisper,
};

export async function selectSourceFragment(
  sourceUrl: string,
  provider: TranscriptionProvider = fasterWhisperProvider,
): Promise<{ sourceDurationSeconds: number; selection: FragmentSelection }> {
  const source = await inspectSourceDetails(sourceUrl);
  if (!source.hasAudio || source.durationSeconds <= 30) {
    return {
      sourceDurationSeconds: source.durationSeconds,
      selection: selectFragment(source.durationSeconds),
    };
  }

  try {
    const transcription = await provider.transcribe(sourceUrl);
    return {
      sourceDurationSeconds: source.durationSeconds,
      selection: selectFragment(
        source.durationSeconds,
        transcription.segments,
        transcription.language,
      ),
    };
  } catch {
    return {
      sourceDurationSeconds: source.durationSeconds,
      selection: selectFragment(source.durationSeconds),
    };
  }
}
