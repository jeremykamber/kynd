import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockPersona } from "../../__tests__/test-utils";

const mockRateLimiterConsume = vi.hoisted(() =>
  vi.fn(() => Promise.resolve()),
);
const mockGeneratePersonasExecute = vi.hoisted(() => vi.fn());

vi.mock("rate-limiter-flexible", () => ({
  RateLimiterMemory: class {
    consume = mockRateLimiterConsume;
  },
}));

vi.mock("@/infrastructure/adapters/LlmServiceImpl", () => {
  const LlmServiceImpl = class {};
  LlmServiceImpl.createFromEnv = vi.fn(() => new LlmServiceImpl());
  return { LlmServiceImpl };
});

vi.mock("@/application/usecases/GeneratePersonasUseCase", () => ({
  GeneratePersonasUseCase: class {
    execute = mockGeneratePersonasExecute;
  },
}));

describe("POST /api/vps/generate-personas", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns generated personas on valid input", async () => {
    mockGeneratePersonasExecute.mockResolvedValue([mockPersona]);

    const { POST } = await import("../route");
    const req = new NextRequest(
      "http://localhost:3000/api/vps/generate-personas",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personaDescription: "A tech-savvy founder" }),
      },
    );
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.step).toBe("DONE");
    expect(body.personas).toHaveLength(1);
    expect(body.personas[0].name).toBe("Test Persona");
  });

  it("returns 429 when rate limited", async () => {
    mockRateLimiterConsume.mockRejectedValueOnce(new Error("Too fast"));

    const { POST } = await import("../route");
    const req = new NextRequest(
      "http://localhost:3000/api/vps/generate-personas",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personaDescription: "A tech-savvy founder" }),
      },
    );
    const res = await POST(req);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 500 when use case throws", async () => {
    mockGeneratePersonasExecute.mockRejectedValueOnce(
      new Error("Unexpected crash"),
    );

    const { POST } = await import("../route");
    const req = new NextRequest(
      "http://localhost:3000/api/vps/generate-personas",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personaDescription: "A tech-savvy founder" }),
      },
    );
    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.step).toBe("ERROR");
    expect(body.error).toBe("Unexpected crash");
  });
});
