import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetProgressAction = vi.hoisted(() =>
  vi.fn(() => ({ status: "in_progress", progress: 50 })),
);

vi.mock("@/actions/getProgress", () => ({
  getProgressAction: mockGetProgressAction,
}));

describe("GET /api/vps/analyze-progress", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns progress data when runId is provided", async () => {
    const { GET } = await import("../route");
    const req = new NextRequest(
      "http://localhost:3000/api/vps/analyze-progress?runId=test-123",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "in_progress", progress: 50 });
  });

  it("returns 400 when runId is missing", async () => {
    const { GET } = await import("../route");
    const req = new NextRequest("http://localhost:3000/api/vps/analyze-progress");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});
