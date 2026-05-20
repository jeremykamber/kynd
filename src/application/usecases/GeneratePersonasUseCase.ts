import { Persona } from "@/domain/entities/Persona";
import { LlmServicePort } from "../../domain/ports/LlmServicePort";

export type PersonaGenerationProgressStep =
    | 'BRAINSTORMING_PERSONAS'
    | 'GENERATING_BACKSTORIES'
    | 'ENHANCING_WITH_PBJ'
    | 'GENERATING_INSIGHTS'
    | 'DONE'
    | 'ERROR';

export interface PersonaGenerationProgress {
    step: PersonaGenerationProgressStep;
    personaName?: string;
    completedCount?: number;
    totalCount?: number;
    completedSubSteps?: number;
    totalSubSteps?: number;
    error?: string;
    personas?: Persona[];
    streamingText?: string; // For live UI feedback
}

export class GeneratePersonasUseCase {
    private static readonly ABBREVIATE_BACKSTORIES = true; // Toggle this for fast testing

    constructor(private llmService: LlmServicePort) { }

    async execute(
        personaDescription: string,
        onProgress?: (progress: PersonaGenerationProgress) => void
    ): Promise<Persona[]> {
        console.log("Executing GeneratePersonas use case");

        // Stream structured personas directly
        let partialPersonas: Partial<Persona>[] = [];
        for await (const partialArray of this.llmService.generateInitialPersonasStream(personaDescription)) {
            partialPersonas = partialArray;
            // Snapshot the partial personas to prevent proxy/serialization issues
            const snapshot = JSON.parse(JSON.stringify(partialPersonas));
            onProgress?.({
                step: 'BRAINSTORMING_PERSONAS',
                personas: snapshot,
                streamingText: JSON.stringify(snapshot, null, 2)
            });
        }

        // Finalize personas (ensure they are fully formed)
        // Deep clone to strip any AI SDK proxy objects before further processing
        let personas: Persona[] = JSON.parse(JSON.stringify(partialPersonas));

        // Safety check: if stream yielded nothing or empty, fallback
        if (!personas || personas.length === 0) {
            console.warn("Stream yielded no personas, falling back to legacy generation");
            personas = await this.llmService.generateInitialPersonas(personaDescription);
        }

        const abbreviate = GeneratePersonasUseCase.ABBREVIATE_BACKSTORIES;
        const subStepsPerPersona = abbreviate ? 1 : 4;

        // Broadcast initial personas immediately for UI responsiveness
        onProgress?.({
            step: 'GENERATING_BACKSTORIES',
            personas,
            totalCount: personas.length,
            completedCount: 0,
            totalSubSteps: personas.length * subStepsPerPersona,
            completedSubSteps: 0,
            streamingText: ""
        });

        const totalCount = personas.length;
        const totalSubSteps = totalCount * subStepsPerPersona;

        // OPTIMIZATION: Use batch generation instead of per-persona calls
        // This reduces 3 LLM calls to 1 for backstories
        console.log("[GeneratePersonasUseCase] Generating batch backstories...");
        onProgress?.({
            step: 'GENERATING_BACKSTORIES',
            personas,
            totalCount,
            completedCount: 0,
            totalSubSteps,
            completedSubSteps: 0,
        });

        const backstoryTexts = await (this.llmService as any).generateAbbreviatedBackstoriesBatch(personas);
        personas.forEach((persona, i) => {
            persona.backstory = backstoryTexts[i];
        });
        
        onProgress?.({
            step: 'GENERATING_BACKSTORIES',
            completedCount: totalCount,
            totalCount,
            completedSubSteps: totalSubSteps,
            totalSubSteps,
            personas: JSON.parse(JSON.stringify(personas))
        });

        // Phase 3: PB&J Rationalization — causally connect Big Five to psychographics
        // Joshi et al. (2025): improves persona alignment by 6-9% over backstory-only
        console.log("[GeneratePersonasUseCase] Enhancing personas with PB&J psychological rationales...");
        onProgress?.({
            step: 'ENHANCING_WITH_PBJ',
            personas: JSON.parse(JSON.stringify(personas)),
            totalCount,
            completedCount: 0,
        });

        personas = await (this.llmService as any).enhancePersonasWithPbj(personas);
        console.log("[GeneratePersonasUseCase] PB&J enhancement complete for all personas");

        // Phase 4: Generate AI Insights (BATCH - single LLM call instead of 3)
        console.log("[GeneratePersonasUseCase] Generating batch AI Insights...");
        onProgress?.({
            step: 'GENERATING_INSIGHTS',
            personas: JSON.parse(JSON.stringify(personas)),
            totalCount,
            completedCount: 0,
        });

        const insightTexts = await (this.llmService as any).generatePersonaInsightsBatch(personas);
        personas.forEach((persona, i) => {
            persona.aiInsight = insightTexts[i];
        });

        onProgress?.({
            step: 'GENERATING_INSIGHTS',
            completedCount: totalCount,
            totalCount,
            personas: JSON.parse(JSON.stringify(personas))
        });

        return personas;
    }
}

