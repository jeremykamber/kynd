import { NextResponse } from "next/server";
import { ParsePricingPageUseCase } from "@/application/usecases/ParsePricingPageUseCase";
import { RemotePlaywrightAdapter } from "@/infrastructure/adapters/RemotePlaywrightAdapter";
import { Persona } from "@/domain/entities/Persona";
import { LlmServiceImpl } from "@/infrastructure/adapters/LlmServiceImpl";

export async function POST(req: Request) {
  try {
    const { url, personas, requestId, imageBase64 } = await req.json();

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'url' parameter" },
        { status: 400 }
      );
    }

    if (!personas || !Array.isArray(personas) || personas.length === 0) {
      return NextResponse.json(
        { error: "Missing or invalid 'personas' parameter - must be a non-empty array" },
        { status: 400 }
      );
    }

    for (let i = 0; i < personas.length; i++) {
      const p = personas[i];
      if (!p || typeof p !== 'object') {
        return NextResponse.json(
          { error: `Invalid persona at index ${i}: must be an object` },
          { status: 400 }
        );
      }
      if (!p.id || typeof p.id !== 'string') {
        return NextResponse.json(
          { error: `Invalid persona at index ${i}: missing or invalid 'id' field` },
          { status: 400 }
        );
      }
      if (!p.name || typeof p.name !== 'string') {
        return NextResponse.json(
          { error: `Invalid persona at index ${i}: missing or invalid 'name' field` },
          { status: 400 }
        );
      }
    }

    const id = requestId || `report-${Date.now()}`;

    const browserService = RemotePlaywrightAdapter.createFromEnv();
    const llmService = LlmServiceImpl.createFromEnv("openrouter");
    const useCase = new ParsePricingPageUseCase(browserService, llmService);

    const analyses = await useCase.execute(
      url,
      personas as Persona[],
      undefined,
      undefined,
      { imageBase64 }
    );

    return NextResponse.json({
      requestId: id,
      url,
      personaCount: personas.length,
      analyses,
    });
  } catch (error) {
    console.error("Report API Error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}