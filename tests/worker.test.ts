import { beforeEach, describe, expect, it, vi } from "vitest";
import { triggerWorker } from "../src/lib/worker";
import { workerSignatureMatches } from "../src/lib/worker-auth";

const secret = "worker-trigger-secret-with-enough-length";
const jobId = "51903f05-c906-4d46-98fa-8b3d5065dcea";

beforeEach(() => {
  process.env.WORKER_URL = "https://worker.example.test/some/path";
  process.env.WORKER_SHARED_SECRET = secret;
});

describe("запуск worker", () => {
  it("отправляет только jobId с действительной подписью", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, { status: 202 }),
    );
    await triggerWorker(jobId, fetchMock);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://worker.example.test/process");
    expect(init?.method).toBe("POST");
    const headers = new Headers(init?.headers);
    expect(
      workerSignatureMatches(
        String(init?.body),
        secret,
        headers.get("x-worker-timestamp"),
        headers.get("x-worker-signature"),
      ),
    ).toBe(true);
    expect(JSON.parse(String(init?.body))).toEqual({ jobId });
  });

  it("не считает ответ ошибки запуском задачи", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, { status: 503 }),
    );
    await expect(triggerWorker(jobId, fetchMock)).rejects.toThrow();
  });
});
