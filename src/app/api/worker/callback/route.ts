import {
  processWorkerCallback,
  readWorkerCallback,
  WorkerCallbackError,
} from "@/lib/worker-callback";

export async function POST(request: Request) {
  try {
    const payload = await readWorkerCallback(request);
    const result = await processWorkerCallback(payload);
    return Response.json(
      { ok: true, duplicate: result.duplicate },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof WorkerCallbackError) {
      return Response.json(
        { ok: false },
        { status: error.status, headers: { "cache-control": "no-store" } },
      );
    }
    console.error("Worker callback failed");
    return Response.json(
      { ok: false },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
