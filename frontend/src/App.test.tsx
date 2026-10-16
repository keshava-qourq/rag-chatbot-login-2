import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("App", () => {
  beforeEach(() => {
    // The document library loads its list on open; answer with an empty one.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("opens straight onto the document library, with no login", () => {
    renderAt("/");

    expect(screen.getByRole("link", { name: "Document library" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("has no sign-up, log-in or log-out controls", () => {
    renderAt("/documents");

    expect(screen.queryByRole("link", { name: /sign up|log in/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /log out/i })).not.toBeInTheDocument();
  });

  it.each(["/login", "/sign-up"])("sends an old %s link to the document library", (path) => {
    renderAt(path);

    expect(screen.getByRole("link", { name: "Document library" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
