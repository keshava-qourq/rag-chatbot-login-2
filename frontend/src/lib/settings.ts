import { apiFetch } from "@/lib/api";

/**
 * What `GET/PUT/DELETE /settings/gemini` return. The server never sends the
 * key itself -- `key_hint` is its last four characters only.
 *
 * `source` is where the key in effect comes from: `"app"` (saved on the
 * Settings page), `"environment"` (the server's `GEMINI_API_KEY` fallback),
 * or `null` when no key is set. `updated_at`/`updated_by` are only set for
 * an `"app"` key.
 */
export type GeminiSettings = {
  configured: boolean;
  source: "app" | "environment" | null;
  key_hint: string | null;
  updated_at: string | null;
  updated_by: string | null;
  chat_model: string;
  embedding_model: string;
};

export async function getGeminiSettings(): Promise<GeminiSettings> {
  return apiFetch<GeminiSettings>("/settings/gemini");
}

/** Gemini checks the key first; a rejected key is not saved (422). */
export async function saveGeminiKey(apiKey: string): Promise<GeminiSettings> {
  return apiFetch<GeminiSettings>("/settings/gemini", {
    method: "PUT",
    body: JSON.stringify({ api_key: apiKey }),
  });
}

export async function removeGeminiKey(): Promise<GeminiSettings> {
  return apiFetch<GeminiSettings>("/settings/gemini", { method: "DELETE" });
}
