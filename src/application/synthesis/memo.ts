import type { SynthesisDraft, SynthesisPlan } from '@/domain/entities/SynthesisPlan';

/**
 * Variant B: build the report from persona decision memos (the claim ledger)
 * without a writer pass. Wording comes from the verified claim observations;
 * the structure is code-owned.
 */
export function buildMemoDraft(plan: SynthesisPlan): SynthesisDraft {
  const findings = plan.findings.map((group) => {
    const first = group.claims[0]?.observation ?? group.topic;
    return {
      groupId: group.id,
      observation: first,
      impact: `Test whether resolving ${group.topic.toLowerCase()} changes the decision.`,
    };
  });
  const disagreements = plan.splits.map((group) => ({
    groupId: group.id,
    supportsLabel: group.claims.find((claim) => claim.stance === 'supports')?.observation ?? 'support',
    opposesLabel: group.claims.find((claim) => claim.stance === 'opposes')?.observation ?? 'oppose',
  }));
  const frictions = plan.frictions.map((group) => ({
    groupId: group.id,
    text: group.claims.find((claim) => claim.stance === 'opposes')?.observation ?? group.topic,
  }));
  const top = findings.slice(0, 2).map((finding) => finding.observation);
  const verdicts = plan.ledger.verdicts;
  const tally = `${verdicts.adopt} adopt, ${verdicts.trial} trial, ${verdicts.reject} reject, ${verdicts.undecided} undecided`;
  return {
    overview: top.length > 0
      ? `${top.join(' ')} Verdicts: ${tally}.`
      : 'No supported finding reached the floor.',
    researchQuestionAnswer: top.length > 0
      ? `The strongest supported findings are: ${top.join(' ')} Verdicts: ${tally}.`
      : `No supported finding reached the floor. Verdicts: ${tally}.`,
    findings,
    disagreements,
    frictions,
  };
}
