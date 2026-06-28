import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockPersona, mockGazePoints } from "../../__tests__/test-utils";

const mockPredictGazeExecute = vi.hoisted(() => vi.fn());

vi.mock("@/infrastructure/adapters/GazePredictionAdapter", () => ({
  GazePredictionAdapter: class {
    predict = mockPredictGazeExecute;
  },
}));

vi.mock("@/application/usecases/PredictGazeUseCase", () => ({
  PredictGazeUseCase: class {
    execute = mockPredictGazeExecute;
  },
}));

describe("POST /api/vps/predict-gaze", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns predicted gaze points", async () => {
    mockPredictGazeExecute.mockResolvedValue(mockGazePoints);

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost:3000/api/vps/predict-gaze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        persona: mockPersona,
        screenshotBase64: "iVBOR...",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual(mockGazePoints);
  });

  it("returns 500 when use case throws", async () => {
    mockPredictGazeExecute.mockRejectedValueOnce(new Error("Gaze failed"));

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost:3000/api/vps/predict-gaze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        persona: mockPersona,
        screenshotBase64: "iVBOR...",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body).toHaveProperty("error");
  });
});
