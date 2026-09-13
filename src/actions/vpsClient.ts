/**
 * HTTP client for the VPS backend. Server actions use these helpers so the
 * base URL, bearer auth, and error handling are defined once. Endpoint
 * arguments are path segments under `/api/vps/`.
 */

import { VPS_BACKEND_URL, getVpsAuthToken } from "@/infrastructure/config";

function authorizationHeader(): Record<string, string> {
  return { Authorization: `Bearer ${getVpsAuthToken()}` };
}

function jsonHeaders(): Record<string, string> {
  return { "Content-Type": "application/json", ...authorizationHeader() };
}

/**
 * POST a JSON body to a VPS endpoint. Resolves with the parsed response body;
 * throws when the response is not ok.
 */
export async function vpsPost<T = unknown>(
  endpoint: string,
  body: unknown,
): Promise<T> {
  const res = await fetch(`${VPS_BACKEND_URL}/api/vps/${endpoint}`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => res.statusText);
    throw new Error(`VPS ${endpoint} failed (${res.status}): ${errBody}`);
  }

  return res.json() as Promise<T>;
}

/**
 * POST a JSON body and return the raw Response, for callers that stream the
 * body (SSE/chunked). Does not throw on a non-ok status — check res.ok.
 */
export async function vpsFetchRaw(
  endpoint: string,
  body: unknown,
): Promise<Response> {
  return fetch(`${VPS_BACKEND_URL}/api/vps/${endpoint}`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(body),
  });
}

/**
 * POST a FormData body. Content-Type is left unset so fetch can add the
 * multipart boundary; returns the raw Response (callers check res.ok).
 */
export async function vpsPostForm(
  endpoint: string,
  formData: FormData,
): Promise<Response> {
  return fetch(`${VPS_BACKEND_URL}/api/vps/${endpoint}`, {
    method: "POST",
    headers: authorizationHeader(),
    body: formData,
  });
}

/**
 * GET a VPS endpoint with optional query params. Resolves with the parsed
 * JSON body; throws when the response is not ok.
 */
export async function vpsGet<T = unknown>(
  endpoint: string,
  params?: Record<string, string>,
): Promise<T> {
  const url = new URL(`${VPS_BACKEND_URL}/api/vps/${endpoint}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const res = await fetch(url.toString(), {
    headers: authorizationHeader(),
  });

  if (!res.ok) {
    throw new Error(`VPS ${endpoint} failed (${res.status})`);
  }

  return res.json() as Promise<T>;
}
