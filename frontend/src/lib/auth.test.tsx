import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "./api";
import { login, logout, parseAuthError, signup } from "./auth";

describe("auth client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("signup posts to /auth/signup with credentials included", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: "1", email: "a@b.com" }) });
    const user = await signup("a@b.com", "password123");
    expect(user).toEqual({ id: "1", email: "a@b.com" });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/auth/signup"),
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
  });

  it("login posts to /auth/login with credentials included", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: "1", email: "a@b.com" }) });
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
});
