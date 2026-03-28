#!/usr/bin/env tsx

import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { GeneratePersonasUseCase } from "@/application/usecases/GeneratePersonasUseCase";
import { ParsePricingPageUseCase } from "@/application/usecases/ParsePricingPageUseCase";
import { LlmServiceImpl } from "@/infrastructure/adapters/LlmServiceImpl";
import { RemotePlaywrightAdapter } from "@/infrastructure/adapters/RemotePlaywrightAdapter";
import { Persona } from "@/domain/entities/Persona";

const DEFAULT_URL = "https://pricing.example.com";
const DEFAULT_PERSONA_DESCRIPTION = "B2B SaaS pricing page users";

export interface BenchmarkFlags {
  personasOnly: boolean;
  useMockPersonas: boolean;
  url: string;
}

export function parseArgs(): BenchmarkFlags {
  const args = process.argv.slice(2);
  return {
    personasOnly: args.includes("--personas-only"),
    useMockPersonas: args.includes("--use-mock-personas"),
    url: args.find(a => a.startsWith("--url="))?.split("=")[1] || DEFAULT_URL,
  };
}

export function formatTime(ms: number): string {
  return `${(ms / 1000).toFixed(3)}s`;
}

export function createMockPersonas(): Persona[] {
  return [
    {
      id: "mock-1",
      name: "Alice Chen",
      age: 32,
      occupation: "Product Manager",
      educationLevel: "MBA",
      interests: ["Productivity tools", "Data analysis"],
      goals: ["Scale team efficiency", "Reduce costs"],
      personalityTraits: ["Analytical", "Pragmatic"],
      conscientiousness: 80,
      neuroticism: 30,
      openness: 65,
      extraversion: 55,
      agreeableness: 70,
      cognitiveReflex: 75,
      technicalFluency: 70,
      economicSensitivity: 85,
      designStyle: "Minimalist",
      livingEnvironment: "Urban apartment",
      backstory: "10 years in tech, focused on B2B tools",
      aiInsight: "Alice prioritizes ROI and data-driven decisions.",
    },
    {
      id: "mock-2",
      name: "Bob Martinez",
      age: 28,
      occupation: "Startup Founder",
      educationLevel: "CS Degree",
      interests: ["AI/ML", "Growth hacking"],
      goals: ["Find product-market fit", "Scale quickly"],
      personalityTraits: ["Risk-taker", "Visionary"],
      conscientiousness: 60,
      neuroticism: 45,
      openness: 90,
      extraversion: 80,
      agreeableness: 55,
      cognitiveReflex: 40,
      technicalFluency: 95,
      economicSensitivity: 40,
      designStyle: "Modern",
      livingEnvironment: "Co-working space",
      backstory: "First-time founder, technical background",
      aiInsight: "Bob wants cutting-edge features over stability.",
    },
  ];
}

async function runBenchmark() {
  const flags = parseArgs();

  console.log("\n=== DeepBound Benchmark ===");
  console.log(`Mode: ${flags.personasOnly ? "personas-only" : flags.useMockPersonas ? "mock-personas+report" : "personas+report"}`);
  console.log(`URL: ${flags.url}\n`);

  const results: { phase: string; timeMs: number }[] = [];

  if (!flags.useMockPersonas) {
    console.log("[1/2] Generating personas...");
    const startPersonas = Date.now();

    const llmService = LlmServiceImpl.createFromEnv("openrouter");
    const useCase = new GeneratePersonasUseCase(llmService);
    const personas = await useCase.execute(DEFAULT_PERSONA_DESCRIPTION);

    const personasTime = Date.now() - startPersonas;
    results.push({ phase: "persona_generation", timeMs: personasTime });
    console.log(`      Done: ${formatTime(personasTime)}\n`);

    if (flags.personasOnly) {
      console.log("=== Results ===");
      console.log(`Persona Generation: ${formatTime(personasTime)}`);
      console.log("");
      return;
    }

    console.log("[2/2] Analyzing pricing page...");
    const startAnalysis = Date.now();

    const browserService = RemotePlaywrightAdapter.createFromEnv();
    const analysisUseCase = new ParsePricingPageUseCase(browserService, llmService);
    await analysisUseCase.execute(flags.url, personas);

    const analysisTime = Date.now() - startAnalysis;
    results.push({ phase: "pricing_analysis", timeMs: analysisTime });
    console.log(`      Done: ${formatTime(analysisTime)}\n`);

    await browserService.close();

    console.log("=== Results ===");
    console.log(`Persona Generation: ${formatTime(personasTime)}`);
    console.log(`Pricing Analysis:   ${formatTime(analysisTime)}`);
    console.log(`Total:               ${formatTime(personasTime + analysisTime)}`);
  } else {
    console.log("[1/1] Analyzing pricing page with mock personas...");
    const startAnalysis = Date.now();

    const personas = createMockPersonas();
    const browserService = RemotePlaywrightAdapter.createFromEnv();
    const llmService = LlmServiceImpl.createFromEnv("openrouter");
    const analysisUseCase = new ParsePricingPageUseCase(browserService, llmService);
    await analysisUseCase.execute(flags.url, personas);

    const analysisTime = Date.now() - startAnalysis;
    results.push({ phase: "pricing_analysis_mock", timeMs: analysisTime });
    console.log(`      Done: ${formatTime(analysisTime)}\n`);

    await browserService.close();

    console.log("=== Results ===");
    console.log(`Pricing Analysis (mock): ${formatTime(analysisTime)}`);
  }

  console.log("");
}

runBenchmark().catch(console.error);
