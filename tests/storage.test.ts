import { afterEach, describe, expect, it, vi } from "vitest";

import { createUploadUrl } from "../src/lib/storage";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createUploadUrl", () => {
  it("не добавляет необязательную CRC32-подпись, несовместимую с B2", async () => {
    vi.stubEnv("S3_ACCESS_KEY_ID", "test-access-key");
    vi.stubEnv("S3_SECRET_ACCESS_KEY", "test-secret-key");
    vi.stubEnv("S3_ENDPOINT", "https://s3.eu-central-003.backblazeb2.com");
    vi.stubEnv("S3_REGION", "eu-central-003");
    vi.stubEnv("S3_BUCKET", "video-reels-bot-test");

    const signedUrl = await createUploadUrl("uploads/user/file.mp4", "video/mp4");
    const url = new URL(signedUrl);
    const parameterNames = [...url.searchParams.keys()].map((name) =>
      name.toLowerCase(),
    );

    expect(url.searchParams.has("X-Amz-Signature")).toBe(true);
    expect(parameterNames).not.toContain("x-amz-checksum-crc32");
    expect(parameterNames).not.toContain("x-amz-sdk-checksum-algorithm");
  });
});
