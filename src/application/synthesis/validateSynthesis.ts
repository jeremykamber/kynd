import type { ArtifactSynthesis } from '@/domain/entities/ArtifactSynthesis';
import type { ClaimGroup } from '@/domain/entities/PersonaClaim';
import type { SynthesisPlan } from '@/domain/entities/SynthesisPlan';

export interface SynthesisViolation {
  /** `<field>: <message>`; the field tag is also used for the inline mark. */
  field: string;
  message: string;
}

const NUMBER_RE = /\d[\d,]*(?:\.\d+)?\s*%?/g;
const RECOMMENDATION_RE =
  /\byou should\b|\bwe recommend\b|\bi recommend\b|\bmy recommendation\b|\bshould (?:add|remove|lower|raise|change|improve|consider|avoid)\b/i;

/** A numbered "all" states a cohort size; "all personas" leaves it implicit. */
const ALL_COUNT_RE = new RegExp(
  `\\ball\\s+(?:of\\s+)?(?:the\\s+)?(one|two|three|four|five|six|seven|eight|nine|ten|\\d+)\\s+(?:completed\\s+)?(?:personas|users|participants|people|cohort)\\b`,
  'i',
);

interface NumberToken {
  value: number;
  /** The token carried a `%` suffix. */
  percent: boolean;
}

function numberTokens(text: string): NumberToken[] {
  const found: NumberToken[] = [];
  for (const match of text.match(NUMBER_RE) ?? []) {
    const percent = match.trim().endsWith('%');
    const value = Number(match.replace(/[,\s%]/g, ''));
    if (Number.isFinite(value)) found.push({ value, percent });
  }
  return found;
}

const COUNT_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

/** `all five` and `all 5` mean the same cohort size. */
function cohortNumber(token: string): number {
  return COUNT_WORDS[token.toLowerCase()] ?? Number(token.replace(/,/g, ''));
}

interface AllowedNumbers {
  /** Counts the ledger holds. A bare number may only be one of these. */
  counts: Set<number>;
  /** Percentages the counts derive, or the artifact states with a `%`. */
  percents: Set<number>;
}

/**
 * Numbers the writer may use without inventing anything. A count is a count
 * only when the ledger holds it; a derived percentage needs a `%` suffix, so
 * "40 personas" cannot pass as "40%". 100 is allowed only as a derived
 * percentage (a group that covers every completed persona) or when the cohort
 * actually has 100 personas.
 */
function allowedNumbers(plan: SynthesisPlan): AllowedNumbers {
  const counts = new Set<number>([plan.completedCount, plan.failedCount, plan.totalPersonaCount]);
  for (const value of Object.values(plan.ledger.verdicts)) counts.add(value);
  for (const group of plan.ledger.groups) {
    for (const count of [group.personaCount, group.supports, group.opposes, group.neutral]) {
      counts.add(count);
    }
  }

  const percents = new Set<number>();
  if (plan.completedCount > 0) {
    // Percentages derive from a group or a verdict, not from the cohort size
    // itself: 5 completed personas does not make "100%" true for a 2-persona
    // group. A fully completed cohort may say 100%.
    const derived = [
      ...plan.ledger.groups.flatMap((group) => [group.personaCount, group.supports, group.opposes, group.neutral]),
      ...Object.values(plan.ledger.verdicts),
    ];
    for (const count of derived) {
      percents.add(Math.round((count / plan.completedCount) * 100));
      percents.add(Math.floor((count / plan.completedCount) * 100));
    }
  }

  const factTexts = [
    ...(plan.profile?.facts ?? []).map((fact) => `${fact.label} ${fact.value} ${fact.sourceQuote ?? ''}`),
    ...(plan.profile?.openQuestions ?? []),
  ];
  for (const text of factTexts) {
    for (const token of numberTokens(text)) {
      if (token.percent) percents.add(token.value);
      else counts.add(token.value);
    }
  }

  return { counts, percents };
}

function checkNumbers(
  field: string,
  text: string,
  allowed: AllowedNumbers,
  violations: SynthesisViolation[],
): void {
  for (const token of numberTokens(text)) {
    const okay = token.percent ? allowed.percents.has(token.value) : allowed.counts.has(token.value);
    if (!okay) {
      const label = token.percent ? `${token.value}%` : String(token.value);
      violations.push({
        field,
        message: `states the number ${label}, which the ledger and facts do not support.`,
      });
    }
  }
}

