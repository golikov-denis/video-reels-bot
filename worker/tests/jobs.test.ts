import { describe, expect, it } from "vitest";
import { canClaimJob, MAX_ATTEMPTS } from "../src/jobs";

const now = new Date("2026-11-15T12:00:00.000Z");

describe("правила lease обработчика", () => {
  it("разрешает новую queued задачу", () => {
    expect(
      canClaimJob({ status: "queued", attempts: 0, leaseExpiresAt: null }, now),
    ).toBe(true);
  });

  it("не забирает активный lease, completed или failed", () => {
    const activeLease = new Date(now.getTime() + 60_000);
    expect(
      canClaimJob({ status: "processing", attempts: 1, leaseExpiresAt: activeLease }, now),
    ).toBe(false);
    expect(
      canClaimJob({ status: "completed", attempts: 1, leaseExpiresAt: null }, now),
    ).toBe(false);
    expect(
      canClaimJob({ status: "failed", attempts: 1, leaseExpiresAt: null }, now),
    ).toBe(false);
  });

  it("разрешает повтор после истечения lease, но ограничивает attempts", () => {
    const staleLease = new Date(now.getTime() - 1000);
    expect(
      canClaimJob({ status: "processing", attempts: 1, leaseExpiresAt: staleLease }, now),
    ).toBe(true);
    expect(
      canClaimJob(
        { status: "processing", attempts: MAX_ATTEMPTS, leaseExpiresAt: staleLease },
        now,
      ),
    ).toBe(false);
  });
});
