import { Persona } from "@/domain/entities/Persona";
import { LlmServicePort } from "../../domain/ports/LlmServicePort";

export type PersonaGenerationProgressStep =
    | 'BRAINSTORMING_PERSONAS'
    | 'GENERATING_BACKSTORIES'
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
        let completedCount = 0;
        let completedSubSteps = 0;
        const totalSubSteps = totalCount * subStepsPerPersona;

        const pLimit = (await import('p-limit')).default;
        const limit = pLimit(2); // Generate 2 backstories in parallel

        await Promise.all(personas.map((persona) => limit(async () => {
            onProgress?.({
                step: 'GENERATING_BACKSTORIES',
                personaName: persona.name,
                completedCount,
                totalCount,
                completedSubSteps,
                totalSubSteps,
                personas: JSON.parse(JSON.stringify(personas)),
                streamingText: ""
            });

            console.log(`[GeneratePersonasUseCase] Generating ${abbreviate ? 'abbreviated ' : ''}backstory for ${persona.name}...`);

            const backstory = abbreviate
                ? await this.llmService.generateAbbreviatedBackstory(persona)
                : await this.llmService.generatePersonaBackstory(persona);

            console.log(`[GeneratePersonasUseCase] Completed backstory for ${persona.name}`);

            persona.backstory = backstory;
            completedCount++;
            completedSubSteps += subStepsPerPersona;

            onProgress?.({
                step: 'GENERATING_BACKSTORIES',
                completedCount,
                totalCount,
                completedSubSteps,
                totalSubSteps,
                personas: JSON.parse(JSON.stringify(personas))
            });
        })));

        // Phase 3: Generate AI Insights
        console.log("[GeneratePersonasUseCase] Generating AI Insights...");
        onProgress?.({
            step: 'GENERATING_INSIGHTS',
            personas: JSON.parse(JSON.stringify(personas)),
            totalCount,
            completedCount: 0,
        });

        completedCount = 0;
        await Promise.all(personas.map((persona) => limit(async () => {
            console.log(`[GeneratePersonasUseCase] Generating AI Insight for ${persona.name}...`);
            const insight = await this.llmService.generatePersonaInsight(persona);
            persona.aiInsight = insight;
            completedCount++;
            onProgress?.({
                step: 'GENERATING_INSIGHTS',
                completedCount,
                totalCount,
                personas: JSON.parse(JSON.stringify(personas))
            });
        })));

        return personas;
    }
}

