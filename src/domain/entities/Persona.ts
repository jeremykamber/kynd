import { z } from "zod";

export interface Persona {
  id: string;
  name: string;
  age: number;
  occupation: string;
  educationLevel: string;
  interests: string[];
  goals: string[];
  personalityTraits: string[];
  // Big Five Personality Traits (0-100)
  conscientiousness: number;
  neuroticism: number;
  openness: number;
  extraversion: number;
  agreeableness: number;
  // Cognitive Engine (0-100: 0=System 1/Intuitive, 100=System 2/Analytical)
  cognitiveReflex: number;
  // Skill & Resource Layer (0-100)
  technicalFluency: number;
  economicSensitivity: number;
  // Aesthetic & Environment
  designStyle: string; // e.g. Minimalist, Industrial, Bohemian
  livingEnvironment: string; // e.g. "Cluttered urban apartment", "Sleek minimalist home"
  backstory?: string;
  aiInsight?: string;
}

export const PersonaSchema = z.object({
  id: z.string().describe("Unique identifier for the persona"),
  name: z.string().describe("Full name of the persona"),
  age: z.number().describe("Age of the persona"),
  occupation: z.string().describe("Job title or role"),
  educationLevel: z.string().describe("Highest level of education"),
  interests: z.array(z.string()).describe("Personal interests and hobbies"),
  goals: z.array(z.string()).describe("Professional or personal goals"),
  personalityTraits: z
    .array(z.string())
    .describe("3-5 descriptive personality adjectives"),

  // Psychological Scalars
  conscientiousness: z
    .number()
    .min(0)
    .max(100)
    .describe("High=Meticulous, Low=Chaotic"),
  neuroticism: z.number().min(0).max(100).describe("High=Anxious, Low=Stable"),
  openness: z
    .number()
    .min(0)
    .max(100)
    .describe("High=Curious, Low=Traditional"),
  extraversion: z
    .number()
    .min(0)
    .max(100)
    .describe("High=Outgoing, Low=Solitary"),
  agreeableness: z
    .number()
    .min(0)
    .max(100)
    .describe("High=Compassionate, Low=Competitive"),

  cognitiveReflex: z
    .number()
    .min(0)
    .max(100)
    .describe("0=Intuitive (System 1), 100=Analytical (System 2)"),
  technicalFluency: z
    .number()
    .min(0)
    .max(100)
    .describe("0=Luddite, 100=Hacker"),
  economicSensitivity: z
    .number()
    .min(0)
    .max(100)
    .describe("0=Price Indifferent, 100=Penny Pincher"),

  // Aesthetic & Environment
  designStyle: z
    .string()
    .describe("Preferred design aesthetic (e.g. Minimalist, Industrial)"),
  livingEnvironment: z
    .string()
    .describe("Description of their physical workspace or home"),

  backstory: z
    .string()
    .optional()
    .describe("A brief initial backstory summary"),
  aiInsight: z
    .string()
    .optional()
    .describe("A 2-sentence AI-generated behavioral insight"),
});

export function validatePersona(entity: Persona): boolean {
  return !!entity.id;
}

export function stringifyPersona(entity: Persona): string {
  // Helper to join lists compactly
  const join = (arr?: string[]) => (arr && arr.length ? arr.join(", ") : "—");

  // Normalize backstory to a single line but do NOT truncate
  const normalizeBackstory = (text?: string) => {
    if (!text) return undefined;
    return text.replace(/\s+/g, " ").trim();
  };

  const lines: string[] = [
    `Name: ${entity.name ?? "—"}`,
    `Age: ${entity.age ?? "—"}`,
    `Occupation: ${entity.occupation ?? "—"}`,
    `Education: ${entity.educationLevel ?? "—"}`,
    `Interests: ${join(entity.interests)}`,
    `Goals: ${join(entity.goals)}`,
    `Traits: ${join(entity.personalityTraits)}`,
    `--- PSYCHOLOGICAL SCALARS (0-100) ---`,
    `Conscientiousness: ${entity.conscientiousness ?? 50} (Low=Chaotic, High=Meticulous)`,
    `Neuroticism: ${entity.neuroticism ?? 50} (Low=Sturdy, High=Anxious/Risk-Averse)`,
    `Openness: ${entity.openness ?? 50} (Low=Traditional, High=Early Adopter)`,
    `Extraversion: ${entity.extraversion ?? 50}`,
    `Agreeableness: ${entity.agreeableness ?? 50}`,
    `Cognitive Reflex: ${entity.cognitiveReflex ?? 50} (0=System 1/Emotional, 100=System 2/Logical)`,
    `Technical Fluency: ${entity.technicalFluency ?? 50}`,
    `Economic Sensitivity: ${entity.economicSensitivity ?? 50} (High=Price-Sensitive)`,
    `--- AESTHETIC DNA ---`,
    `Design Style: ${entity.designStyle ?? "Minimalist"}`,
    `Living Environment: ${entity.livingEnvironment ?? "Organized habitat"}`,
  ];

  const backstory = normalizeBackstory(entity.backstory);
  if (backstory) lines.push(`Backstory: ${backstory}`);

  if (entity.aiInsight) lines.push(`AI Insight: ${entity.aiInsight}`);

  return lines.join("\n");
}
