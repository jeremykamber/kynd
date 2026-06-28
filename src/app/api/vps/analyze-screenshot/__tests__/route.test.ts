import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetScreenshotAction = vi.hoisted(() =>
  vi.fn(() => ({ screenshotBase64: "iVBOR..." })),
);

vi.mock("@/actions/getScreenshot", () => ({
  getScreenshotAction: mockGetScreenshotAction,
}));

describe("GET /api/vps/analyze-screenshot", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns screenshot data when runId is provided", async () => {
    const { GET } = await import("../route");
    const req = new NextRequest(
      "http://localhost:3000/api/vps/analyze-screenshot?runId=test-123",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ screenshotBase64: "iVBOR..." });
  });

  it("returns 400 when runId is missing", async () => {
    const { GET } = await import("../route");
    const req = new NextRequest(
      "http://localhost:3000/api/vps/analyze-screenshot",
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});
