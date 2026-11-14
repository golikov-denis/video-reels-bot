import { createHmac, timingSafeEqual } from "node:crypto";

const SIGNATURE_WINDOW_MS = 5 * 60 * 1000;

export function signWorkerPayload(
  rawBody: string,
  secret: string,
  timestamp = Date.now(),
): { timestamp: string; signature: string } {
  const timestampText = Math.floor(timestamp).toString();
  const signature = createHmac("sha256", secret)
    .update(`${timestampText}.${rawBody}`, "utf8")
    .digest("hex");
  return { timestamp: timestampText, signature };
}

export function workerSignatureMatches(
  rawBody: string,
  secret: string,
  timestamp: string | null,
  signature: string | null,
  now = Date.now(),
): boolean {
  if (!timestamp || !/^\d+$/.test(timestamp)) return false;
  if (!signature || !/^[a-f0-9]{64}$/.test(signature)) return false;

  const timestampMs = Number(timestamp);
  if (
    !Number.isSafeInteger(timestampMs) ||
    Math.abs(now - timestampMs) > SIGNATURE_WINDOW_MS
  ) {
    return false;
  }

  const expected = Buffer.from(
    signWorkerPayload(rawBody, secret, timestampMs).signature,
    "hex",
  );
  const received = Buffer.from(signature, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}
