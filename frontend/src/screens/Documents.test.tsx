import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import Documents from "./Documents";

// The screen seeds itself with demo data and only swaps it in after a short
// simulated "checking your library" delay (see the `loading` state in
// Documents.tsx). Every test waits for that known first document to appear
// before interacting, so an upload is never raced against the skeleton.
const FIRST_SEED_FILENAME = "Northbrook-Pension-Scheme-Rules-2026.pdf";

function renderDocuments() {
  return render(
    <MemoryRouter initialEntries={["/documents"]}>
      <Routes>
        <Route path="/documents" element={<Documents />} />
        <Route path="/chat" element={<div>Chat screen</div>} />
        <Route path="/getting-started" element={<div>Getting started screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function waitForLibraryLoaded() {
  await screen.findByText(FIRST_SEED_FILENAME, {}, { timeout: 3000 });
}

function getFileInput(): HTMLInputElement {
  return screen.getByLabelText(/choose documents to upload/i) as HTMLInputElement;
}

// Builds a File with a `size` the component can read without actually
// allocating that many bytes of content -- `size` is an own-property
// override, which shadows the real (content-derived) Blob getter.
function makeFile(name: string, sizeBytes: number, type: string): File {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: sizeBytes });
  return file;
}

// Sets the input's selected files directly and fires a native `change`
// event. Deliberately not `userEvent.upload`: that helper simulates a real
// OS file picker and filters candidates against the input's `accept`
// attribute before the component ever sees them, which would silently drop
// exactly the unsupported/oversized files these tests exist to exercise.
function selectFiles(input: HTMLInputElement, files: File[]) {
  Object.defineProperty(input, "files", { value: files, configurable: true });
  fireEvent.change(input);
}

describe("Documents library upload", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("AC-010: a supported file is queued and appears at the top of the library immediately", async () => {
    renderDocuments();
    await waitForLibraryLoaded();

    selectFiles(getFileInput(), [makeFile("meeting-minutes.txt", 1024, "text/plain")]);

    const headings = await screen.findAllByRole("heading", { level: 3 });
    expect(headings[0]).toHaveTextContent("meeting-minutes.txt");

    const row = headings[0].closest("li") as HTMLElement;
    expect(within(row).getByText(/queued/i)).toBeInTheDocument();
  });

  it("AC-011: a file over the size ceiling is rejected before being added, naming the limit and the file's actual size", async () => {
    renderDocuments();
    await waitForLibraryLoaded();

    selectFiles(getFileInput(), [makeFile("huge-report.pdf", 26 * 1024 * 1024, "application/pdf")]);

    const notice = await screen.findByText(/huge-report\.pdf.*is too large/i);
    const container = notice.closest("div") as HTMLElement;
    // The actual limit (25.0 MB) and the file's actual size (26.0 MB) are
    // both named, not just a generic "too big" message.
    expect(within(container).getByText(/25\.0 MB/)).toBeInTheDocument();
    expect(within(container).getByText(/26\.0 MB/)).toBeInTheDocument();

    // Rejected before it was ever treated as a document: nothing was added.
    expect(screen.queryByText("huge-report.pdf")).not.toBeInTheDocument();
  });

  it("AC-012: a file of an unsupported type is rejected, listing every supported type", async () => {
    renderDocuments();
    await waitForLibraryLoaded();

    selectFiles(getFileInput(), [makeFile("payroll.xlsx", 1024, "application/vnd.ms-excel")]);

    const notice = await screen.findByText(/can.t read/i);
    const container = notice.closest("div") as HTMLElement;
    expect(within(container).getByText(/PDF/)).toBeInTheDocument();
    expect(within(container).getByText(/Word/)).toBeInTheDocument();
    expect(within(container).getByText(/Markdown/)).toBeInTheDocument();
    expect(within(container).getByText(/plain text/)).toBeInTheDocument();

    expect(screen.queryByText("payroll.xlsx")).not.toBeInTheDocument();
  });

  it("AC-013: selecting several supported files at once creates one independent, separately-queued entry per file", async () => {
    renderDocuments();
    await waitForLibraryLoaded();

    selectFiles(getFileInput(), [
      makeFile("alpha.txt", 1024, "text/plain"),
      makeFile("beta.md", 2048, "text/markdown"),
    ]);

    const alphaHeading = await screen.findByText("alpha.txt");
    const betaHeading = screen.getByText("beta.md");

    const alphaRow = alphaHeading.closest("li") as HTMLElement;
    const betaRow = betaHeading.closest("li") as HTMLElement;

    // Two distinct rows, each independently showing its own queued status.
    expect(alphaRow).not.toBe(betaRow);
    expect(within(alphaRow).getByText(/queued/i)).toBeInTheDocument();
    expect(within(betaRow).getByText(/queued/i)).toBeInTheDocument();
  });

  it("rejects one invalid file in a multi-select without blocking the valid ones", async () => {
    renderDocuments();
    await waitForLibraryLoaded();

    selectFiles(getFileInput(), [
      makeFile("good.txt", 512, "text/plain"),
      makeFile("bad.exe", 512, "application/octet-stream"),
    ]);

    expect(await screen.findByText("good.txt")).toBeInTheDocument();
    expect(screen.queryByText("bad.exe")).not.toBeInTheDocument();
    expect(await screen.findByText(/can.t read/i)).toBeInTheDocument();
  });
});
