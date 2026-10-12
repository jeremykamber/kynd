import type { Persona } from '@/domain/entities/Persona'
import { generateBatchTitleAction } from '@/actions/generateBatchTitleAction'

/** Longest label a user's own description is allowed to produce. */
const LABEL_MAX_LENGTH = 60

/**
 * The label a description-sourced batch carries: the user's own words, cut on a
 * word boundary.
 *
 * Exported because naming is the one thing two observers of the same run cannot
 * both know: whichever of them writes the batch row first, only the page that
 * submitted the run holds the description, so that page applies this label
 * afterwards rather than letting a generic fallback stand.
 */
export function batchLabelFromDescription(description: string, fallback: string): string {
    const collapsed = description.replace(/\s+/g, ' ').trim()
    if (!collapsed) return fallback
    if (collapsed.length <= LABEL_MAX_LENGTH) return collapsed

    // Cut on a word boundary and mark it: a shortened label must read as
    // shortened, not as a strangely terse sentence.
    const cut = collapsed.slice(0, LABEL_MAX_LENGTH)
    const lastSpace = cut.lastIndexOf(' ')
    const head = (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.!?-]+$/, '')
    return `${head}…`
}

/**
 * Names a batch at creation time.
 *
 * A description batch is named from the description that produced it: the same
 * words the user typed, cut on a word boundary. It used to be named by the
 * model from the personas it had just written, which could produce a title with
 * nothing in common with the brief the user submitted while the row still said
 * "from description".
 *
 * Interview batches have no single user text to borrow from, so there the model
 * still names the batch from the personas.
 */
export async function resolveBatchLabel(
    fallback: string,
    personas: Persona[],
    context: {
        source?: 'description' | 'interviews';
        description?: string;
        transcriptCount?: number;
    } = {},
): Promise<string> {
    const { source, description, transcriptCount } = context

    if (source !== 'interviews') {
        return batchLabelFromDescription(description ?? '', fallback)
    }

    try {
        const { title } = await generateBatchTitleAction(personas, { source, description, transcriptCount })
        if (title && title.trim()) return title.trim()
    } catch {
        // fall through to the caller's label
    }
    return fallback
}
