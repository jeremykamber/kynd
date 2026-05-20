import { Persona } from "@/domain/entities/Persona";

const join = (arr?: string[]) => (arr && arr.length ? arr.join(", ") : "—");
const normalize = (text?: string) => (text ? text.replace(/\s+/g, " ").trim() : undefined);

/**
 * Compartmentalized persona prompt builder.
 * Implements the four-component architecture from Wang et al. (2024b):
 *   1. Demographic anchoring
 *   2. Psychographic specification
 *   3. Epistemic boundaries
 *   4. Behavioral guardrails
 *
 * Each section is delimited to prevent attention dilution between identity and task.
 */
export class PersonaPromptCompiler {
  private anchorIndex = 0;

  /** Reset the persona anchor counter for a fresh interaction. */
  resetAnchorIndex(): void {
    this.anchorIndex = 0;
  }

  /** Build the full compartmentalized system prompt for a persona. */
  compileSystemPrompt(persona: Persona, context?: string): string {
    const prompt = [
      this.compileDemographicSection(persona),
      this.compilePsychographicSection(persona),
      this.compileEpistemicSection(persona),
      this.compileGuardrailsSection(persona, context),
    ].join("\n");
    console.log("[PersonaPromptCompiler] Compartmentalized prompt built for", persona.name, "- sections: PERSONA IDENTITY, PSYCHOGRAPHIC PROFILE, EPISTEMIC BOUNDARIES, BEHAVIORAL GUARDRAILS");
    return prompt;
  }

  /** Section 1: Who the persona is. */
  private compileDemographicSection(persona: Persona): string {
    const parts: string[] = [
      "<<PERSONA IDENTITY>>",
      `Name: ${persona.name ?? "—"}`,
      `Age: ${persona.age ?? "—"}`,
      `Occupation: ${persona.occupation ?? "—"}`,
      `Education: ${persona.educationLevel ?? "—"}`,
      `Interests: ${join(persona.interests)}`,
      `Goals: ${join(persona.goals)}`,
    ];

    const backstory = normalize(persona.backstory);
    if (backstory) parts.push(`Life Story: ${backstory}`);

    if (persona.aiInsight) parts.push(`AI Insight: ${persona.aiInsight}`);

    return parts.join("\n");
  }

  /** Section 2: Psychographic profile — Joshi et al. (2025) Big Five + Wang et al. (2024b) psychographic spec. */
  private compilePsychographicSection(persona: Persona): string {
    return [
      "<<PSYCHOGRAPHIC PROFILE>>",
      "",
      "--- Big Five (OCEAN) ---",
      `Conscientiousness: ${persona.conscientiousness ?? 50}/100 (High=Meticulous, Low=Chaotic)`,
      `Neuroticism: ${persona.neuroticism ?? 50}/100 (High=Anxious, Low=Stable)`,
      `Openness: ${persona.openness ?? 50}/100 (High=Curious, Low=Traditional)`,
      `Extraversion: ${persona.extraversion ?? 50}/100 (High=Outgoing, Low=Solitary)`,
      `Agreeableness: ${persona.agreeableness ?? 50}/100 (High=Compassionate, Low=Competitive)`,
      "",
      `--- Values & Motivations ---`,
      `Values: ${join(persona.values)}`,
      `Fears: ${join(persona.fears)}`,
      `Communication Style: ${persona.communicationStyle ?? "—"}`,
      `Decision Style: ${persona.decisionStyle ?? "—"}`,
      "",
      `CORE RULE: Your Big Five profile is the ROOT CAUSE of your behavior. Every response MUST reflect these.`,
      `- High Conscientiousness: You read everything, notice details, don't skip.`,
      `- Low Conscientiousness: You skim, miss fine print, go with gut.`,
      `- High Neuroticism: You're risk-averse, worry about contract traps, need reassurance.`,
      `- Low Neuroticism: You're bold, adventuresome, don't sweat small risks.`,
      `- High Openness: You love new tools, early adopter, curious.`,
      `- Low Openness: You stick with what works, skeptical of change.`,
      `- High Extraversion: You seek input from others, collaborative.`,
      `- Low Extraversion: You decide independently, introspective.`,
      `- High Agreeableness: You avoid conflict, trust others' recommendations.`,
      `- Low Agreeableness: You're skeptical, challenge claims, prioritize your own analysis.`,
    ].join("\n");
  }

  /** Section 3: What the persona knows and doesn't know. */
  private compileEpistemicSection(persona: Persona): string {
    const parts: string[] = ["<<EPISTEMIC BOUNDARIES>>"];

    const expertise = join(persona.domainExpertise);
    if (expertise && expertise !== "—") {
      parts.push(`You know: ${expertise}`);
    } else {
      parts.push(`- You know about: SaaS products, software pricing, your industry, your professional experience.`);
    }

    const boundaries = join(persona.epistemicBoundaries);
    if (boundaries && boundaries !== "—") {
      parts.push(`You do NOT know: ${boundaries}`);
    } else {
      parts.push(`- You do NOT know about: topics outside your professional domain, technical implementation details of products you haven't used, internal company information.`);
    }

    return parts.join("\n");
  }

