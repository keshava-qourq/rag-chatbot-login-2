import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "./api";
import { login, logout, parseAuthError, signup } from "./auth";

describe("auth client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("signup posts to /auth/signup with credentials included", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: "1", email: "a@b.com" }),
    });
    const user = await signup("a@b.com", "password123");
    expect(user).toEqual({ id: "1", email: "a@b.com" });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/auth/signup"),
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
  });

  it("login posts to /auth/login with credentials included", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: "1", email: "a@b.com" }),
    });
    await login("a@b.com", "password123");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/auth/login"),
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
  });

  it("logout posts to /auth/logout with credentials included", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 204, json: async () => undefined });
    await logout();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/auth/logout"),
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
  });

  it("parses a per-field error from the server body", () => {
    const err = new ApiError(409, { field: "email", message: "Already registered." }, "fallback");
    expect(parseAuthError(err)).toEqual({ field: "email", message: "Already registered." });
  });

  it("falls back to no field with the server's generic message when absent", () => {
    const err = new ApiError(401, { message: "The email or password is incorrect." }, "fallback");
    expect(parseAuthError(err)).toEqual({ message: "The email or password is incorrect." });
  });

  // The real backend never sends a flat `{field, message}` body: FastAPI
  // wraps every `HTTPException(detail=...)` under a top-level `detail` key
  // (see `app.routers.auth.signup`'s 409/422 raises, which pass
  // `detail={"field": ..., "message": ...}`, and `app.main`'s own default
  // exception handling, which wraps a plain string the same way). The two
  // tests above only prove `parseAuthError` can read the flat shape it is
  // never actually given -- if the nested-`detail` branch were ever
  // deleted, both would still pass while the real signup/login screens
  // broke. These assert the shape the backend actually sends.
  it("parses a per-field error nested under the real backend's `detail` key", () => {
    const err = new ApiError(
      409,
      { detail: { field: "email", message: "An account with this email already exists." } },
      "fallback",
    );
    expect(parseAuthError(err)).toEqual({
      field: "email",
      message: "An account with this email already exists.",
    });
  });

  it("parses the real backend's plain-string `detail` (login's generic 401) with no field", () => {
    const err = new ApiError(401, { detail: "email or password is incorrect" }, "fallback");
    expect(parseAuthError(err)).toEqual({ message: "email or password is incorrect" });
  });

  it("ignores an unrecognized field value nested under `detail`, carrying only the message", () => {
    const err = new ApiError(
      422,
      { detail: { field: "not-a-real-field", message: "Something about the payload." } },
      "fallback",
    );
    expect(parseAuthError(err)).toEqual({ message: "Something about the payload." });
  });
});
