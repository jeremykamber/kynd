import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { personaGenerationStore } from "@/infrastructure/PersonaGenerationStore";

/**
 * Waits for a fire-and-forget run to land in the store that the polling
 * endpoints (persona-result / getPersonaGenerationResultAction) read.
 */
async function waitForRun(runId: string) {
  return vi.waitFor(() => {
    const run = personaGenerationStore.get(runId);
    if (!run) throw new Error(`run ${runId} was never persisted for polling`);
    return run;
  });
}

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
  const LlmServiceImpl = class {
    static createFromEnv = vi.fn(() => new LlmServiceImpl());
  };
  return { LlmServiceImpl };
});

vi.mock("@/application/usecases/GeneratePersonasUseCase", () => ({
  GeneratePersonasUseCase: class {
    execute = mockGeneratePersonasExecute;
  },
}));

describe("POST /api/vps/generate-personas", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns runId immediately for valid input (fire-and-forget)", async () => {
    mockGeneratePersonasExecute.mockResolvedValue([]);

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
    expect(body).toHaveProperty("runId");
    expect(typeof body.runId).toBe("string");
    expect(body.runId.length).toBeGreaterThan(0);
  });

  it("drops unsupported modes", async () => {
    // Mirrors GeneratePersonasUseCase: 'research'/'strategy' select the phased
    // pipeline and stamp `generationMode` on the personas, 'cluster' is
    // rejected (it needs interview IDs), an omitted mode runs the legacy
    // pipeline.
    mockGeneratePersonasExecute.mockImplementation(
      async (
        _description: string,
        _onProgress: unknown,
        _count: number,
        _context: unknown,
        mode?: string,
      ) => {
        if (mode === "cluster") {
          throw new Error("Cluster mode requires interview IDs.");
        }
        return mode === undefined
          ? [{ id: "legacy-persona", name: "Legacy persona" }]
          : [
              {
                id: "phased-persona",
                name: "Phased persona",
                generationMode: mode,
              },
            ];
      },
    );

    const { POST } = await import("../route");

    // 'cluster' is unsupported here, so it must be dropped before the run —
    // the poller must see the legacy persona, not a failed run.
    const unsupportedRes = await POST(
      new NextRequest(
        "http://localhost:3000/api/vps/generate-personas",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ personaDescription: "A tech-savvy founder", mode: "cluster" }),
        },
      ),
    );
    const unsupportedRun = await waitForRun((await unsupportedRes.json()).runId);
    expect(unsupportedRun.error).toBeUndefined();
    expect(unsupportedRun.personas).toEqual([
      { id: "legacy-persona", name: "Legacy persona" },
    ]);

    // A supported mode is preserved verbatim into the stored run.
    const supportedRes = await POST(
      new NextRequest(
        "http://localhost:3000/api/vps/generate-personas",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ personaDescription: "A tech-savvy founder", mode: "research" }),
        },
      ),
    );
    const supportedRun = await waitForRun((await supportedRes.json()).runId);
    expect(supportedRun.personas).toEqual([
      {
        id: "phased-persona",
        name: "Phased persona",
        generationMode: "research",
      },
    ]);
  });

  it("returns 400 when personaDescription is missing", async () => {
    const { POST } = await import("../route");
    const req = new NextRequest(
      "http://localhost:3000/api/vps/generate-personas",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
    );
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
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

  it("returns runId even when use case throws (error captured in background)", async () => {
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
    // POST always returns 200 with runId — errors are captured asynchronously
    // in the background IIFE and stored in PersonaGenerationStore for polling
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("runId");

    // The failure must be retrievable by the poller, otherwise a client
    // polling this run would hang forever.
    const run = await waitForRun(body.runId);
    expect(run.error).toBe("Unexpected crash");
    expect(run.personas).toEqual([]);

    // Loaded per-test so the route sees the module mocks registered above.
    const { GET } = await import("../../persona-result/route");
    const pollRes = await GET(
      new NextRequest(
        `http://localhost:3000/api/vps/persona-result?runId=${body.runId}`,
      ),
    );
    expect(pollRes.status).toBe(200);
    expect(await pollRes.json()).toMatchObject({
      found: true,
      error: "Unexpected crash",
    });
  });
});
