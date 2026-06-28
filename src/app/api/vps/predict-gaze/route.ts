// ─── POST /api/vps/predict-gaze ─────────────────────────────────────────────
// Given a Persona and a screenshot of a page, predicts where the persona's
// gaze would naturally land (attention heatmap points). Returns an array of
// gaze points as JSON.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { PredictGazeUseCase } from "@/application/usecases/PredictGazeUseCase";
import { GazePredictionAdapter } from "@/infrastructure/adapters/GazePredictionAdapter";
import { Persona } from "@/domain/entities/Persona";

export async function POST(req: NextRequest) {
  const { persona, screenshotBase64 } = await req.json();

  try {
    const adapter = new GazePredictionAdapter();
    const useCase = new PredictGazeUseCase(adapter);
    const gazePoints = await useCase.execute(
      persona as Persona,
      screenshotBase64,
    );

    return NextResponse.json({ success: true, data: gazePoints });
  } catch (error) {
    console.error("Error in predict-gaze:", error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 },
    );
  }
}
