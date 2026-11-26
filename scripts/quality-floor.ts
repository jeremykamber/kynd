/* eslint-disable @typescript-eslint/no-explicit-any --
 * The harness reads live pipeline JSON, so every field is checked at runtime. */
/**
 * Option C quality floor.
 *
 * Runs the real artifact pipeline against a directory of artifacts, applies the
 * structural gate to each saved run, writes one blind review context per run,
 * and (when reviews are supplied) computes the per-run median and the 8.0 floor.
 *
 * Reviewers are separate model calls. This script does not call a reviewer
 * model itself: `--reviews` merges JSON produced by the blind review step. A
 * missing review file fails the gate as "not reviewed", never as a pass.
 *
 * Usage:
 *   bun scripts/quality-floor.ts --artifacts <dir> --personas <file> --out <dir>
 *   bun scripts/quality-floor.ts --out <dir> --existing --reviews <reviews.json>
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildSynthesisPlan, findingFloor } from '@/application/synthesis/plan';
import { markedFieldCount, validateSynthesis } from '@/application/synthesis/validateSynthesis';

const FLOOR = 8;

interface ReviewScore {
  role: string;
  specificity: number;
  grounding: number;
  differentiation: number;
  actionability: number;
  notes?: string;
}

interface RunFile {
  input?: { label?: string; text?: string };
  researchQuestion?: string;
  responses?: any[];
  synthesis?: any;
  artifactProfile?: any;
  frames?: any[];
}

function parseArgs(argv: string[]): Record<string, any> {
  const args: Record<string, any> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) args[key] = true;
    else { args[key] = next; i++; }
  }
  return args;
}

export interface StructuralResult {
  run: string;
  passed: boolean;
  failures: string[];
  markedFields: number;
}

function claimLedgerFromSynthesis(run: RunFile): any {
  const synthesis = run.synthesis ?? {};
  return {
    groups: synthesis.claimGroups ?? [],
    verdicts: synthesis.verdicts ?? { adopt: 0, trial: 0, reject: 0, undecided: 0 },
    completedCount: synthesis.completedCount ?? 0,
    failedCount: synthesis.failedCount ?? 0,
    totalPersonaCount: synthesis.totalPersonaCount ?? 0,
    missingClaimPersonaIds: synthesis.missingClaimPersonaIds ?? [],
    rejectedClaims: [],
    degraded: synthesis.degraded ?? [],
  };
}

/**
 * The structural gate. A run may have at most one marked field; a missing claim
 * set counts as one. The rest are the invariants a reader must be able to trust.
 */
export function structuralFailures(run: RunFile): StructuralResult {
  const failures: string[] = [];
  const synthesis = run.synthesis;
  const responses = run.responses ?? [];

  if (!synthesis) {
    return { run: '', passed: false, failures: ['no synthesis saved'], markedFields: 0 };
  }

  const completed = Number(synthesis.completedCount ?? 0);
  const total = Number(synthesis.totalPersonaCount ?? 0);
  const missing = synthesis.missingClaimPersonaIds ?? [];
  const markedFields = markedFieldCount(synthesis.validationWarnings) + missing.length;

  if (completed === 0) failures.push('no persona completed');
  if (completed < total) failures.push(`only ${completed} of ${total} personas completed`);
  if (markedFields > 1) failures.push(`${markedFields} marked fields (at most 1 allowed)`);

  const verdictSum = Object.values(synthesis.verdicts ?? {}).reduce((sum: number, n: any) => sum + Number(n ?? 0), 0);
  if (verdictSum !== completed) failures.push(`verdicts sum to ${verdictSum}, completed ${completed}`);

  const floor = findingFloor(completed);
  for (const [index, finding] of (synthesis.topFindings ?? []).entries()) {
    if (Number(finding.affectedPersonaCount) < floor) {
      failures.push(`finding ${index} counts ${finding.affectedPersonaCount}, floor ${floor}`);
    }
    for (const citation of finding.citations ?? []) {
      const source = responses.find((response) => response.personaId === citation.personaId);
      if (!source) failures.push(`finding ${index} cites an unknown persona ${citation.personaId}`);
      else if (typeof source.rawAnalysis !== 'string' || !source.rawAnalysis.includes(citation.quote)) {
        failures.push(`finding ${index} cites a quote that is not in ${citation.personaName}'s transcript`);
      }
    }
  }

  for (const [index, disagreement] of (synthesis.disagreements ?? []).entries()) {
    const split = disagreement.split ?? [];
    const sum = split.reduce((total: number, side: any) => total + Number(side.personaCount ?? 0), 0);
    if (sum !== completed) failures.push(`split ${index} sums to ${sum}, completed ${completed}`);
    if (!split.some((side: any) => /^no clear view$/i.test(String(side.view ?? '').trim()))) {
      failures.push(`split ${index} has no "No clear view" bucket`);
    }
  }

  // Re-run the writer validator against the saved plan. Any violation must
  // already be a stored warning, otherwise the saved report claims a fact the
  // ledger does not support.
  const names = responses.map((response) => response.personaProfile?.name ?? 'Unnamed persona');
  const ledger = claimLedgerFromSynthesis(run);
  const plan = buildSynthesisPlan({
    researchQuestion: run.researchQuestion ?? 'What prevents the reader from acting?',
    ledger,
    ...(run.artifactProfile ? { profile: run.artifactProfile } : {}),
    personaNames: names,
  });
  const violations = validateSynthesis(plan, synthesis);
  const stored = new Set(synthesis.validationWarnings ?? []);
  for (const violation of violations) {
    const warning = `${violation.field}: ${violation.message}`;
    if (!stored.has(warning)) failures.push(`unmarked validator violation: ${warning}`);
  }

  return { run: '', passed: failures.length === 0, failures, markedFields };
}

