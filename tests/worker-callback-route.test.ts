import { beforeEach, describe, expect, it, vi } from "vitest";
import { signWorkerPayload } from "../src/lib/worker-auth";

const callbackMocks = vi.hoisted(() => ({ processWorkerCallback: vi.fn() }));
vi.mock("../src/lib/worker-callback", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/worker-callback")>()),
  processWorkerCallback: callbackMocks.processWorkerCallback,
}));

import { POST } from "../src/app/api/worker/callback/route";

const secret = "callback-route-secret-with-enough-length";
const payload = {
  jobId: "51903f05-c906-4d46-98fa-8b3d5065dcea",
  status: "failed",
  errorCode: "processing_failed",
};

function request(body = JSON.stringify(payload), signed = signWorkerPayload(body, secret)) {
  return new Request("https://example.test/api/worker/callback", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-worker-timestamp": signed.timestamp,
      "x-worker-signature": signed.signature,
    },
    body,
  });
}

beforeEach(() => {
  process.env.WORKER_SHARED_SECRET = secret;
  callbackMocks.processWorkerCallback.mockReset().mockResolvedValue({ duplicate: false });
});

describe("worker callback route", () => {
  it("принимает корректный подписанный результат", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(callbackMocks.processWorkerCallback).toHaveBeenCalledWith(payload);
  });

  it("отклоняет чужую подпись до обработки", async () => {
    const body = JSON.stringify(payload);
    const signed = signWorkerPayload(body, "wrong-secret");
    const response = await POST(request(body, signed));
    expect(response.status).toBe(401);
    expect(callbackMocks.processWorkerCallback).not.toHaveBeenCalled();
  });

  it("отклоняет повреждённый JSON и лишние поля результата", async () => {
    expect((await POST(request("{"))).status).toBe(400);
    const invalid = JSON.stringify({ ...payload, errorCode: "private_ffmpeg_details" });
    expect((await POST(request(invalid))).status).toBe(400);
    expect(callbackMocks.processWorkerCallback).not.toHaveBeenCalled();
  });

  it("возвращает подтверждение повторного callback без ошибки", async () => {
    callbackMocks.processWorkerCallback.mockResolvedValue({ duplicate: true });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, duplicate: true });
  });
});
