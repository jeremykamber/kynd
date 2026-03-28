import { Persona, PersonaSchema } from "@/domain/entities/Persona";
import { LlmServiceImpl } from "./LlmServiceImpl";
import { streamText, Output } from "ai";
import { stripCodeFence } from "./llmUtils";
import { GENDERLESS_NAMES } from "@/data/genderless_names";

export class PersonaAdapter {
  constructor(private llmService: LlmServiceImpl) { }

  /**
   * Generates a set of initial buyer personas based on a customer profile description.
   */
  async generateInitialPersonas(personaDescription: string): Promise<Persona[]> {
    const system = `You are a persona generator creating realistic buyer personas for SaaS pricing evaluation.

Generate a JSON array of 3 DISTINCT personas matching this TypeScript interface:

interface Persona {
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
  designStyle: string;       // e.g. Minimalist, Industrial, Mid-Century Modern
  livingEnvironment: string; // Describe their messy/organized home or office
}

CRITICAL REQUIREMENTS:
- SCIENTIFIC ROOT CAUSES: Assign high-fidelity scalars (0-100) for the Big Five and Cognitive Reflex. These are the "genes" of the persona.
- CONSCIENTIOUSNESS: High=Meticulous/reads everything; Low=Chaotic/skips details.
- NEUROTICISM: High=Risk-averse/anxious about contract traps; Low=Bold/adventuresome.
- COGNITIVE REFLEX: 0=System 1 (Emotional/Gut); 100=System 2 (Calculative/Unit Economics).
- DISTRIBUTION: Ensure the 3 personas represent a spectrum across these variables.
- REALISM: Ages, occupations, and goals must match the description.
- AESTHETIC DNA: Define their design taste.

Return ONLY valid JSON without explanatory text or markdown code blocks.`;

    const user = `Create 3 diverse personas for: "${personaDescription}". Ensure different financial profiles and tech fluency.`;

    const content = await this.llmService.createChatCompletion(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      {
        model: this.llmService.smallTextModel,
        temperature: 0.7,
        purpose: "Generate Personas",
      },
    );

    const cleaned = stripCodeFence(content);
    try {
      const parsed = JSON.parse(cleaned);
      if (!Array.isArray(parsed))
        throw new Error("Expected JSON array from LLM");

      // Deterministically pick neutral, curated names from GENDERLESS_NAMES so the LLM
      // does not invent potentially biased names on the fly. We seed the shuffle
      // with the personaDescription so the same input yields stable name assignments.
      const seedFrom = (s: string) => {
        let h = 2166136261 >>> 0;
        for (let i = 0; i < s.length; i++) {
          h ^= s.charCodeAt(i);
          h = Math.imul(h, 16777619);
        }
        return h >>> 0;
      };

      const mulberry32 = (a: number) => () => {
        a |= 0;
        a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };

      const seededShuffle = (arr: string[], seed: number) => {
        const copy = arr.slice();
        const rnd = mulberry32(seed);
        for (let i = copy.length - 1; i > 0; i--) {
          const j = Math.floor(rnd() * (i + 1));
          [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
      };

      const seed = seedFrom(personaDescription || "");
      const chosenNames = seededShuffle(GENDERLESS_NAMES, seed);

      return parsed.map(
        (p: Record<string, unknown>, idx: number) =>
          ({
            id:
              (p.id as string) ??
              (p.uuid as string) ??
              `persona-${idx}`,
            // Use the curated list of genderless, culture-neutral names (chosenNames) so
            // the LLM does not invent ad-hoc names. Assign deterministically from the pool.
            name: chosenNames[idx % chosenNames.length] ?? "Persona",
            age:
              typeof p.age === "number"
                ? p.age
                : Number(p.age) || 30,
            occupation: (p.occupation as string) ?? "Unknown",
            educationLevel:
              (p.educationLevel as string) ?? (p.education as string) ?? "Unknown",
            interests: Array.isArray(p.interests)
              ? (p.interests as string[])
              : p.interests
                ? [p.interests as string]
                : [],
            goals: Array.isArray(p.goals)
              ? (p.goals as string[])
              : p.goals
                ? [p.goals as string]
                : [],
            personalityTraits: Array.isArray(p.personalityTraits)
              ? (p.personalityTraits as string[])
              : p.traits && Array.isArray(p.traits)
                ? (p.traits as string[])
                : [],
            conscientiousness: Number(p.conscientiousness) || 50,
            neuroticism: Number(p.neuroticism) || 50,
            openness: Number(p.openness) || 50,
            extraversion: Number(p.extraversion) || 50,
            agreeableness: Number(p.agreeableness) || 50,
            cognitiveReflex: Number(p.cognitiveReflex) || 50,
            technicalFluency: Number(p.technicalFluency) || 50,
            economicSensitivity: Number(p.economicSensitivity) || 50,
            designStyle: (p.designStyle as string) ?? "Minimalist",
            livingEnvironment: (p.livingEnvironment as string) ?? "Unknown",
            backstory: (p.backstory as string) ?? (p.story as string) ?? undefined,
          }) as Persona,
      );
    } catch (err) {
      throw new Error(
        `Failed to parse personas from LLM response: ${err}\nResponse was: ${cleaned}`,
      );
    }
  }

  /**
   * Streaming version of generateInitialPersonas using Vercel AI SDK's streamObject.
   */
  async * generateInitialPersonasStream(personaDescription: string): AsyncIterable<Partial<Persona>[]> {
    const system = `You are a persona generator creating realistic buyer personas for SaaS pricing evaluation.
Generate a JSON array of 3 DISTINCT personas matching this TypeScript interface:
interface Persona {
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
  designStyle: string;       // e.g. Minimalist, Industrial, Mid-Century Modern
  livingEnvironment: string; // Describe their messy/organized home or office
}
CRITICAL REQUIREMENTS:
- SCIENTIFIC ROOT CAUSES: Assign high-fidelity scalars (0-100) for the Big Five and Cognitive Reflex. These are the "genes" of the persona.
- CONSCIENTIOUSNESS: High=Meticulous/reads everything; Low=Chaotic/skips details.
- NEUROTICISM: High=Risk-averse/anxious about contract traps; Low=Bold/adventuresome.
- COGNITIVE REFLEX: 0=System 1 (Emotional/Gut); 100=System 2 (Calculative/Unit Economics).
- DISTRIBUTION: Ensure the 3 personas represent a spectrum across these variables.
- REALISM: Ages, occupations, and goals must match the description.
- AESTHETIC DNA: Define their design taste.
Return ONLY valid JSON without explanatory text or markdown code blocks.`;

    const { partialOutputStream } = streamText({
      model: this.llmService.provider(this.llmService.smallTextModel),
      output: Output.array({
        element: PersonaSchema,
      }),
      system,
      prompt: `Create 3 diverse personas for: "${personaDescription}". Ensure different financial profiles and tech fluency.`,
    });

    if (!partialOutputStream) {
      throw new Error("partialOutputStream is not available. Ensure the model supports tool calling/structured output.");
    }

    for await (const partialArray of partialOutputStream) {
      yield partialArray as Partial<Persona>[];
    }
  }

  /**
   * Generates an extremely detailed and long backstory for a persona.
   */
  async generatePersonaBackstory(
    personaOrDescription: string | Persona,
    onProgress?: (part: number, totalParts: number) => void,
  ): Promise<string> {
    const totalParts = 4;
    let completedParts = 0;
    const personaText = typeof personaOrDescription === "string" ? personaOrDescription : JSON.stringify(personaOrDescription);

    const system = `You are a narrative psychologist conducting a deep interview to build a comprehensive life story of a buyer persona.
Your task: Build a RICH, LENGTHY, INTERNALLY CONSISTENT interview-style backstory (8000+ tokens) that reveals:
1. Childhood and family influences on their relationship with money
2. Educational background and early career lessons
3. Detailed financial journey: wins, failures, lessons learned
4. Past purchasing decisions and how they shaped them
5. Major life events that changed their worldview
6. Current economic pressures and opportunities
7. How they evaluate ROI on tools and services
8. Specific examples of successful and failed purchases
9. Values around efficiency, risk, and spending
10. Communication style and decision-making pace
11. Design Taste: Their preferred aesthetic (Minimalist, Brutalist, etc.) and a description of their living/working environment (Is it messy? Hyper-organized? Sterile? Cozy?). Describe how this environment reflects their personality scalars.

CRITICAL REQUIREMENTS (Deep Binding research):
- Write 8-12 substantial paragraphs, each 150-250 words
- MULTI-TURN DEPTH: This is an extended interview, not a summary
- CONSISTENCY: Every detail aligns with established facts. Reference earlier points.
- SPECIFICITY: Actual dollar amounts, brand names, company names, real scenarios
- AUTHENTICITY: First-person voice. Natural language.
- CAUSE-AND-EFFECT: Show HOW their life experiences led to their specific psychological profile. 
- PSYCHOLOGICAL ANCHORING: Their narrative MUST explain their Root Causes. 
  * If they have High Neuroticism, describe the specific loss or anxiety that caused it. 
  * If they are Low Conscientiousness, show their history of skipping details and the consequences.
  * Their decision-making pace and tone MUST match their Cognitive Reflex (System 1 vs. System 2).
This should feel like a real person's actual life story—messy, detailed, with depth.
Return plain text only. No labels, no markdown, no metadata. NO SUMMARIES OR HEADERS.`;

    const part1 = await this.llmService.createChatCompletion(
      [
        { role: "system", content: system },
        {
          role: "user",
          content: `Generate the first 2-3 paragraphs of a detailed backstory for this persona. Focus on their childhood, family, early financial lessons, and education:
${personaText}
Start the life story from the beginning. Write in first person. Be specific with names, places, and amounts.`,
        },
      ],
      { purpose: "Backstory Part 1" },
    );
    onProgress?.(++completedParts, totalParts);

    const part2 = await this.llmService.createChatCompletion(
      [
        { role: "system", content: system },
        {
          role: "user",
          content: `Continue this persona's backstory.\nPREVIOUS HISTORY:\n${part1}\nNow write 2-3 paragraphs about their career progression, job changes, financial wins and failures. Include specific companies, roles, and amounts of money. Show how each experience shaped their current approach to spending and evaluating tools.`,
        },
      ],
      { purpose: "Backstory Part 2" },
    );
    onProgress?.(++completedParts, totalParts);

    const part3 = await this.llmService.createChatCompletion(
      [
        { role: "system", content: system },
        {
          role: "user",
          content: `Continue this persona's backstory.\nPREVIOUS HISTORY:\n${part1}\n${part2}\nNow write 2-3 paragraphs about recent years and current situation. Include:\n- A specific "Purchasing Trauma" (a time they were scammed, locked into a bad contract, or lost substantial money on a tool). This will be their primary trigger.\n- Specific purchasing decisions they made recently.\n- Current financial pressures and opportunities.`,
        },
      ],
      { purpose: "Backstory Part 3" },
    );
    onProgress?.(++completedParts, totalParts);

    const part4 = await this.llmService.createChatCompletion(
      [
        { role: "system", content: system },
        {
          role: "user",
          content: `Finish this persona's backstory.\nPREVIOUS HISTORY:\n${part1}\n${part2}\n${part3}\nNow write 2-3 final paragraphs that:\n- Describe their physical world: their home or office and their design taste. Explain how their conscientiousness (or lack thereof) manifests in their environment.\n- Articulate their core values around money, efficiency, and risk based on their entire life history.\n- Explain how they evaluate ROI on new tools.\n- Describe their decision-making pace (tied to their Cognitive Reflex and Neuroticism).\n- End with their current mindset.`,
        },
      ],
      { purpose: "Backstory Part 4" },
    );
    onProgress?.(++completedParts, totalParts);

    return [part1, part2, part3, part4].map(p => stripCodeFence(p).trim()).join("\n\n");
  }

  /**
   * Streaming version of generatePersonaBackstory.
   */
  async * generatePersonaBackstoryStream(personaOrDescription: Persona | string): AsyncIterable<string> {
    const personaText = typeof personaOrDescription === "string" ? personaOrDescription : JSON.stringify(personaOrDescription);
    const system = `You are a narrative psychologist conducting a deep interview to build a comprehensive life story of a buyer persona.
Your task: Build a RICH, LENGTHY, INTERNALLY CONSISTENT interview-style backstory (8000+ tokens) that reveals:
1. Childhood and family influences on their relationship with money
2. Educational background and early career lessons
3. Detailed financial journey: wins, failures, lessons learned
4. Past purchasing decisions and how they shaped them
5. Major life events that changed their worldview
6. Current economic pressures and opportunities
7. How they evaluate ROI on tools and services
8. Specific examples of successful and failed purchases
9. Values around efficiency, risk, and spending
10. Communication style and decision-making pace
11. Design Taste: Their preferred aesthetic (Minimalist, Brutalist, etc.) and a description of their living/working environment (Is it messy? Hyper-organized? Sterile? Cozy?). Describe how this environment reflects their personality scalars.
CRITICAL REQUIREMENTS (Deep Binding research):
- Write 8-12 substantial paragraphs, each 150-250 words
- MULTI-TURN DEPTH: This is an extended interview, not a summary
- CONSISTENCY: Every detail aligns with established facts. Reference earlier points.
- SPECIFICITY: Actual dollar amounts, brand names, company names, real scenarios
- AUTHENTICITY: First-person voice. Natural language.
- CAUSE-AND-EFFECT: Show HOW their life experiences led to their specific psychological profile. 
- PSYCHOLOGICAL ANCHORING: Their narrative MUST explain their Root Causes. 
  * If they have High Neuroticism, describe the specific loss or anxiety that caused it. 
  * If they are Low Conscientiousness, show their history of skipping details and the consequences.
  * Their decision-making pace and tone MUST match their Cognitive Reflex (System 1 vs. System 2).
This should feel like a real person's actual life story—messy, detailed, with depth.
Return plain text only. No labels, no markdown, no metadata. NO SUMMARIES OR HEADERS.`;

    let part1 = "";
    for await (const chunk of this.llmService.createChatCompletionStream(
      [
        { role: "system", content: system },
        {
          role: "user",
          content: `Generate the first 2-3 paragraphs of a detailed backstory for this persona. Focus on their childhood, family, early financial lessons, and education:
${personaText}
Start the life story from the beginning. Write in first person. Be specific with names, places, and amounts.`,
        },
      ],
      { purpose: "Backstory Part 1 (Stream)" },
    )) {
      part1 += chunk;
      yield chunk;
    }
    yield "\n\n";

    let part2 = "";
    for await (const chunk of this.llmService.createChatCompletionStream(
      [
        { role: "system", content: system },
        {
          role: "user",
          content: `Continue this persona's backstory.\nPREVIOUS HISTORY:\n${part1}\nNow write 2-3 paragraphs about their career progression, job changes, financial wins and failures. Include specific companies, roles, and amounts of money. Show how each experience shaped their current approach to spending and evaluating tools.`,
        },
      ],
      { purpose: "Backstory Part 2 (Stream)" },
    )) {
      part2 += chunk;
      yield chunk;
    }
    yield "\n\n";

    let part3 = "";
    for await (const chunk of this.llmService.createChatCompletionStream(
      [
        { role: "system", content: system },
        {
          role: "user",
          content: `Continue this persona's backstory.\nPREVIOUS HISTORY:\n${part1}\n${part2}\nNow write 2-3 paragraphs about recent years and current situation. Include:\n- A specific "Purchasing Trauma" (a time they were scammed, locked into a bad contract, or lost substantial money on a tool). This will be their primary trigger.\n- Specific purchasing decisions they made recently.\n- Current financial pressures and opportunities.`,
        },
      ],
      { purpose: "Backstory Part 3 (Stream)" },
    )) {
      part3 += chunk;
      yield chunk;
    }
    yield "\n\n";

    for await (const chunk of this.llmService.createChatCompletionStream(
      [
        { role: "system", content: system },
        {
          role: "user",
          content: `Finish this persona's backstory.\nPREVIOUS HISTORY:\n${part1}\n${part2}\n${part3}\nNow write 2-3 final paragraphs that:\n- Describe their physical world: their home or office and their design taste. Explain how their conscientiousness (or lack thereof) manifests in their environment.\n- Articulate their core values around money, efficiency, and risk based on their entire life history.\n- Explain how they evaluate ROI on new tools.\n- Describe their decision-making pace (tied to their Cognitive Reflex and Neuroticism).\n- End with their current mindset.`,
        },
      ],
      { purpose: "Backstory Part 4 (Stream)" },
    )) {
      yield chunk;
    }
  }

  /**
   * Generates a shorter, abbreviated backstory in a single LLM call.
   */
  async generateAbbreviatedBackstory(personaOrDescription: Persona | string): Promise<string> {
    const personaText = typeof personaOrDescription === "string" ? personaOrDescription : JSON.stringify(personaOrDescription);
    const system = this.getAbbreviatedBackstorySystemPrompt();

    return await this.llmService.createChatCompletion(
      [
        { role: "system", content: system },
        { role: "user", content: `Generate a rich but concise backstory for this persona:\n${personaText}` },
      ],
      { purpose: "Abbreviated Backstory" },
    );
  }

  /**
   * Streaming version of abbreviated backstory.
   */
  async * generateAbbreviatedBackstoryStream(personaOrDescription: Persona | string): AsyncIterable<string> {
    const personaText = typeof personaOrDescription === "string" ? personaOrDescription : JSON.stringify(personaOrDescription);
    const system = this.getAbbreviatedBackstorySystemPrompt();

    yield* this.llmService.createChatCompletionStream(
      [
        { role: "system", content: system },
        { role: "user", content: `Generate a rich but concise backstory for this persona:\n${personaText}` },
      ],
      { purpose: "Abbreviated Backstory (Stream)" },
    );
  }

  /**
   * Generates a sharp, 2-sentence 'AI Insight' into a persona's primary motivation 
   * and their biggest psychological barrier to conversion.
   */
  async generatePersonaInsight(persona: Persona): Promise<string> {
    const system = `You are a behavioral psychologist. Analyze this persona's profile and backstory 
to provide a sharp, 2-sentence 'AI Insight' into their primary motivation 
and their biggest psychological barrier to conversion. 
Speak with professional authority and deep empathy.`;

    const user = `Analyze this persona:
${JSON.stringify(persona, null, 2)}

Provide a 2-sentence insight.`;

    return await this.llmService.createChatCompletion(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      {
        model: this.llmService.smallTextModel,
        temperature: 0.5,
        purpose: "Generate Persona Insight",
      },
    );
  }

  private getAbbreviatedBackstorySystemPrompt(): string {
    return `You are a narrative psychologist building a concise but RICH life story of a buyer persona.
Build a 3-5 paragraph "Mini-Biography" (approx 800-1200 tokens) that covers:
1. Childhood and family influences on money and risk.
2. Career journey and a specific "Purchasing Trauma" (a bad deal or lost money).
3. Current worldview, ROI evaluation style, and design taste.

CONCISE REQUIREMENTS:
- Speak in FIRST PERSON. Natural, blunt language.
- SPECIFICITY: Mention real roles, names, and dollar amounts.
- PSYCHOLOGICAL BINDING: Anchor their story to their scalars (Neuroticism, Conscientiousness, Cognitive Reflex).
- DESIGN DNA: Briefly describe their living/office environment and design aesthetic.

Return plain text only. No headers, labels, or markdown.`;
  }
}

