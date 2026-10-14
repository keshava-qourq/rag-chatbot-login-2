import * as React from "react";

import { apiFetch, ApiError } from "@/lib/api";

export type User = { id: string; email: string };

export type AuthErrorField = "email" | "password";

export async function signup(email: string, password: string): Promise<User> {
  return apiFetch<User>("/auth/signup", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function login(email: string, password: string): Promise<User> {
  return apiFetch<User>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function logout(): Promise<void> {
  await apiFetch<void>("/auth/logout", { method: "POST" });
}

export async function fetchCurrentUser(): Promise<User | null> {
  try {
    return await apiFetch<User>("/me");
  } catch {
    return null;
  }
}

/**
 * Turns a signup/login `ApiError` into the field (if any) and message the
 * server sent, rather than a message this layer invents. The server is the
 * only thing that knows whether a 409/422 belongs against the email or
 * password field, and the only thing allowed to say "incorrect" on a 401 --
 * inventing wording here would risk saying more than the server does.
 *
 * The real backend wraps `HTTPException(detail=...)` under a top-level
 * `detail` key, so a per-field error actually arrives as
 * `{"detail": {"field": ..., "message": ...}}`, not `{"field": ...,
 * "message": ...}` at the top level -- and a generic failure (login's 401)
 * arrives as `{"detail": "<plain message>"}`. Both nested shapes are
 * checked here, alongside the flat shape, so a field-specific error (a
 * duplicate email on signup, a weak password) is actually recognised
 * rather than silently falling through to a generic service-error banner.
 */
export function parseAuthError(err: ApiError): { field?: AuthErrorField; message: string } {
  const body = err.body as Record<string, unknown> | undefined;
  const detail = body?.detail;
  const detailObject =
    detail && typeof detail === "object" ? (detail as Record<string, unknown>) : undefined;

  const rawField =
    (typeof body?.field === "string" && body.field) ||
    (detailObject && typeof detailObject.field === "string" && detailObject.field) ||
    undefined;
  const field: AuthErrorField | undefined =
    rawField === "email" || rawField === "password" ? rawField : undefined;

  const message =
    (typeof body?.message === "string" && body.message) ||
    (detailObject && typeof detailObject.message === "string" && detailObject.message) ||
    (typeof detail === "string" && detail) ||
    err.message ||
    "Something went wrong. Please try again.";

  return field ? { field, message } : { message };
}

type AuthContextValue = {
  user: User | null;
  setUser: (user: User | null) => void;
};

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);
  const value = React.useMemo(() => ({ user, setUser }), [user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Shared client auth state. Must be read inside an `AuthProvider` -- every
 * screen that calls this is mounted under the one `AuthProvider` in `App`.
 */
export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
