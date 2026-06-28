"use server";

import { PredictGazeUseCase } from "@/application/usecases/PredictGazeUseCase";
import { GazePredictionAdapter } from "@/infrastructure/adapters/GazePredictionAdapter";
import { Persona } from "@/domain/entities/Persona";

const VPS_BACKEND_URL = process.env.VPS_BACKEND_URL;
const VPS_AUTH_TOKEN = process.env.VPS_AUTH_TOKEN;

async function runLocally(persona: Persona, screenshotBase64: string) {
  const adapter = new GazePredictionAdapter();
  const useCase = new PredictGazeUseCase(adapter);
  const gazePoints = await useCase.execute(persona, screenshotBase64);
  return { success: true, data: gazePoints };
}

async function runRemote(persona: Persona, screenshotBase64: string) {
  const res = await fetch(`${VPS_BACKEND_URL}/api/vps/predict-gaze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${VPS_AUTH_TOKEN}`,
    },
    body: JSON.stringify({ persona, screenshotBase64 }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    return { success: false, error: err.error || `HTTP ${res.status}` };
  }
  return res.json();
}

export async function predictGazeAction(persona: Persona, screenshotBase64: string) {
  try {
    if (process.env.NODE_ENV === "development" || process.env.IS_VPS === "true") return runLocally(persona, screenshotBase64);
    return runRemote(persona, screenshotBase64);
  } catch (error) {
    console.error("Action error in predictGazeAction:", error);
    return { success: false, error: (error as Error).message };
  }
}
