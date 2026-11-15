import type { RenderOptions, TranslationDirection } from "../../src/lib/render-options";
import type { FragmentSelection, TranscriptSegment } from "./selection";
import type { Transcription, TranscriptWord } from "./transcription";
import type { TranslationProvider } from "./translation";

export type SubtitleCue = {
  start: number;
  end: number;
  lines: string[];
  words?: TranscriptWord[][];
};

const MAX_LINE_LENGTH = 34;
const MAX_CUE_SECONDS = 5;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function cleanText(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

export function transcriptForSelection(
  transcription: Transcription,
  selection: FragmentSelection,
): Transcription {
  const segments: TranscriptSegment[] = [];
  for (const segment of transcription.segments) {
    const start = Math.max(segment.start, selection.startSeconds);
    const end = Math.min(segment.end, selection.endSeconds);
    if (end <= start) continue;

    const allWords = segment.words ?? [];
    const segmentMiddle = (segment.start + segment.end) / 2;
    if (
      allWords.length === 0 &&
      (segmentMiddle < selection.startSeconds || segmentMiddle >= selection.endSeconds)
    ) {
      continue;
    }
    const words = allWords
      .filter((word) => word.end > selection.startSeconds && word.start < selection.endSeconds)
      .map((word) => ({
        start: Math.max(word.start, selection.startSeconds) - selection.startSeconds,
        end: Math.min(word.end, selection.endSeconds) - selection.startSeconds,
        word: word.word,
      }));
    const text = allWords.length > 0
      ? cleanText(words.map((word) => word.word).join(" "))
      : cleanText(segment.text);
    if (!text) continue;

    segments.push({
      start: start - selection.startSeconds,
      end: end - selection.startSeconds,
      text,
      ...(allWords.length > 0 ? { words } : {}),
    });
  }

  return {
    language: transcription.language,
    languageProbability: transcription.languageProbability,
    segments,
  };
}

function proportionalWords(segment: TranscriptSegment): TranscriptWord[] {
  const tokens = cleanText(segment.text).split(" ");
  const weights = tokens.map((token) => Math.max(1, token.length));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = segment.start;
  return tokens.map((token, index) => {
    const end = index === tokens.length - 1
      ? segment.end
      : cursor + ((segment.end - segment.start) * (weights[index] ?? 1)) / total;
    const word = { start: cursor, end, word: token };
    cursor = end;
    return word;
  });
}

function splitLongToken(token: string): string[] {
  if (token.length <= MAX_LINE_LENGTH) return [token];
  const parts: string[] = [];
  for (let index = 0; index < token.length; index += MAX_LINE_LENGTH) {
    parts.push(token.slice(index, index + MAX_LINE_LENGTH));
  }
  return parts;
}

function cueFromWords(words: TranscriptWord[]): SubtitleCue | null {
  if (words.length === 0) return null;
  const lines: string[] = [];
  const lineWords: TranscriptWord[][] = [];
  let currentWords: TranscriptWord[] = [];
  let currentLength = 0;

  const flushLine = () => {
    if (currentWords.length === 0) return;
    lineWords.push(currentWords);
    lines.push(cleanText(currentWords.map((word) => word.word).join(" ")));
    currentWords = [];
    currentLength = 0;
  };

  for (const sourceWord of words) {
    for (const part of splitLongToken(sourceWord.word)) {
      const word = { ...sourceWord, word: part };
      const addedLength = currentLength + (currentLength > 0 ? 1 : 0) + part.length;
      if (currentWords.length > 0 && addedLength > MAX_LINE_LENGTH) {
        flushLine();
      }
      if (lineWords.length === 2) {
        // Cues are chunked before this point; keep a defensive two-line limit.
        break;
      }
      currentWords.push(word);
      currentLength = currentLength + (currentLength > 0 ? 1 : 0) + part.length;
    }
  }
  flushLine();
  if (lineWords.length === 0 || lineWords.length > 2) return null;

  const first = words[0];
  const last = words[words.length - 1];
  if (!first || !last || last.end <= first.start) return null;
  return {
    start: first.start,
    end: last.end,
    lines,
    words: lineWords,
  };
}

function chunkTimedWords(words: TranscriptWord[]): TranscriptWord[][] {
  const chunks: TranscriptWord[][] = [];
  let current: TranscriptWord[] = [];
  let lines = 1;
  let lineLength = 0;

  for (const sourceWord of words) {
    for (const part of splitLongToken(sourceWord.word)) {
      const word = { ...sourceWord, word: part };
      const addedLength = lineLength + (lineLength > 0 ? 1 : 0) + part.length;
      if (lineLength > 0 && addedLength > MAX_LINE_LENGTH) {
        lines += 1;
        lineLength = 0;
      }
      const first = current[0];
      const wouldExceedDuration = first !== undefined && word.end - first.start > MAX_CUE_SECONDS;
      if (lines > 2 || wouldExceedDuration) {
        if (current.length > 0) chunks.push(current);
        current = [];
        lines = 1;
        lineLength = 0;
      }
      current.push(word);
      lineLength += (lineLength > 0 ? 1 : 0) + part.length;
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

function cuesForSegment(segment: TranscriptSegment): SubtitleCue[] {
  const words = segment.words && segment.words.length > 0
    ? segment.words
    : proportionalWords(segment);
  return chunkTimedWords(words)
    .map(cueFromWords)
    .filter((cue): cue is SubtitleCue => cue !== null);
}

function escapeAssText(text: string): string {
  return text
    .replace(/\\/gu, "\\\\")
    .replace(/\{/gu, "\\{")
    .replace(/\}/gu, "\\}")
    .replace(/\r?\n/gu, " ");
}

function assTimestamp(seconds: number): string {
  const centiseconds = Math.max(0, Math.round(seconds * 100));
  const hours = Math.floor(centiseconds / 360_000);
  const minutes = Math.floor((centiseconds % 360_000) / 6_000);
  const secs = Math.floor((centiseconds % 6_000) / 100);
  const fraction = centiseconds % 100;
  return `${hours}:${minutes.toString().padStart(2, "0")}:${secs
    .toString()
    .padStart(2, "0")}.${fraction.toString().padStart(2, "0")}`;
}

function karaokeLine(words: TranscriptWord[]): string {
  return words
    .map((word, index) => {
      const duration = Math.max(1, Math.round((word.end - word.start) * 100));
      const separator = index === 0 ? "" : " ";
      return `{\\k${duration}}${separator}${escapeAssText(word.word)}`;
    })
    .join("");
}

export function generateAss(
  cues: SubtitleCue[],
  style: "standard" | "karaoke",
): string {
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 720
PlayResY: 1280
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,DejaVu Sans,44,&H00FFFFFF,&H0000D7FF,&H00101820,&H90000000,0,0,0,0,100,100,0,0,1,4,1,2,48,48,92,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;
  const events = cues.map((cue) => {
    const text = style === "karaoke" && cue.words
      ? cue.words.map(karaokeLine).join("\\N")
      : cue.lines.map(escapeAssText).join("\\N");
    return `Dialogue: 0,${assTimestamp(cue.start)},${assTimestamp(cue.end)},Default,,0,0,0,,${text}`;
  });
  return `${header}\n${events.join("\n")}\n`;
}

export function createSubtitleCues(segments: TranscriptSegment[]): SubtitleCue[] {
  return segments
    .flatMap(cuesForSegment)
    .filter((cue) => cue.end > cue.start && cue.lines.some((line) => line.length > 0))
    .map((cue) => ({
      ...cue,
      start: Math.max(0, cue.start),
      end: Math.min(30, cue.end),
    }))
    .filter((cue) => cue.end > cue.start);
}

export async function createSubtitleFileContent(
  transcription: Transcription,
  options: RenderOptions,
  translator?: TranslationProvider,
): Promise<string> {
  if (options.subtitleMode === "off") {
    throw new Error("Subtitles were not requested");
  }
  if (transcription.segments.length === 0) {
    throw new Error("No speech in selected fragment");
  }

  let segments = transcription.segments;
  if (
    options.subtitleStyle === "karaoke" &&
    segments.some((segment) => !segment.words || segment.words.length === 0)
  ) {
    throw new Error("Word timestamps unavailable");
  }
  if (options.subtitleMode === "translated") {
    const direction = options.translationDirection as TranslationDirection;
    const [from] = direction.split("_");
    if (transcription.language?.toLowerCase() !== from || !translator) {
      throw new Error("Translation language mismatch");
    }
    segments = await translator.translateSegments(segments, direction);
  }

  const cues = createSubtitleCues(segments);
  if (cues.length === 0) throw new Error("No subtitles in selected fragment");
  if (options.subtitleStyle === "karaoke" && cues.some((cue) => !cue.words)) {
    throw new Error("Word timestamps unavailable");
  }
  return generateAss(cues, options.subtitleStyle);
}

export function clampSubtitleTime(value: number, duration: number): number {
  return clamp(value, 0, duration);
}