/** The blind review context. No run id, branch, earlier rounds, or fixture path. */
export function reviewContext(run: RunFile, artifactText?: string): string {
  const synthesis = run.synthesis ?? {};
  const lines = [
    ...(artifactText ? ['# Artifact under review', '', artifactText, ''] : []),
    '# User-research report',
    '',
    `## Overview`,
    synthesis.overview ?? '',
    '',
    `## Research answer`,
    synthesis.researchQuestionAnswer ?? '',
    '',
    `## Findings`,
  ];
  for (const finding of synthesis.topFindings ?? []) {
    lines.push(
      `- ${finding.observation}`,
      `  Impact: ${finding.impact}`,
      `  Evidence: ${finding.evidence ?? ''}`,
      `  Support: ${finding.affectedPersonaCount} of ${finding.totalPersonaCount} personas`,
    );
    for (const citation of finding.citations ?? []) {
      lines.push(`  Citation (${citation.personaName}): "${citation.quote}"`);
    }
  }
  if ((synthesis.disagreements ?? []).length > 0) {
    lines.push('', '## Where personas split');
    for (const disagreement of synthesis.disagreements) {
      lines.push(`- ${disagreement.topic}`);
      for (const side of disagreement.split ?? []) lines.push(`  - ${side.view} (${side.personaCount})`);
    }
  }
  if ((synthesis.biggestFrictions ?? []).length > 0) {
    lines.push('', '## Biggest friction points');
    for (const friction of synthesis.biggestFrictions) lines.push(`- ${friction}`);
  }
  const verdicts = synthesis.verdicts ?? {};
  lines.push('', '## Verdicts');
  for (const [verdict, count] of Object.entries(verdicts)) lines.push(`- ${verdict}: ${count}`);
  const profile = run.artifactProfile;
  if (profile) {
    lines.push('', '## Artifact profile', `Kind: ${profile.contentKind}; confidence: ${profile.confidence}`);
    for (const fact of profile.facts ?? []) lines.push(`- ${fact.label}: ${fact.value} (${fact.source})`);
    for (const note of profile.degraded ?? []) lines.push(`- Unverified: ${note}`);
  }
  if ((synthesis.validationWarnings ?? []).length > 0) {
    lines.push('', '## Unverified fields');
    for (const warning of synthesis.validationWarnings) lines.push(`- ${warning}`);
  }
  if ((run.responses ?? []).length > 0) {
    lines.push('', '## Individual persona reports');
    for (const response of run.responses ?? []) {
      const profile = response.personaProfile ?? {};
      const frame = response.decisionFrame ?? {};
      lines.push(
        `- ${profile.name ?? 'Unnamed persona'} — ${profile.occupation ?? 'unknown role'} — ${frame.decisionRole ?? 'unframed'} — verdict: ${response.verdict ?? 'undecided'}`,
      );
      if (response.decisiveReason) lines.push(`  Reason: ${response.decisiveReason}`);
      if (response.decisiveReasonQuote) lines.push(`  Quote: "${response.decisiveReasonQuote}"`);
      const journey = (response.customerJourney ?? [])
        .map((stage: any) => `${stage.stage}: ${stage.outcome}${stage.anchor ? ` @ ${stage.anchor.value}` : ''}`)
        .join('; ');
      if (journey) lines.push(`  Journey: ${journey}`);
    }
  }
  return lines.join('\n');
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function reviewOverall(review: ReviewScore): number {
  return (review.specificity + review.grounding + review.differentiation + review.actionability) / 4;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(String(args.out ?? '.sisyphus/quality-floor/run'));
  fs.mkdirSync(outDir, { recursive: true });

  const runFiles: { name: string; run: RunFile; structural: StructuralResult }[] = [];

  if (!args.existing) {
    if (!args.artifacts || !args.personas) {
      console.error('usage: quality-floor.ts --artifacts <dir> --personas <file> --out <dir> [--reviews <json>]');
      process.exit(2);
    }
    const artifactFiles = fs.readdirSync(String(args.artifacts))
      .filter((file) => file.endsWith('.md'))
      .sort();
    const requested = Number(args.runs ?? artifactFiles.length);
    if (artifactFiles.length < requested) {
      console.error(`need ${requested} artifacts, found ${artifactFiles.length}`);
      process.exit(2);
    }

    for (let index = 0; index < requested; index++) {
      const artifact = artifactFiles[index];
      const name = artifact.replace(/\.md$/, '');
      const runPath = path.join(outDir, `${name}.json`);
      const logPath = path.join(outDir, `${name}.log`);
      console.log(`[quality-floor] run ${index + 1}/${requested}: ${artifact}`);
      const result = spawnSync('bun', [
        'scripts/verify-output.ts', 'artifact',
        '--text', path.join(String(args.artifacts), artifact),
        '--personas-file', String(args.personas),
        '--out', runPath,
      ], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
      fs.writeFileSync(logPath, `${result.stdout ?? ''}${result.stderr ?? ''}`);
      if (!fs.existsSync(runPath)) {
        runFiles.push({ name, run: {}, structural: { run: name, passed: false, failures: ['pipeline wrote no run JSON'], markedFields: 0 } });
        continue;
      }
      const run = JSON.parse(fs.readFileSync(runPath, 'utf8')) as RunFile;
      const structural = structuralFailures(run);
      structural.run = name;
      runFiles.push({ name, run, structural });
      fs.writeFileSync(path.join(outDir, `${name}.review.md`), reviewContext(run, fs.readFileSync(path.join(String(args.artifacts), artifact), 'utf8')));
    }
  } else {
    for (const file of fs.readdirSync(outDir).filter((f) => f.endsWith('.json') && !f.endsWith('.reviews.json') && f !== 'summary.json').sort()) {
      const name = file.replace(/\.json$/, '');
      const run = JSON.parse(fs.readFileSync(path.join(outDir, file), 'utf8')) as RunFile;
      const structural = structuralFailures(run);
      structural.run = name;
      runFiles.push({ name, run, structural });
      fs.writeFileSync(path.join(outDir, `${name}.review.md`), reviewContext(run));
    }
  }

  const reviewsPath = args.reviews ? path.resolve(String(args.reviews)) : null;
  const reviews: Record<string, ReviewScore[]> = reviewsPath && fs.existsSync(reviewsPath)
    ? JSON.parse(fs.readFileSync(reviewsPath, 'utf8'))
    : {};

  const perRun = runFiles.map(({ name, structural }) => {
    const scores = reviews[name] ?? [];
    const overalls = scores.map(reviewOverall);
    const runMedian = median(overalls);
    const reviewed = scores.length >= 10;
    const failures = [...structural.failures];
    if (!reviewed) failures.push(`needs 10 blind reviews, has ${scores.length}`);
    else if (runMedian < FLOOR) failures.push(`median ${runMedian.toFixed(2)} is below ${FLOOR}`);
    return {
      run: name,
      structuralPassed: structural.passed,
      markedFields: structural.markedFields,
      reviews: scores.length,
      median: Number(runMedian.toFixed(2)),
      dimensions: {
        specificity: median(scores.map((s) => s.specificity)),
        grounding: median(scores.map((s) => s.grounding)),
        differentiation: median(scores.map((s) => s.differentiation)),
        actionability: median(scores.map((s) => s.actionability)),
      },
      failures,
      passed: failures.length === 0,
    };
  });

  const allScores = Object.values(reviews).flat().map(reviewOverall);
  const summary = {
    floor: FLOOR,
    runs: perRun.length,
    reviews: allScores.length,
    roundMedian: Number(median(allScores).toFixed(2)),
    passed: perRun.length > 0 && perRun.every((run) => run.passed),
    results: perRun,
  };
  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));

  console.log(`\n[quality-floor] runs=${summary.runs} reviews=${summary.reviews} roundMedian=${summary.roundMedian}`);
  for (const run of perRun) {
    console.log(`  ${run.passed ? 'PASS' : 'FAIL'} ${run.run}: structural=${run.structuralPassed} median=${run.median} reviews=${run.reviews}`);
    for (const failure of run.failures) console.log(`    - ${failure}`);
  }
  console.log(`[quality-floor] ${summary.passed ? 'PASS' : 'FAIL'}`);
  process.exit(summary.passed ? 0 : 1);
}

if (import.meta.main) main();
