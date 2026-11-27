import type { PersonaResponse } from "@/domain/entities/PersonaResponse";
import type { ClaimLedger, ClaimSupport } from "@/domain/entities/PersonaClaim";
import type { LlmServicePort } from "@/domain/ports/LlmServicePort";
import { buildClaimLedger, collectVerbatimClaims, type LedgerResponse } from "@/application/synthesis/ledger";

/** The support gate is the guarantee that a claim can count. When it cannot
 * verify claims, the run must fail visibly instead of saving a report built on
 * unverified prose. */
export class ClaimSupportUnavailableError extends Error {
  readonly name = "ClaimSupportUnavailableError";
}

function toLedgerResponse(response: PersonaResponse): LedgerResponse {
  return {
    personaId: response.personaId ?? response.id,
    personaName: response.personaProfile?.name ?? "Unnamed persona",
    transcript: response.rawAnalysis,
    claims: response.claims,
    verdict: response.verdict,
    ...(response.decisionFrame?.decisionRole
      ? { decisionRole: response.decisionFrame.decisionRole }
      : response.personaProfile?.decisionRole
        ? { decisionRole: response.personaProfile.decisionRole }
        : {}),
    ...(response.personaProfile?.occupation ? { occupation: response.personaProfile.occupation } : {}),
  };
}

/**
 * Builds the supported claim ledger after every persona has settled. The
 * support gate and clustering run as two batch calls; code owns the counts.
 *
 * Failure boundaries:
 * - support gate: one retry, then throw `ClaimSupportUnavailableError`;
 * - clustering: one retry, then each claim becomes its own group.
 */
export class BuildClaimLedgerUseCase {
  constructor(private readonly llmService: LlmServicePort) {}

  async execute(
    completedResponses: PersonaResponse[],
    options: { runId?: string; failedCount?: number; totalPersonaCount?: number } = {},
  ): Promise<ClaimLedger> {
    const responses = completedResponses.map(toLedgerResponse);
    const collected = collectVerbatimClaims(responses);
    const claims = collected.kept.map((entry) => entry.claim);
    const failedCount = options.failedCount ?? 0;
    const totalPersonaCount = options.totalPersonaCount ?? completedResponses.length;

    let supports: ClaimSupport[] = [];
    if (claims.length > 0) {
      const batch = claims.map((claim) => ({
        claimId: claim.id,
        observation: claim.observation,
        quote: claim.quote,
      }));
      try {
        supports = await this.llmService.verifyClaimSupport(batch, { runId: options.runId });
      } catch {
        // One retry is the documented allowance. A transient provider failure
        // must not silently downgrade claims to unsupported.
        try {
          supports = await this.llmService.verifyClaimSupport(batch, { runId: options.runId });
        } catch (error) {
          throw new ClaimSupportUnavailableError(
            `The claim support gate failed after one retry: ${(error as Error).message}`,
          );
        }
      }
    }

    const supportedIds = new Set(
      supports.filter((support) => support.level === "support").map((support) => support.claimId),
    );
    const supportedClaims = claims.filter((claim) => supportedIds.has(claim.id));

    let clusters: Array<{ topic: string; claimIds: string[] }> = [];
    const degraded: string[] = [];
    if (supportedClaims.length > 0) {
      const batch = supportedClaims.map((claim) => ({
        claimId: claim.id,
        topic: claim.topic,
        observation: claim.observation,
      }));
      try {
        clusters = await this.llmService.clusterClaims(batch, { runId: options.runId });
      } catch {
        try {
          clusters = await this.llmService.clusterClaims(batch, { runId: options.runId });
        } catch {
          clusters = [];
          degraded.push(
            "Clustering failed after one retry; each supported claim was kept as a one-claim group.",
          );
        }
      }
    }

    return buildClaimLedger({
      responses,
      supports,
      clusters,
      failedCount,
      totalPersonaCount,
      degraded,
    });
  }
}