function checkQuantifiers(
  field: string,
  text: string,
  group: ClaimGroup,
  completedCount: number,
  violations: SynthesisViolation[],
): void {
  const COUNT = '(?:one|two|three|four|five|six|seven|eight|nine|ten|\\d+)\\s+';
  const ALL = new RegExp(`\\ball\\s+(?:(?:of\\s+)?(?:the\\s+)?|${COUNT})?(?:personas|users|participants|people|cohort)\\b`, 'i');
  const MOST = new RegExp(`\\bmost\\s+(?:(?:of\\s+)?(?:the\\s+)?|${COUNT})?(?:personas|users|participants|people|cohort)\\b`, 'i');
  const NONE = /\bnone\s+of\s+(?:(?:the|\d+)\s+)*(?:personas|users|participants|people|cohort)\b|\bno\s+(?:persona|user|participant)s?\b/i;
  if (ALL.test(text) && group.personaCount !== completedCount) {
    violations.push({
      field,
      message: `says "all" for a group that ${group.personaCount} of ${completedCount} personas hold.`,
    });
  }
  if (MOST.test(text) && group.personaCount <= completedCount / 2) {
    violations.push({
      field,
      message: `says "most" for a group that ${group.personaCount} of ${completedCount} personas hold.`,
    });
  }
  if (/\b100\s*%/i.test(text) && group.personaCount !== completedCount) {
    violations.push({
      field,
      message: `says "100%" for a group that ${group.personaCount} of ${completedCount} personas hold.`,
    });
  }
  if (NONE.test(text) && group.personaCount !== 0) {
    violations.push({
      field,
      message: 'says "none" for a group that has supporting personas.',
    });
  }
}

function checkNames(
  field: string,
  text: string,
  personaNames: string[],
  violations: SynthesisViolation[],
): void {
  for (const name of personaNames) {
    if (!name || name.length < 4) continue;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(text)) {
      violations.push({ field, message: `names the persona "${name}" in aggregate prose.` });
    }
  }
}

function checkRecommendation(field: string, text: string, violations: SynthesisViolation[]): void {
  if (RECOMMENDATION_RE.test(text)) {
    violations.push({ field, message: 'makes a recommendation instead of reporting what the cohort did.' });
  }
}

/**
 * Compares the assembled synthesis with the plan. Pure code: it proves the
 * counts, splits, and citations came from the ledger, and that the writer's
 * prose stayed inside the facts. A violation names the exact field so the
 * reader can see which sentence failed.
 */
