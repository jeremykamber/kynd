import { z } from 'zod';

/**
 * The role a persona plays in a purchase decision. The role shapes what the
 * persona examines and where it starts; it never chooses the verdict.
 */
export type DecisionRole = 'economic_buyer' | 'daily_user' | 'blocker' | 'champion';

export const DECISION_ROLES: DecisionRole[] = [
  'economic_buyer',
  'daily_user',
  'blocker',
  'champion',
];

export const DecisionRoleSchema = z.enum(DECISION_ROLES);

export function isDecisionRole(value: unknown): value is DecisionRole {
  return typeof value === 'string' && (DECISION_ROLES as readonly string[]).includes(value);
}
