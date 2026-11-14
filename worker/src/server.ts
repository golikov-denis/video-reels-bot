import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readWorkerSharedSecret } from "../../src/lib/config";
import { workerSignatureMatches } from "../../src/lib/worker-auth";
import { startJob } from "./process";

const MAX_BODY_BYTES = 4096;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(response: ServerResponse, status: number, body: object): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body));
}

async function readBody(request: IncomingMessage): Promise<string> {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk.toString("utf8");
    if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
      throw new Error("Body too large");
    }
  }
  return raw;
}

export function createWorkerServer() {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://worker.local");
      if (request.method === "GET" && url.pathname === "/health") {
        json(response, 200, { status: "ok" });
        return;
      }
      if (request.method !== "POST" || url.pathname !== "/process") {
        json(response, 404, { ok: false });
        return;
      }
      if (!(request.headers["content-type"] ?? "").includes("application/json")) {
        json(response, 415, { ok: false });
        return;
      }

      const rawBody = await readBody(request);
      const timestamp = request.headers["x-worker-timestamp"];
      const signature = request.headers["x-worker-signature"];
      if (
        !workerSignatureMatches(
          rawBody,
          readWorkerSharedSecret(),
          (Array.isArray(timestamp) ? timestamp[0] : timestamp) ?? null,
          (Array.isArray(signature) ? signature[0] : signature) ?? null,
        )
      ) {
        json(response, 401, { ok: false });
        return;
      }

      const payload = JSON.parse(rawBody) as { jobId?: unknown };
      if (typeof payload.jobId !== "string" || !UUID_PATTERN.test(payload.jobId)) {
        json(response, 400, { ok: false });
        return;
      }

      const started = startJob(payload.jobId);
      json(response, 202, { ok: true, duplicate: !started });
    } catch {
      json(response, 400, { ok: false });
    }
  });
}
