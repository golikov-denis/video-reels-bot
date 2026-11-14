import { beforeEach, describe, expect, it, vi } from "vitest";

const pageMocks = vi.hoisted(() => ({
  connection: vi.fn(),
  getUploadSessionState: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: pageMocks.connection }));
vi.mock("../src/lib/uploads", () => ({
  getUploadSessionState: pageMocks.getUploadSessionState,
}));

import UploadPage from "../src/app/upload/[token]/page";

beforeEach(() => {
  pageMocks.connection.mockReset().mockResolvedValue(undefined);
  pageMocks.getUploadSessionState.mockReset().mockResolvedValue({
    status: "ready",
  });
});

describe("upload page", () => {
  it("ждёт пользовательский запрос до обращения к базе данных", async () => {
    const calls: string[] = [];
    pageMocks.connection.mockImplementation(async () => {
      calls.push("connection");
    });
    pageMocks.getUploadSessionState.mockImplementation(async () => {
      calls.push("database");
      return { status: "ready" };
    });

    const params = Promise.resolve({ token: "test-token" });
    const page = UploadPage({ params } as Parameters<typeof UploadPage>[0]);
    const layout = page.props.children[1];
    const panel = layout.props.children[1];
    const content = panel.props.children.props.children;

    expect(content.type.name).toBe("UploadContent");
    await content.type(content.props);

    expect(calls).toEqual(["connection", "database"]);
  });
});
