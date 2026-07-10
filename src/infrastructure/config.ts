/**
 * Shared configuration for execution environment.
 * Controls whether server actions run locally or delegate to the VPS.
 */

export function shouldRunLocally(): boolean {
    return process.env.NODE_ENV === "development" || process.env.IS_VPS === "true";
}

export const VPS_BACKEND_URL: string = process.env.VPS_BACKEND_URL || "http://localhost:8080";
export function getVpsAuthToken(): string {
    return process.env.VPS_AUTH_TOKEN || "";
}
