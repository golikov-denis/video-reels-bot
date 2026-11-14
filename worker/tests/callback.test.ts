import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deliverCallback } from "../src/callback";

const payload = {
  jobId: "51903f05-c906-4d46-98fa-8b3d5065dcea",
  status: "failed" as const,
  errorCode: "processing_failed" as const,
};

beforeEach(() => {
  vi.useFakeTimers();
  process.env.APP_URL = "https://app.example.test";
  process.env.WORKER_SHARED_SECRET = "callback-retry-secret-with-enough-length";
});

afterEach(() => vi.useRealTimers());

describe("доставка callback", () => {
  it("повторяет временные ошибки и завершается после подтверждения", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    const delivery = deliverCallback(payload, fetchMock);
    await vi.runAllTimersAsync();
    await delivery;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("не повторяет callback, отклонённый как некорректный", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 400 }));
    await expect(deliverCallback(payload, fetchMock)).rejects.toThrow("Callback rejected");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
