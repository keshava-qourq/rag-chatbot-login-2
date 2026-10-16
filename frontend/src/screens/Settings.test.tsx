import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";
import * as settingsApi from "@/lib/settings";
import type { GeminiSettings } from "@/lib/settings";

import Settings from "./Settings";

const MODELS = { chat_model: "gemini-2.5-flash", embedding_model: "gemini-embedding-001" };

const NOT_SET: GeminiSettings = {
  configured: false,
  source: null,
  key_hint: null,
  updated_at: null,
  updated_by: null,
  ...MODELS,
};

const FROM_ENV: GeminiSettings = {
  ...NOT_SET,
  configured: true,
  source: "environment",
  key_hint: "-key",
};

const SAVED: GeminiSettings = {
  configured: true,
  source: "app",
  key_hint: "9876",
  updated_at: "2026-10-15T10:00:00Z",
  updated_by: "owner@example.com",
  ...MODELS,
};

function renderSettings() {
  return render(
    <MemoryRouter initialEntries={["/settings"]}>
      <Routes>
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </MemoryRouter>,
  );
}

function keyInput(): HTMLInputElement {
  return screen.getByLabelText(/api key|replace with a new key/i) as HTMLInputElement;
}

describe("Settings", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("says no key is set and that uploads and chat need one", async () => {
    vi.spyOn(settingsApi, "getGeminiSettings").mockResolvedValue(NOT_SET);

    renderSettings();

    expect(await screen.findByText("Not set")).toBeInTheDocument();
    expect(screen.getByText(/uploads can't be processed/i)).toBeInTheDocument();
    expect(screen.getByText(/chat model: gemini-2\.5-flash/i)).toBeInTheDocument();
  });

  it("shows only the last four characters of a saved key, and who saved it", async () => {
    vi.spyOn(settingsApi, "getGeminiSettings").mockResolvedValue(SAVED);

    renderSettings();

    expect(await screen.findByText("Saved in app")).toBeInTheDocument();
    expect(screen.getByText(/key ending in 9876/i)).toHaveTextContent(/saved/i);
    expect(screen.getByText(/key ending in 9876/i)).not.toHaveTextContent("owner@example.com");
  });

  it("says when the key in effect comes from the server environment", async () => {
    vi.spyOn(settingsApi, "getGeminiSettings").mockResolvedValue(FROM_ENV);

    renderSettings();

    expect(await screen.findByText("From server environment")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /remove saved key/i })).not.toBeInTheDocument();
  });

  it("keeps the key hidden until asked, and Save disabled until something is typed", async () => {
    vi.spyOn(settingsApi, "getGeminiSettings").mockResolvedValue(NOT_SET);

    renderSettings();
    await screen.findByText("Not set");

    expect(keyInput()).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Save key" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Show key" }));
    expect(keyInput()).toHaveAttribute("type", "text");

    fireEvent.change(keyInput(), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "Save key" })).toBeDisabled();
  });

  it("saves a trimmed key, clears the field and shows the new status", async () => {
    vi.spyOn(settingsApi, "getGeminiSettings").mockResolvedValue(NOT_SET);
    const save = vi.spyOn(settingsApi, "saveGeminiKey").mockResolvedValue(SAVED);

    renderSettings();
    await screen.findByText("Not set");
    fireEvent.change(keyInput(), { target: { value: "  AIza-new-key-9876  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save key" }));

    await waitFor(() => expect(save).toHaveBeenCalledWith("AIza-new-key-9876"));
    expect(await screen.findByRole("status")).toHaveTextContent(/gemini accepted it/i);
    expect(screen.getByText("Saved in app")).toBeInTheDocument();
    expect(keyInput()).toHaveValue("");
  });

  it("shows the server's message when Gemini rejects the key, and keeps what was typed", async () => {
    vi.spyOn(settingsApi, "getGeminiSettings").mockResolvedValue(NOT_SET);
    vi.spyOn(settingsApi, "saveGeminiKey").mockRejectedValue(
      new ApiError(
        422,
        { detail: "Gemini rejected this API key." },
        "Gemini rejected this API key.",
      ),
    );

    renderSettings();
    await screen.findByText("Not set");
    fireEvent.change(keyInput(), { target: { value: "bad-key" } });
    fireEvent.click(screen.getByRole("button", { name: "Save key" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Gemini rejected this API key.");
    expect(screen.getByText("Not set")).toBeInTheDocument();
    expect(keyInput()).toHaveValue("bad-key");
  });

  it("asks for confirmation before removing the saved key", async () => {
    vi.spyOn(settingsApi, "getGeminiSettings").mockResolvedValue(SAVED);
    const remove = vi.spyOn(settingsApi, "removeGeminiKey").mockResolvedValue(NOT_SET);

    renderSettings();
    fireEvent.click(await screen.findByRole("button", { name: /remove saved key/i }));

    expect(remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Remove key" }));

    await waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Not set")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/removed/i);
  });
});
