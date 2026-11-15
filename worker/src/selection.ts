export const MIN_FRAGMENT_SECONDS = 6;
export const MAX_FRAGMENT_SECONDS = 30;

export type TranscriptWord = {
  start: number;
  end: number;
  word: string;
};

export type TranscriptSegment = {
  start: number;
  end: number;
  text: string;
  words?: TranscriptWord[];
};

export type SelectionStrategy =
  | "full_source"
  | "speech"
  | "safe_speech"
  | "no_speech";

export type FragmentSelection = {
  startSeconds: number;
  endSeconds: number;
  confidence: number;
  strategy: SelectionStrategy;
  detectedLanguage: string | null;
};

type Candidate = FragmentSelection & { score: number };

const TERMINAL_PATTERN = /[.!?…]["'”’»)\x5d]*$/u;
const HOOK_PATTERN =
  /(?<![\p{L}\p{N}_])(как|почему|зачем|важно|ошибка|секрет|никогда|лучший|главное|how|why|important|mistake|secret|never|best)(?![\p{L}\p{N}_])|\d/iu;
const AD_PATTERN =
  /(?<![\p{L}\p{N}_])(подписывайтесь|подпишитесь|промокод|спонсор|реклама|ссылка в описании|subscribe|promo code|sponsor|link in the description)(?![\p{L}\p{N}_])/iu;
const WORD_PATTERN = /[\p{L}\p{N}]+/gu;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function words(text: string): string[] {
  return text.match(WORD_PATTERN) ?? [];
}

function normaliseSegments(
  sourceDurationSeconds: number,
  segments: TranscriptSegment[],
): TranscriptSegment[] {
  return segments
    .filter(
      (segment) =>
        Number.isFinite(segment.start) &&
        Number.isFinite(segment.end) &&
        segment.start >= 0 &&
        segment.end > segment.start &&
        segment.start < sourceDurationSeconds &&
        segment.text.trim().length > 0,
    )
    .map((segment) => ({
      start: segment.start,
      end: Math.min(segment.end, sourceDurationSeconds),
      text: segment.text.trim(),
    }))
    .sort((left, right) => left.start - right.start || left.end - right.end);
}

function scoreCandidate(
  segments: TranscriptSegment[],
  startIndex: number,
  endIndex: number,
  sourceDurationSeconds: number,
): Candidate | null {
  const first = segments[startIndex];
  const last = segments[endIndex];
  if (!first || !last) return null;

  const startSeconds = Math.max(0, first.start - 0.15);
  const endSeconds = Math.min(sourceDurationSeconds, last.end + 0.25);
  const duration = endSeconds - startSeconds;
  if (duration < MIN_FRAGMENT_SECONDS || duration > MAX_FRAGMENT_SECONDS) {
    return null;
  }

  const selected = segments.slice(startIndex, endIndex + 1);
  const text = selected.map((segment) => segment.text).join(" ");
  const wordCount = words(text).length;
  const speechSeconds = selected.reduce(
    (total, segment) => total + segment.end - segment.start,
    0,
  );
  const maximumGap = selected.slice(1).reduce(
    (gap, segment, index) =>
      Math.max(gap, segment.start - (selected[index]?.end ?? segment.start)),
    0,
  );
  const wordsPerMinute = wordCount / (duration / 60);
  const speechDensity = speechSeconds / duration;
  const beginsCleanly = startIndex === 0 || TERMINAL_PATTERN.test(segments[startIndex - 1]?.text.trim() ?? "");
  const endsCleanly = TERMINAL_PATTERN.test(last.text.trim());
  const hasHook = HOOK_PATTERN.test(first.text);
  const hasAdvertising = AD_PATTERN.test(text);
  const uniqueLines = new Set(
    selected.map((segment) => segment.text.toLocaleLowerCase().replace(/\s+/gu, " ")),
  );

  let confidence = 0.08;
  confidence += clamp(wordsPerMinute / 160, 0, 1) * 0.22;
  confidence += clamp(speechDensity, 0, 1) * 0.18;
  confidence += beginsCleanly ? 0.12 : -0.1;
  confidence += endsCleanly ? 0.24 : -0.18;
  confidence += hasHook ? 0.1 : 0;
  confidence += duration >= 12 ? 0.06 : 0;
  confidence -= maximumGap > 2 ? 0.16 : 0;
  confidence -= maximumGap > 4 ? 0.2 : 0;
  confidence -= hasAdvertising ? 0.55 : 0;
  confidence -= uniqueLines.size < selected.length ? 0.12 : 0;
  confidence = clamp(confidence, 0, 1);

  return {
    startSeconds,
    endSeconds,
    confidence,
    strategy: confidence >= 0.45 ? "speech" : "safe_speech",
    detectedLanguage: null,
    score: confidence + (endsCleanly ? 0.01 : 0),
  };
}

export function selectFragment(
  sourceDurationSeconds: number,
  transcript: TranscriptSegment[] = [],
  detectedLanguage: string | null = null,
): FragmentSelection {
  if (!Number.isFinite(sourceDurationSeconds) || sourceDurationSeconds <= 0) {
    throw new Error("Invalid source duration");
  }

  if (sourceDurationSeconds <= MAX_FRAGMENT_SECONDS) {
    return {
      startSeconds: 0,
      endSeconds: sourceDurationSeconds,
      confidence: transcript.length > 0 ? 0.9 : 0.5,
      strategy: "full_source",
      detectedLanguage,
    };
  }

  const segments = normaliseSegments(sourceDurationSeconds, transcript);
  if (segments.length === 0) {
    return {
      startSeconds: 0,
      endSeconds: MAX_FRAGMENT_SECONDS,
      confidence: 0.1,
      strategy: "no_speech",
      detectedLanguage: null,
    };
  }

  let best: Candidate | null = null;
  for (let startIndex = 0; startIndex < segments.length; startIndex += 1) {
    for (let endIndex = startIndex; endIndex < segments.length; endIndex += 1) {
      const first = segments[startIndex];
      const last = segments[endIndex];
      if (!first || !last) break;
      if (last.end - first.start > MAX_FRAGMENT_SECONDS - 0.1) break;
      const candidate = scoreCandidate(
        segments,
        startIndex,
        endIndex,
        sourceDurationSeconds,
      );
      if (
        candidate &&
        (!best ||
          candidate.score > best.score + 0.0001 ||
          (Math.abs(candidate.score - best.score) <= 0.0001 &&
            candidate.startSeconds < best.startSeconds))
      ) {
        best = candidate;
      }
    }
  }

  if (!best) {
    const first = segments[0];
    const startSeconds = Math.max(0, first?.start ?? 0);
    return {
      startSeconds,
      endSeconds: Math.min(sourceDurationSeconds, startSeconds + MAX_FRAGMENT_SECONDS),
      confidence: 0.15,
      strategy: "safe_speech",
      detectedLanguage,
    };
  }

  return {
    startSeconds: best.startSeconds,
    endSeconds: best.endSeconds,
    confidence: best.confidence,
    strategy: best.strategy,
    detectedLanguage,
  };
}