export function validateSynthesis(plan: SynthesisPlan, synthesis: ArtifactSynthesis): SynthesisViolation[] {
  const violations: SynthesisViolation[] = [];
  const allowed = allowedNumbers(plan);
  const groupsById = new Map(plan.ledger.groups.map((group) => [group.id, group]));
  const personaNames = plan.personaNames ?? [];

  checkNumbers('overview', synthesis.overview, allowed, violations);
  checkNumbers('answer', synthesis.researchQuestionAnswer, allowed, violations);
  checkRecommendation('overview', synthesis.overview, violations);
  checkRecommendation('answer', synthesis.researchQuestionAnswer, violations);
  checkNames('overview', synthesis.overview, personaNames, violations);
  checkNames('answer', synthesis.researchQuestionAnswer, personaNames, violations);
  const cohortText = `${synthesis.overview} ${synthesis.researchQuestionAnswer}`;
  // "All" means every completed persona, not every attempted persona. A
  // numbered "all" must match the completed count; "all personas" does.
  const allCount = ALL_COUNT_RE.exec(cohortText);
  if (allCount && cohortNumber(allCount[1]) !== plan.completedCount) {
    violations.push({
      field: 'overview',
      message: `says "all ${allCount[1]}" while ${plan.completedCount} of ${plan.totalPersonaCount} personas completed.`,
    });
  }
  // "All three personas hit the same wall" is a group claim in the summary.
  // It is only true when a ledger group actually covers every completed persona.
  const summaryAll = /\ball\s+(?:(?:of\s+)?(?:the\s+)?|(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+)?(?:personas|users|participants|people|cohort)\b/i;
  if (summaryAll.test(cohortText) && !plan.ledger.groups.some((g) => g.personaCount === plan.completedCount)) {
    violations.push({
      field: 'overview',
      message: `says "all" but no ledger group covers all ${plan.completedCount} completed personas.`,
    });
  }

  for (const finding of synthesis.topFindings) {
    const field = `finding:${finding.groupId ?? finding.observation.slice(0, 32)}`;
    const group = finding.groupId ? groupsById.get(finding.groupId) : undefined;
    if (!group) {
      violations.push({ field, message: 'does not come from a ledger group.' });
      continue;
    }
    if (finding.affectedPersonaCount !== group.personaCount) {
      violations.push({
        field,
        message: `counts ${finding.affectedPersonaCount} personas; the ledger holds ${group.personaCount}.`,
      });
    }
    if (finding.totalPersonaCount !== plan.completedCount) {
      violations.push({
        field,
        message: `counts out of ${finding.totalPersonaCount}; ${plan.completedCount} personas completed.`,
      });
    }
    for (const citation of finding.citations ?? []) {
      const held = group.claims.some(
        (claim) => claim.personaId === citation.personaId && claim.quote === citation.quote,
      );
      if (!held) {
        violations.push({ field, message: `cites a quotation the ledger does not hold for ${citation.personaName}.` });
      }
    }
    checkNumbers(`${field}:observation`, finding.observation, allowed, violations);
    checkNumbers(`${field}:impact`, finding.impact, allowed, violations);
    checkQuantifiers(`${field}:observation`, finding.observation, group, plan.completedCount, violations);
    checkQuantifiers(`${field}:impact`, finding.impact, group, plan.completedCount, violations);
    checkRecommendation(field, `${finding.observation} ${finding.impact}`, violations);
    checkNames(field, `${finding.observation} ${finding.impact}`, personaNames, violations);
  }

  for (const disagreement of synthesis.disagreements) {
    const field = `split:${disagreement.groupId ?? disagreement.topic.slice(0, 32)}`;
    const sum = disagreement.split.reduce((total, side) => total + side.personaCount, 0);
    if (sum !== plan.completedCount) {
      violations.push({
        field,
        message: `splits ${sum} personas; ${plan.completedCount} completed.`,
      });
    }
    const group = disagreement.groupId ? groupsById.get(disagreement.groupId) : undefined;
    for (const side of disagreement.split) {
      checkNumbers(field, side.view, allowed, violations);
      checkRecommendation(field, side.view, violations);
      checkNames(field, side.view, personaNames, violations);
      if (group) checkQuantifiers(field, side.view, group, plan.completedCount, violations);
    }
  }

  const verdictSum = Object.values(plan.ledger.verdicts).reduce((total, count) => total + count, 0);
  if (verdictSum !== plan.completedCount) {
    violations.push({
      field: 'overview',
      message: `verdict counts sum to ${verdictSum}; ${plan.completedCount} completed.`,
    });
  }

  plan.frictions.forEach((group, index) => {
    const text = synthesis.biggestFrictions[index];
    if (text === undefined) return;
    const field = `friction:${index}`;
    checkNumbers(field, text, allowed, violations);
    checkRecommendation(field, text, violations);
    checkNames(field, text, personaNames, violations);
    checkQuantifiers(field, text, group, plan.completedCount, violations);
  });

  return violations;
}

/** The field tag in a stored warning (`<field>: <message>`). */
export function warningField(warning: string): string {
  return warning.split(': ')[0];
}

/**
 * A finding's observation and impact are two sentences of one marked field;
 * counting them separately would fail a run for a single finding.
 */
function markedFieldKey(warning: string): string {
  const parts = warningField(warning).split(':');
  // Each finding is one marked field; each split and each friction keeps its
  // own identifier so two bad splits count as two.
  if (parts[0] === 'finding' && parts.length >= 2) return `finding:${parts[1]}`;
  return parts.length >= 2 ? `${parts[0]}:${parts[1]}` : parts[0];
}

/** The QA budget: at most one marked field per run. */
export function markedFieldCount(warnings: string[] | undefined): number {
  return new Set((warnings ?? []).map(markedFieldKey)).size;
}
