import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockPersona, mockAnalysis, mockCriticEvaluation } from "../../__tests__/test-utils";

const mockValidateAnalysisExecute = vi.hoisted(() => vi.fn());

vi.mock("@/infrastructure/adapters/OpenRouterCriticAdapter", () => {
  const MockAdapter = class {
    evaluate = mockValidateAnalysisExecute;
  };
  MockAdapter.createFromEnv = vi.fn(() => new MockAdapter());
  return { OpenRouterCriticAdapter: MockAdapter };
});

vi.mock("@/application/usecases/ValidateAnalysisUseCase", () => ({
  ValidateAnalysisUseCase: class {
    execute = mockValidateAnalysisExecute;
  },
}));

describe("POST /api/vps/validate-analysis", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns evaluation on valid input", async () => {
    mockValidateAnalysisExecute.mockResolvedValue(mockCriticEvaluation);

    const { POST } = await import("../route");
    const req = new NextRequest(
      "http://localhost:3000/api/vps/validate-analysis",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona: mockPersona, analysis: mockAnalysis }),
      },
    );
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.evaluation).toEqual(mockCriticEvaluation);
  });

  it("returns 500 when use case throws", async () => {
    mockValidateAnalysisExecute.mockRejectedValueOnce(
      new Error("Validation failed"),
    );

    const { POST } = await import("../route");
    const req = new NextRequest(
      "http://localhost:3000/api/vps/validate-analysis",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona: mockPersona, analysis: mockAnalysis }),
      },
    );
    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body).toHaveProperty("error");
  });
});
