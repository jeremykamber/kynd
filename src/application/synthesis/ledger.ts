import type {
  ClaimLedger,
  ClaimGroup,
  ClaimStance,
  ClaimSupport,
  PersonaClaim,
  SupportLevel,
} from '@/domain/entities/PersonaClaim';
import { CLAIM_STANCES, SUPPORT_LEVELS } from '@/domain/entities/PersonaClaim';
import type { Verdict } from '@/domain/entities/Verdict';
import { emptyVerdictCounts, normalizeVerdict } from '@/domain/entities/Verdict';
import type { DecisionRole } from '@/domain/entities/DecisionRole';

export interface LedgerResponse {
  personaId: string;
  personaName: string;
  transcript: string;
  claims?: Array<PersonaClaim & { id?: string }>;
  verdict?: Verdict | string;
  decisionRole?: DecisionRole;
  occupation?: string;
}

export interface BuildClaimLedgerInput {
  responses: LedgerResponse[];
  supports: ClaimSupport[];
  clusters: Array<{ topic: string; claimIds: string[] }>;
  failedCount: number;
  totalPersonaCount: number;
  degraded?: string[];
}

interface ClaimWithPersona {
  claim: PersonaClaim;
  personaName: string;
  transcript: string;
  decisionRole?: DecisionRole;
  occupation?: string;
}

function isClaimStance(value: unknown): value is ClaimStance {
  return typeof value === 'string' && (CLAIM_STANCES as readonly string[]).includes(value);
}

/** A support level a model returned; anything else is treated as absent. */
function asSupportLevel(value: unknown): SupportLevel | null {
  return typeof value === 'string' && (SUPPORT_LEVELS as readonly string[]).includes(value)
    ? (value as SupportLevel)
    : null;
}

/**
 * Reads each response's claim pass, assigns code-owned ids, and keeps only
 * quotations that are exact substrings of that persona's monologue. A
 * paraphrase cannot count even when the model marked it as support.
 */
export function collectVerbatimClaims(responses: LedgerResponse[]): {
  kept: ClaimWithPersona[];
  rejected: ClaimLedger['rejectedClaims'];
  missingClaimPersonaIds: string[];
} {
  const kept: ClaimWithPersona[] = [];
  const rejected: ClaimLedger['rejectedClaims'] = [];
  const missingClaimPersonaIds: string[] = [];

  for (const response of responses) {
    if (!response.claims || response.claims.length === 0) {
      missingClaimPersonaIds.push(response.personaId);
      continue;
    }

    response.claims.forEach((raw, index) => {
      const claim: PersonaClaim = {
        id: raw.id ?? `${response.personaId}:${index}`,
        personaId: response.personaId,
        topic: String(raw.topic ?? '').trim(),
        observation: String(raw.observation ?? '').trim(),
        stance: isClaimStance(raw.stance) ? raw.stance : 'neutral',
        quote: String(raw.quote ?? ''),
        ...(raw.stage ? { stage: raw.stage } : {}),
      };

      if (!claim.topic || !claim.observation) {
        rejected.push({
          claim,
          level: 'unsupported',
          reason: 'The claim has no topic or observation.',
        });
        return;
      }
      if (!claim.quote || !response.transcript.includes(claim.quote)) {
        rejected.push({
          claim,
          level: 'unsupported',
          reason: 'The quotation is not a verbatim substring of the monologue.',
        });
        return;
      }
      kept.push({
        claim,
        personaName: response.personaName,
        transcript: response.transcript,
        ...(response.decisionRole ? { decisionRole: response.decisionRole } : {}),
        ...(response.occupation ? { occupation: response.occupation } : {}),
      });
    });
  }

  return { kept, rejected, missingClaimPersonaIds };
}

function groupSideCounts(claims: PersonaClaim[]): {
  supports: number;
  opposes: number;
  neutral: number;
  personaCount: number;
  winners: Map<string, PersonaClaim>;
  conflicts: string[];
} {
  const winners = new Map<string, PersonaClaim>();
  const conflicts: string[] = [];

  for (const claim of claims) {
    const previous = winners.get(claim.personaId);
    if (previous && previous.stance !== claim.stance) {
      conflicts.push(claim.personaId);
    }
    // The later claim wins by claim order. A duplicate persona is one count,
    // never two; the conflict is recorded for inspection.
    winners.set(claim.personaId, claim);
  }

  let supports = 0;
  let opposes = 0;
  let neutral = 0;
  for (const claim of winners.values()) {
    if (claim.stance === 'supports') supports++;
    else if (claim.stance === 'opposes') opposes++;
    else neutral++;
  }

  return { supports, opposes, neutral, personaCount: winners.size, winners, conflicts };
}

