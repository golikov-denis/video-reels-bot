import { readWorkerConfig } from "./config";
import { signWorkerPayload } from "./worker-auth";

export async function triggerWorker(
  jobId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const config = readWorkerConfig();
  const rawBody = JSON.stringify({ jobId });
  const signed = signWorkerPayload(rawBody, config.sharedSecret);
  const response = await fetchImpl(`${config.url}/process`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-worker-timestamp": signed.timestamp,
      "x-worker-signature": signed.signature,
    },
    body: rawBody,
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  if (response.status !== 202) throw new Error("Worker did not accept the job");
}
