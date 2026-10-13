import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "./App";

describe("App", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders without crashing and shows the first screen's nav link", () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
    // getAllByText, not getByText: the first screen's page content may repeat
    // the text its nav link carries, and two matches must not fail the smoke test.
    expect(screen.getAllByText("Sign up").length).toBeGreaterThan(0);
  });

  it("has a visible log out control that calls POST /auth/logout and then routes to /login", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 204, json: async () => undefined });
    render(
      <MemoryRouter initialEntries={["/documents"]}>
        <App />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /log out/i }));

    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/auth/logout"),
        expect.objectContaining({ method: "POST", credentials: "include" }),
      ),
    );
    await waitFor(() => expect(screen.getAllByText("Log in").length).toBeGreaterThan(0));
  });
});
