import { readTelegramConfig } from "@/lib/config";

export function GET() {
  const config = readTelegramConfig();

  return Response.json(
    {
      status: "ok",
      service: "video-reels-bot",
      timestamp: new Date().toISOString(),
      telegram: config.botToken && config.webhookSecret ? "configured" : "not_configured",
    },
    {
      status: 200,
      headers: { "cache-control": "no-store" },
    },
  );
}
