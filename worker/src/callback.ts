import { readAppUrl, readWorkerSharedSecret } from "../../src/lib/config";
import { signWorkerPayload } from "../../src/lib/worker-auth";
import type { WorkerCallbackPayload } from "../../src/lib/worker-callback";

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export async function deliverCallback(
  payload: WorkerCallbackPayload,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const rawBody = JSON.stringify(payload);
  const callbackUrl = `${readAppUrl()}/api/worker/callback`;
  const secret = readWorkerSharedSecret();

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const signed = signWorkerPayload(rawBody, secret);
      const response = await fetchImpl(callbackUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-worker-timestamp": signed.timestamp,
          "x-worker-signature": signed.signature,
        },
        body: rawBody,
        signal: AbortSignal.timeout(20_000),
      });
      if (response.ok) return;
      if (response.status < 500 && response.status !== 429) {
        throw new Error("Callback rejected");
      }
    } catch (error) {
      if (error instanceof Error && error.message === "Callback rejected") throw error;
    }
    if (attempt < 3) await delay(attempt * 1000);
  }
  throw new Error("Callback delivery failed");
}
