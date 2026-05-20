import { Persona } from "@/domain/entities/Persona";
import { LlmServiceImpl } from "./LlmServiceImpl";

export interface PsychologicalScaffold {
  label: string;
  generate(persona: Persona): Promise<string>;
}

export interface PbjRationale {
  scaffold: string;
  rationale: string;
}

/**
 * PB&J (Psychology of Behavior and Judgments) scaffold enhancer.
 * Implements Joshi et al. (2025): augments personas with LLM-generated
 * rationales grounded in psychological scaffolds (Big Five, Primal World
 * Beliefs) that explain WHY a persona holds specific traits and judgments.
 *
 * Reference: Joshi et al. (2025) "Improving LLM Personas via Rationalization
 * with Psychological Scaffolds" — Findings of EMNLP 2025.
 */
export class PbjScaffoldEnhancer {
  private scaffolds: PsychologicalScaffold[];

  constructor(private llmService: LlmServiceImpl) {
    this.scaffolds = this.buildScaffolds();
  }

  /**
   * Generate PB&J rationales for each psychological scaffold, then return
   * a combined rationale text that can be appended to the persona's backstory.
   */
  async enhanceBackstory(persona: Persona): Promise<string> {
    const rationales = await this.generateAllRationales(persona);
    return this.formatRationales(rationales);
  }

  /**
   * Generate rationales for all psychological scaffolds in parallel.
   */
  async generateAllRationales(persona: Persona): Promise<PbjRationale[]> {
    const results = await Promise.allSettled(
      this.scaffolds.map(async (scaffold) => {
        const text = await scaffold.generate(persona);
        return { scaffold: scaffold.label, rationale: text };
      }),
    );

    const rationales: PbjRationale[] = [];
    for (const result of results) {
      if (result.status === "fulfilled") {
        rationales.push(result.value);
      }
    }
    return rationales;
  }

  private buildScaffolds(): PsychologicalScaffold[] {
    return [
      {
        label: "Big Five Personality Roots",
        generate: async (persona: Persona) => {
          const system = "You are a personality psychologist. Given a persona's Big Five profile, explain in 2-3 sentences why they have each trait level based on plausible life experiences.";
          const user = [
            `Persona: ${persona.name}, ${persona.occupation}`,
            `Conscientiousness: ${persona.conscientiousness}/100`,
            `Neuroticism: ${persona.neuroticism}/100`,
            `Openness: ${persona.openness}/100`,
            `Extraversion: ${persona.extraversion}/100`,
            `Agreeableness: ${persona.agreeableness}/100`,
            "",
            `Explain the psychological roots of each trait level using the Big Five framework. Focus on cause-and-effect: "This person has high X because..."`,
          ].join("\n");
          return this.llmService.createChatCompletion(
            [{ role: "system", content: system }, { role: "user", content: user }],
            { purpose: "PB&J Big Five Scaffold", temperature: 0.5 },
          );
        },
      },
      {
        label: "Cognitive-Reflex Decision Style",
        generate: async (persona: Persona) => {
          const system = "You are a behavioral economist. Explain how this persona's cognitive reflex score (System 1 vs System 2 thinking) manifests in their real-world decision-making.";
          const user = [
            `Persona: ${persona.name}, ${persona.occupation}`,
            `Cognitive Reflex: ${persona.cognitiveReflex}/100 (0=System 1/Intuitive, 100=System 2/Analytical)`,
            `Neuroticism: ${persona.neuroticism}/100`,
            `Openness: ${persona.openness}/100`,
            "",
            `Describe their default decision-making process when faced with a significant purchase or commitment. Do they trust their gut? Do they spreadsheet every option? Why?`,
          ].join("\n");
          return this.llmService.createChatCompletion(
            [{ role: "system", content: system }, { role: "user", content: user }],
            { purpose: "PB&J Cognitive Scaffold", temperature: 0.5 },
          );
        },
      },
      {
        label: "Core Values & Risk Worldview",
        generate: async (persona: Persona) => {
          const system = "You are a values psychologist. Based on the persona's profile, articulate their core values around money, risk, efficiency, and trust in 2-3 sentences.";
          const user = [
            `Persona: ${persona.name}, ${persona.occupation}`,
            `Economic Sensitivity: ${persona.economicSensitivity}/100 (High=Price-Sensitive)`,
            `Technical Fluency: ${persona.technicalFluency}/100`,
            `Agreeableness: ${persona.agreeableness}/100`,
            `Neuroticism: ${persona.neuroticism}/100`,
            `Goals: ${persona.goals.join(", ")}`,
            persona.backstory ? `Backstory excerpt: ${persona.backstory.slice(0, 500)}` : "",
            "",
            "Explain what they fundamentally value when making decisions about tools and services. How do they weigh cost vs quality? What makes them trust (or distrust) a vendor?",
          ].join("\n");
          return this.llmService.createChatCompletion(
            [{ role: "system", content: system }, { role: "user", content: user }],
            { purpose: "PB&J Values Scaffold", temperature: 0.5 },
          );
        },
      },
    ];
  }

  private formatRationales(rationales: PbjRationale[]): string {
    if (rationales.length === 0) return "";
    const parts = rationales.map(
      (r) => `[${r.scaffold}]\n${r.rationale.trim()}`,
    );
    return `\n\n<<PSYCHOLOGICAL RATIONALES (PB&J)>>\n${parts.join("\n\n")}`;
  }
}
