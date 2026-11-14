import { describe, expect, it } from "vitest";
import {
  signWorkerPayload,
  workerSignatureMatches,
} from "../src/lib/worker-auth";

const secret = "test-secret-that-is-long-enough-for-hmac";
const body = JSON.stringify({ jobId: "51903f05-c906-4d46-98fa-8b3d5065dcea" });
const now = Date.parse("2026-11-15T12:00:00.000Z");

describe("подпись worker", () => {
  it("принимает точное тело и свежую метку времени", () => {
    const signed = signWorkerPayload(body, secret, now);
    expect(
      workerSignatureMatches(body, secret, signed.timestamp, signed.signature, now),
    ).toBe(true);
  });

  it("отклоняет изменённое тело и неправильный секрет", () => {
    const signed = signWorkerPayload(body, secret, now);
    expect(
      workerSignatureMatches(`${body} `, secret, signed.timestamp, signed.signature, now),
    ).toBe(false);
    expect(
      workerSignatureMatches(body, "wrong", signed.timestamp, signed.signature, now),
    ).toBe(false);
  });

  it("отклоняет старые и повреждённые подписи", () => {
    const signed = signWorkerPayload(body, secret, now);
    expect(
      workerSignatureMatches(body, secret, signed.timestamp, signed.signature, now + 300_001),
    ).toBe(false);
    expect(workerSignatureMatches(body, secret, "not-a-date", signed.signature, now)).toBe(false);
    expect(workerSignatureMatches(body, secret, signed.timestamp, "broken", now)).toBe(false);
  });
});
