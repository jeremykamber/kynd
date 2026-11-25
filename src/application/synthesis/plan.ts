import type { ArtifactSynthesis, Disagreement, SynthesizedFinding } from '@/domain/entities/ArtifactSynthesis';
import type { ClaimGroup, ClaimLedger } from '@/domain/entities/PersonaClaim';
import type { SynthesisDraft, SynthesisPlan } from '@/domain/entities/SynthesisPlan';

/**
 * A finding needs two distinct personas for a cohort of five or fewer, and
 * three for six or more. A one-persona cohort can use its single persona.
 */
export function findingFloor(completedCount: number): number {
  if (completedCount <= 1) return 1;
  return completedCount <= 5 ? 2 : 3;
}

function byCohortWeight(a: ClaimGroup, b: ClaimGroup): number {
  return b.personaCount - a.personaCount || b.supports - a.supports || a.topic.localeCompare(b.topic);
}

/**
 * Selects groups, not prose. The plan is the only input the writer receives;
 * it contains no raw transcript, so a count or quotation cannot be invented.
 */
export function buildSynthesisPlan(input: {
  researchQuestion: string;
  ledger: ClaimLedger;
  profile?: SynthesisPlan['profile'];
  personaNames?: string[];
}): SynthesisPlan {
  const { ledger } = input;
  const floor = findingFloor(ledger.completedCount);
  const findings = ledger.groups
    .filter((group) => group.personaCount >= floor)
    .sort(byCohortWeight);
  const splits = ledger.groups
    .filter((group) => group.supports > 0 && group.opposes > 0)
    .sort(byCohortWeight);
  const frictions = ledger.groups
    .filter((group) => group.opposes >= 2)
    .sort(byCohortWeight);

  return {
    researchQuestion: input.researchQuestion,
    ...(input.profile ? { profile: input.profile } : {}),
    ledger,
    findings,
    splits,
    frictions,
    completedCount: ledger.completedCount,
    failedCount: ledger.failedCount,
    totalPersonaCount: ledger.totalPersonaCount,
    ...(input.personaNames ? { personaNames: input.personaNames } : {}),
  };
}

/**
 * The writer receives verified claims and counts, never the rejected set and
 * never persona names. The validator still uses the full plan.
 */
export function planForWriter(plan: SynthesisPlan): SynthesisPlan {
  const { personaNames: _personaNames, ...rest } = plan;
  return {
    ...rest,
    ledger: { ...plan.ledger, rejectedClaims: [] },
  };
}

function confidenceFor(personaCount: number, completedCount: number): SynthesizedFinding['confidence'] {
  const ratio = completedCount > 0 ? personaCount / completedCount : 0;
  if (ratio >= 0.75) return 'strongly supported';
  if (ratio >= 0.4) return 'some support';
  return 'weakly supported';
}

function significanceFor(supports: number, opposes: number, completedCount: number): Disagreement['significance'] {
  const minority = completedCount > 0 ? Math.min(supports, opposes) / completedCount : 0;
  if (minority >= 0.4) return 'High';
  if (minority >= 0.2) return 'Medium';
  return 'Low';
}

/** Fills the draft's wording into code-owned counts, citations, and splits. */
export function buildArtifactSynthesis(plan: SynthesisPlan, draft: SynthesisDraft): ArtifactSynthesis {
  const draftFindings = new Map<string, SynthesisDraft['findings'][number]>();
  for (const finding of draft.findings ?? []) {
    if (finding && typeof finding.groupId === 'string' && !draftFindings.has(finding.groupId)) {
      draftFindings.set(finding.groupId, finding);
    }
  }
  const draftSplits = new Map<string, SynthesisDraft['disagreements'][number]>();
  for (const split of draft.disagreements ?? []) {
    if (split && typeof split.groupId === 'string' && !draftSplits.has(split.groupId)) {
      draftSplits.set(split.groupId, split);
    }
  }
  const draftFrictions = new Map<string, string>();
  for (const friction of draft.frictions ?? []) {
    if (friction && typeof friction.groupId === 'string' && !draftFrictions.has(friction.groupId)) {
      draftFrictions.set(friction.groupId, String(friction.text ?? '').trim());
    }
  }

  // A missing finding is allowed: code can state the verified group without
  // the writer's wording, and a known group is never silently dropped.
  const topFindings: SynthesizedFinding[] = plan.findings.map((group) => {
    const written = draftFindings.get(group.id);
    const evidence = group.citations[0]?.quote ?? group.topic;
    return {
      observation: written?.observation?.trim() || group.topic,
      evidence,
      impact: written?.impact?.trim() || '',
      confidence: confidenceFor(group.personaCount, plan.completedCount),
      affectedPersonaCount: group.personaCount,
      totalPersonaCount: plan.completedCount,
      ...(group.citations.length > 0 ? { citations: group.citations } : {}),
      groupId: group.id,
    };
  });

  // The split always sums to the completed count. Neutral claims and personas
  // with no claim on the topic are reported as `No clear view` rather than
  // vanishing from the bar.
  const disagreements: Disagreement[] = plan.splits.map((group) => {
    const written = draftSplits.get(group.id);
    const noClearView = Math.max(0, plan.completedCount - group.supports - group.opposes);
    return {
      topic: group.topic,
      split: [
        { view: written?.supportsLabel?.trim() || 'Supports', personaCount: group.supports },
        { view: written?.opposesLabel?.trim() || 'Opposes', personaCount: group.opposes },
        { view: 'No clear view', personaCount: noClearView },
      ],
      significance: significanceFor(group.supports, group.opposes, plan.completedCount),
      groupId: group.id,
    };
  });

  // One friction per plan group, in plan order, so a validator warning can
  // address the same index the reader sees.
  const frictions = plan.frictions.map((group) => draftFrictions.get(group.id) || group.topic);

  return {
    overview: String(draft.overview ?? '').trim(),
    researchQuestionAnswer: String(draft.researchQuestionAnswer ?? '').trim(),
    topFindings,
    disagreements,
    biggestFrictions: frictions,
    completedCount: plan.completedCount,
    failedCount: plan.failedCount,
    totalPersonaCount: plan.totalPersonaCount,
    verdicts: plan.ledger.verdicts,
    claimGroups: plan.ledger.groups,
    facts: plan.profile?.facts ?? [],
    ...(plan.profile ? { contentKind: plan.profile.contentKind } : {}),
    degraded: plan.ledger.degraded,
    missingClaimPersonaIds: plan.ledger.missingClaimPersonaIds,
  };
}
