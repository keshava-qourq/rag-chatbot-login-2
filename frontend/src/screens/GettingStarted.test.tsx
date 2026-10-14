import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import GettingStarted from "./GettingStarted";

function renderScreen() {
  render(
    <MemoryRouter>
      <GettingStarted />
    </MemoryRouter>,
  );
}

describe("GettingStarted", () => {
  it("renders a 'Getting started' heading", () => {
    renderScreen();
    expect(screen.getByRole("heading", { name: /getting started/i })).toBeInTheDocument();
  });

  it("covers creating an account, uploading, processing statuses, asking, and citations (AC-058)", () => {
    renderScreen();
    expect(screen.getByText(/create an account/i)).toBeInTheDocument();
    expect(screen.getAllByText(/upload/i).length).toBeGreaterThan(0);
    expect(screen.getByText("Queued")).toBeInTheDocument();
    expect(screen.getByText("Processing")).toBeInTheDocument();
    expect(screen.getAllByText("Ready").length).toBeGreaterThan(0);
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText(/ask your first question/i)).toBeInTheDocument();
    expect(screen.getByText(/read and check citations/i)).toBeInTheDocument();
  });

  it("states supported file types and the size and page ceilings (AC-059)", () => {
    renderScreen();
    expect(screen.getAllByText(/pdf/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/word/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/markdown/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/plain text/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/25 mb/i)).toBeInTheDocument();
    expect(screen.getByText(/500 pages/i)).toBeInTheDocument();
  });

  it("states that answers come only from the user's documents (AC-060)", () => {
    renderScreen();
    expect(screen.getByText(/only your own uploaded documents/i)).toBeInTheDocument();
    expect(screen.getByText(/isn't in your documents/i)).toBeInTheDocument();
  });

  it("deep links to /documents and /chat", () => {
    renderScreen();
    expect(screen.getByRole("link", { name: /document library/i })).toHaveAttribute(
      "href",
      "/documents",
    );
    expect(screen.getAllByRole("link", { name: /chat/i })[0]).toHaveAttribute("href", "/chat");
  });
});
