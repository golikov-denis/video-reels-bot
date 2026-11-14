import { describe, expect, it } from "vitest";
import { resolveContentType } from "../src/lib/upload-rules";
import {
  createUploadToken,
  hashUploadToken,
  isUploadToken,
  parseUploadMetadata,
  UploadError,
} from "../src/lib/upload-validation";

describe("upload tokens", () => {
  it("создаёт разные токены длиной 32 байта и хранимый SHA-256 hash", () => {
    const first = createUploadToken();
    const second = createUploadToken();

    expect(first).not.toBe(second);
    expect(Buffer.from(first, "base64url")).toHaveLength(32);
    expect(isUploadToken(first)).toBe(true);
    expect(hashUploadToken(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashUploadToken(first)).not.toContain(first);
  });

  it("отклоняет короткие и небезопасные токены", () => {
    expect(isUploadToken("short")).toBe(false);
    expect(isUploadToken(`${"a".repeat(42)}+`)).toBe(false);
  });
});

describe("upload metadata", () => {
  it("принимает поддерживаемое видео и убирает путь из имени", () => {
    const result = parseUploadMetadata({
      fileName: "folder/../../lecture.mp4",
      size: 1024,
      contentType: "video/mp4",
    });

    expect(result).toEqual({
      fileName: "lecture.mp4",
      size: 1024,
      contentType: "video/mp4",
    });
  });

  it("определяет тип по расширению, если браузер не передал MIME", () => {
    expect(resolveContentType("lesson.MOV", "")).toBe("video/quicktime");
    expect(
      parseUploadMetadata({ fileName: "lesson.webm", size: 10, contentType: "" })
        .contentType,
    ).toBe("video/webm");
  });

  it.each([
    [{ fileName: "empty.mp4", size: 0, contentType: "video/mp4" }, 400],
    [
      { fileName: "huge.mp4", size: 2_147_483_649, contentType: "video/mp4" },
      413,
    ],
    [{ fileName: "notes.txt", size: 100, contentType: "text/plain" }, 415],
    [{ fileName: "bad.mp4", size: 1.5, contentType: "video/mp4" }, 400],
  ])("отклоняет некорректные данные %#", (input, status) => {
    try {
      parseUploadMetadata(input);
      throw new Error("Expected validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(UploadError);
      expect((error as UploadError).status).toBe(status);
    }
  });
});
