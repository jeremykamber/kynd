"use server";

import { PredictGazeUseCase } from "@/application/usecases/PredictGazeUseCase";
import { GazePredictionAdapter } from "@/infrastructure/adapters/GazePredictionAdapter";
import { Persona } from "@/domain/entities/Persona";

import { shouldRunLocally, VPS_BACKEND_URL, getVpsAuthToken } from "@/infrastructure/config";

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
      Authorization: `Bearer ${getVpsAuthToken()}`,
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
    if (shouldRunLocally()) return runLocally(persona, screenshotBase64);
    return runRemote(persona, screenshotBase64);
  } catch (error) {
    console.error("Action error in predictGazeAction:", error);
    return { success: false, error: (error as Error).message };
  }
}