  /** Section 4: Behavioral constraints. */
  private compileGuardrailsSection(persona: Persona, context?: string): string {
    const constraints = persona.responseConstraints?.length
      ? persona.responseConstraints.map((c) => `- ${c}`).join("\n")
      : [
          "- Keep responses concise: 1-3 short paragraphs.",
          "- Use natural, conversational language. Fragments and slang are fine.",
          "- Ground opinions in your personal history/experience.",
        ].join("\n");

    const refusals = persona.refusalPatterns?.length
      ? persona.refusalPatterns.map((r) => `- ${r}`).join("\n")
      : [
          "- Do NOT write code, solve math problems, or act as a general AI assistant.",
          "- Do NOT break character or acknowledge you are an AI model.",
          "- Do NOT use HTML tags or markdown formatting.",
          "- If asked to do something outside your expertise, politely decline.",
        ].join("\n");

    const parts: string[] = [
      "<<BEHAVIORAL GUARDRAILS>>",
      `Response Constraints:`,
      constraints,
      "",
      `Refusal Patterns:`,
      refusals,
    ];

    if (context) {
      parts.push("", `<<CONTEXT>>`, context);
    }

    return parts.join("\n");
  }

  /** Build a chat message with persona anchor injected before the content. */
  compileChatMessage(persona: Persona, message: string, anchor?: string): string {
    const personaAnchor = anchor ?? this.generateAnchor(persona);
    this.anchorIndex++;
    return `${personaAnchor}\n${message}`;
  }

  /** Generate a short persona anchor (4-16 tokens) based on persona traits. */
  generateAnchor(persona: Persona): string {
    const archetype = this.detectArchetype(persona);
    const anchors: Record<string, string> = {
      "skeptical-veteran": `As a skeptical, veteran ${persona.occupation.toLowerCase()}:`,
      "passionate-founder": `As a passionate first-time founder:`,
      "curious-student": `As a curious ${this.simplifyEducation(persona.educationLevel)} student:`,
      "jaded-journalist": `As a jaded, veteran journalist:`,
      "cautious-manager": `As a cautious, risk-aware manager:`,
      "analytical-expert": `As an analytical, numbers-driven expert:`,
      "enthusiastic-hobbyist": `As an enthusiastic ${persona.interests?.[0]?.toLowerCase() ?? "hobbyist"}:`,
      "default": `As ${persona.name}, a ${persona.occupation}:`,
    };
    return anchors[archetype] ?? anchors["default"];
  }

  private detectArchetype(persona: Persona): string {
    if ((persona.neuroticism ?? 50) > 65 && (persona.conscientiousness ?? 50) > 60) return "cautious-manager";
    if ((persona.openness ?? 50) > 65 && (persona.extraversion ?? 50) < 40) return "analytical-expert";
    if ((persona.extraversion ?? 50) > 60 && (persona.openness ?? 50) > 60) return "enthusiastic-hobbyist";
    if ((persona.neuroticism ?? 50) < 35 && (persona.openness ?? 50) > 60) return "passionate-founder";
    if ((persona.conscientiousness ?? 50) > 70 && (persona.neuroticism ?? 50) > 55) return "skeptical-veteran";
    if ((persona.openness ?? 50) > 60) return "curious-student";
    return "default";
  }

  private simplifyEducation(level: string): string {
    const l = level.toLowerCase();
    if (l.includes("phd") || l.includes("doctorate") || l.includes("graduate") || l.includes("master")) return "graduate";
    if (l.includes("bachelor") || l.includes("undergraduate") || l.includes("college") || l.includes("university")) return "college";
    if (l.includes("high school") || l.includes("associate")) return "";
    return "";
  }

  /** Compile full interaction prompt: compartments + anchor + RAG context. */
  compileInteractionPrompt(
    persona: Persona,
    options?: {
      anchor?: string;
      ragContext?: string;
      userMessage?: string;
      conversationHistory?: string;
    },
  ): string {
    const sections: string[] = [];

    sections.push(this.compileSystemPrompt(persona));

    if (options?.ragContext) {
      sections.push(`\n<<RETRIEVED MEMORY>>\n${options.ragContext}`);
    }

    if (options?.conversationHistory) {
      sections.push(`\n<<CONVERSATION SO FAR>>\n${options.conversationHistory}`);
    }

    const anchor = options?.anchor ?? this.generateAnchor(persona);

    if (options?.userMessage) {
      sections.push(`\n${anchor}\n${options.userMessage}`);
    }

    return sections.join("\n\n");
  }
}
