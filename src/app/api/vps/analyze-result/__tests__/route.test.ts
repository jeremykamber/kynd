import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetSimulationResultAction = vi.hoisted(() =>
  vi.fn(() => ({ id: "result-1", thoughts: "Done" })),
);

vi.mock("@/actions/getSimulationResult", () => ({
  getSimulationResultAction: mockGetSimulationResultAction,
}));

describe("GET /api/vps/analyze-result", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns simulation result when runId is provided", async () => {
    const { GET } = await import("../route");
    const req = new NextRequest(
      "http://localhost:3000/api/vps/analyze-result?runId=test-123",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ id: "result-1", thoughts: "Done" });
  });

  it("returns 400 when runId is missing", async () => {
    const { GET } = await import("../route");
    const req = new NextRequest("http://localhost:3000/api/vps/analyze-result");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});