/**
 * Turns per-persona claims into cohort counts. Code owns every number:
 * a persona is counted once per topic even when it made several claims, and
 * only a `support` result can enter a group.
 */
export function buildClaimLedger(input: BuildClaimLedgerInput): ClaimLedger {
  const degraded = [...(input.degraded ?? [])];
  const { kept, rejected, missingClaimPersonaIds } = collectVerbatimClaims(input.responses);

  const supportByClaimId = new Map<string, ClaimSupport>();
  for (const result of input.supports) {
    const level = asSupportLevel(result.level);
    if (!level) continue;
    supportByClaimId.set(result.claimId, { ...result, level });
  }

  const supported: ClaimWithPersona[] = [];
  for (const entry of kept) {
    const support = supportByClaimId.get(entry.claim.id);
    if (!support) {
      rejected.push({
        claim: entry.claim,
        level: 'unsupported',
        reason: 'No support result was returned for this claim.',
      });
      continue;
    }
    if (support.level !== 'support') {
      rejected.push({ claim: entry.claim, level: support.level, reason: support.reason });
      continue;
    }
    supported.push(entry);
  }

  const byId = new Map(supported.map((entry) => [entry.claim.id, entry]));
  const grouped = new Map<string, ClaimWithPersona[]>();
  const groupTopics = new Map<string, string>();
  const claimedIds = new Set<string>();

  for (const cluster of input.clusters) {
    const topic = String(cluster.topic ?? '').trim();
    if (!topic) continue;
    const members: ClaimWithPersona[] = [];
    for (const claimId of cluster.claimIds ?? []) {
      if (claimedIds.has(claimId)) continue;
      const entry = byId.get(claimId);
      if (!entry) continue;
      claimedIds.add(claimId);
      members.push(entry);
    }
    if (members.length > 0) {
      const key = `cluster:${grouped.size}`;
      grouped.set(key, members);
      groupTopics.set(key, topic);
    }
  }

  // A claim the clustering pass omitted is not lost: it becomes its own group,
  // which cannot reach the finding floor but stays inspectable.
  for (const entry of supported) {
    if (claimedIds.has(entry.claim.id)) continue;
    const key = `single:${grouped.size}`;
    grouped.set(key, [entry]);
    groupTopics.set(key, entry.claim.topic);
  }

  const groups: ClaimGroup[] = [];
  let index = 0;
  for (const [key, entries] of grouped) {
    const claims = entries.map((entry) => entry.claim);
    const counts = groupSideCounts(claims);
    if (counts.conflicts.length > 0) {
      degraded.push(
        `Duplicate-persona conflict in "${groupTopics.get(key)}": ${[...new Set(counts.conflicts)].join(', ')} claimed both sides; the later claim wins.`,
      );
    }
    const usedQuotes = new Set<string>();
    const citations = [...counts.winners.values()].map((claim) => {
      // A persona can hold several supported claims in one group. Prefer a
      // quote this finding has not shown yet, so two personas who happened to
      // say the same sentence are not printed as one quote copied twice.
      const candidates = entries.filter((candidate) => candidate.claim.personaId === claim.personaId);
      const entry = candidates.find((candidate) => !usedQuotes.has(candidate.claim.quote))
        ?? candidates.find((candidate) => candidate.claim.id === claim.id)
        ?? entries[0];
      usedQuotes.add(entry.claim.quote);
      return {
        personaId: claim.personaId,
        personaName: entry.personaName,
        quote: entry.claim.quote,
        ...(entry.decisionRole ? { decisionRole: entry.decisionRole } : {}),
        ...(entry.occupation ? { occupation: entry.occupation } : {}),
      };
    });
    const firstStage = claims.find((claim) => claim.stage)?.stage;
    index++;
    groups.push({
      id: `g${index}`,
      topic: groupTopics.get(key) ?? claims[0]?.topic ?? 'Untitled topic',
      claims,
      personaCount: counts.personaCount,
      supports: counts.supports,
      opposes: counts.opposes,
      neutral: counts.neutral,
      ...(firstStage ? { stage: firstStage } : {}),
      citations,
    });
  }

  const verdicts = emptyVerdictCounts();
  for (const response of input.responses) {
    verdicts[normalizeVerdict(response.verdict)]++;
  }

  return {
    groups,
    verdicts,
    completedCount: input.responses.length,
    failedCount: input.failedCount,
    totalPersonaCount: input.totalPersonaCount,
    missingClaimPersonaIds,
    rejectedClaims: rejected,
    degraded,
  };
}
