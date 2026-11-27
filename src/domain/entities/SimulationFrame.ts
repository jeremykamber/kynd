import type { ArtifactProfile } from './ArtifactProfile';
import { CONTENT_KIND_QUESTION } from './ArtifactProfile';
import type { Persona } from './Persona';

import type { DecisionRole } from './DecisionRole';
import { isDecisionRole } from './DecisionRole';

interface RoleGuide {
  task: string;
  entryPoint: string;
}

/**
 * What each role examines, in the order it examines it. The guide is static
 * because the difference between roles is the job, not the artifact.
 */
export const ROLE_GUIDE: Record<DecisionRole, RoleGuide> = {
  economic_buyer: {
    task: 'Judge the money, the payback, and the risk of saying yes.',
    entryPoint: 'Price, terms, and proof of return.',
  },
  daily_user: {
    task: 'Judge the first use, the daily work, and the effort to switch.',
    entryPoint: 'The first task and the current workaround.',
  },
  blocker: {
    task: 'Judge what would stop you from approving this for your team.',
    entryPoint: 'Security, integration, migration, and support.',
  },
  champion: {
    task: 'Judge whether you could sell this internally and defend it.',
    entryPoint: 'Team pain, internal proof, and the ask.',
  },
};

export interface SimulationFrame {
  personaId: string;
  decisionRole: DecisionRole;
  /** Whether the role came from the persona or the fallback. */
  decisionRoleSource: 'persona' | 'fallback';
  roleTask: string;
  entryPoint: string;
  decisionQuestion: string;
  currentAlternative?: string;
  switchingTrigger?: string;
}

/**
 * One frame per persona, built by code. The same persona and artifact profile
 * always produce the same task, entry point, and decision question; a missing
 * role becomes `daily_user` and says it was inferred.
 */
export function buildSimulationFrames(personas: Persona[], profile: ArtifactProfile): SimulationFrame[] {
  return personas.map((persona) => {
    const declaredRole = isDecisionRole(persona.decisionRole);
    const role: DecisionRole = declaredRole ? (persona.decisionRole as DecisionRole) : 'daily_user';
    const guide = ROLE_GUIDE[role];
    return {
      personaId: persona.id,
      decisionRole: role,
      decisionRoleSource: declaredRole ? 'persona' : 'fallback',
      roleTask: guide.task,
      entryPoint: guide.entryPoint,
      decisionQuestion: CONTENT_KIND_QUESTION[profile.contentKind],
      ...(persona.currentAlternative?.trim()
        ? { currentAlternative: persona.currentAlternative.trim() }
        : {}),
      ...(persona.switchingTrigger?.trim()
        ? { switchingTrigger: persona.switchingTrigger.trim() }
        : {}),
    };
  });
}

