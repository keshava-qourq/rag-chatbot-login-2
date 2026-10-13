/// <reference types="vite/client" />
// Without the reference above, `import.meta.env` is not typed and `tsc --noEmit` fails --
// which `vite build` does not catch, because it tree-shakes this module out when no screen
// imports it yet.
//
// Where the generated API lives.
//
// Set at build time: the platform bakes the deployed API URL into the frontend build. The
// fallback is the local backend so a bare `npm run dev` still points somewhere real.
export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

/**
 * Thrown by `apiFetch` when the server responds with a non-2xx status. Carries
 * the parsed JSON error body (when the server sent one) alongside the status
 * code, so callers can show the server's own per-field or generic message
 * instead of inventing one from the status alone.
 */
export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

function messageFromBody(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    if (typeof record.message === "string") return record.message;
    if (typeof record.detail === "string") return record.detail;
  }
  return fallback;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    // Session auth lives in an HTTP-only cookie, never in JS-reachable
    // storage -- every request has to carry it, not just the auth ones.
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
    const message = messageFromBody(
      body,
      `${init?.method ?? "GET"} ${path} failed: ${response.status}`,
    );
    throw new ApiError(response.status, body, message);
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}
