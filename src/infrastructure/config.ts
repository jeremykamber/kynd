/**
 * Shared configuration for execution environment.
 * Controls whether server actions run locally or delegate to the VPS.
 *
 * IMPORTANT: This is intentionally hardcoded to `false`.
 * Local dev tests against the live VPS to ensure parity with production.
 * Do NOT change this without understanding the full deployment model.
 */
export function shouldRunLocally(): boolean {
    return false;
    // The original logic, kept for reference:
    // return process.env.NODE_ENV === "development" || process.env.IS_VPS === "true";
}

export const VPS_BACKEND_URL: string = process.env.VPS_BACKEND_URL || "http://localhost:8080";

export function getVpsAuthToken(): string {
    return process.env.VPS_AUTH_TOKEN || "";
}
