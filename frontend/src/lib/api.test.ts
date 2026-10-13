import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiFetch } from "./api";

describe("apiFetch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends credentials: 'include' on every request", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });
    await apiFetch("/me");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("throws an ApiError carrying the parsed error body on failure", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ field: "password", message: "Too short." }),
    });
    await expect(apiFetch("/auth/signup", { method: "POST" })).rejects.toMatchObject({
      status: 422,
      body: { field: "password", message: "Too short." },
    });
  });

  it("surfaces an ApiError instance with the server's message, not just the status", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: "The email or password is incorrect." }),
    });
    try {
      await apiFetch("/auth/login", { method: "POST" });
      throw new Error("expected apiFetch to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).message).toBe("The email or password is incorrect.");
    }
  });

  it("resolves 204 responses as undefined", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 204, json: async () => undefined });
    await expect(apiFetch("/auth/logout", { method: "POST" })).resolves.toBeUndefined();
  });
});
