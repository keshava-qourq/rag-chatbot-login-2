import { act } from "react";

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";
import * as documentsApi from "@/lib/documents";

import Documents from "./Documents";

function renderDocuments() {
  return render(
    <MemoryRouter initialEntries={["/documents"]}>
      <Routes>
        <Route path="/documents" element={<Documents />} />
        <Route path="/getting-started" element={<div>Getting started screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function makeFile(name: string, sizeBytes: number, type: string): File {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: sizeBytes });
  return file;
}

function getFileInput(): HTMLInputElement {
  return screen.getByLabelText(/choose documents to upload/i) as HTMLInputElement;
}

function selectFiles(input: HTMLInputElement, files: File[]) {
  Object.defineProperty(input, "files", { value: files, configurable: true });
  fireEvent.change(input);
}

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  withCredentials: boolean;
  listeners: Record<string, Array<(event: MessageEvent) => void>> = {};
  close = vi.fn();

  constructor(url: string, options?: { withCredentials?: boolean }) {
    this.url = url;
    this.withCredentials = options?.withCredentials ?? false;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    this.listeners[type] = [...(this.listeners[type] ?? []), listener];
  }

  removeEventListener(type: string, listener: (event: MessageEvent) => void) {
    this.listeners[type] = (this.listeners[type] ?? []).filter((l) => l !== listener);
  }

  emit(type: string, data: unknown) {
    const event = { data: JSON.stringify(data) } as MessageEvent;
    for (const listener of this.listeners[type] ?? []) listener(event);
  }
}

describe("Documents library", () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource as unknown as typeof EventSource);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("AC-014: lists documents from GET /documents with name, date, size and status badge", async () => {
    vi.spyOn(documentsApi, "listDocuments").mockResolvedValue([
      {
        id: "1",
        filename: "lease.pdf",
        created_at: "2026-01-05T00:00:00Z",
        size_bytes: 2048,
        status: "ready",
      },
    ]);

    renderDocuments();

    const heading = await screen.findByText("lease.pdf");
    const row = heading.closest("li") as HTMLElement;
    expect(within(row).getByText(/ready/i)).toBeInTheDocument();
    expect(within(row).getByText(/2\.0 KB/)).toBeInTheDocument();
  });

  it("shows a loading state before the list resolves", async () => {
    let resolve: (docs: documentsApi.Document[]) => void = () => {};
    vi.spyOn(documentsApi, "listDocuments").mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );

    renderDocuments();
    expect(screen.getByText(/loading your documents/i)).toBeInTheDocument();
    await act(async () => {
      resolve([]);
    });
    await waitFor(() =>
      expect(screen.queryByText(/loading your documents/i)).not.toBeInTheDocument(),
    );
  });

  it("shows an error state when GET /documents fails", async () => {
    vi.spyOn(documentsApi, "listDocuments").mockRejectedValue(new Error("network down"));

    renderDocuments();

    expect(await screen.findByText(/couldn.t load your documents/i)).toBeInTheDocument();
  });

  it("AC-016: shows an empty state with a link to getting-started when the list is empty", async () => {
    vi.spyOn(documentsApi, "listDocuments").mockResolvedValue([]);

    renderDocuments();

    expect(await screen.findByText(/no documents yet/i)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /getting started/i });
    expect(link).toHaveAttribute("href", "/getting-started");
  });

  it("AC-010: uploading a file posts to POST /documents and shows it at the top without a refetch", async () => {
    vi.spyOn(documentsApi, "listDocuments").mockResolvedValue([
      {
        id: "existing",
        filename: "existing.pdf",
        created_at: "2026-01-01T00:00:00Z",
        size_bytes: 1024,
        status: "ready",
      },
    ]);
    const uploadSpy = vi.spyOn(documentsApi, "uploadDocuments").mockResolvedValue([
      {
        id: "new",
        filename: "meeting-minutes.txt",
        created_at: "2026-01-10T00:00:00Z",
        size_bytes: 512,
        status: "queued",
      },
    ]);

    renderDocuments();
    await screen.findByText("existing.pdf");

    selectFiles(getFileInput(), [makeFile("meeting-minutes.txt", 512, "text/plain")]);

    await screen.findByText("meeting-minutes.txt");
    expect(uploadSpy).toHaveBeenCalledTimes(1);

    const headings = screen.getAllByRole("heading", { level: 3 });
    expect(headings[0]).toHaveTextContent("meeting-minutes.txt");
    expect(listDocumentsCallCount(documentsApi)).toBe(1);
  });

  function listDocumentsCallCount(mod: typeof documentsApi) {
    return (mod.listDocuments as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
  }

  it("AC-011/AC-012: surfaces the server's own error detail verbatim and leaves the list unchanged", async () => {
    vi.spyOn(documentsApi, "listDocuments").mockResolvedValue([]);
    vi.spyOn(documentsApi, "uploadDocuments").mockRejectedValue(
      new ApiError(
        413,
        {
          detail:
            "huge.pdf is 26214400 bytes, which exceeds the maximum allowed upload size of 26214400 bytes.",
        },
        "huge.pdf is 26214400 bytes, which exceeds the maximum allowed upload size of 26214400 bytes.",
      ),
    );

    renderDocuments();
    await screen.findByText(/no documents yet/i);

    selectFiles(getFileInput(), [makeFile("huge.pdf", 26 * 1024 * 1024, "application/pdf")]);

    expect(
      await screen.findByText(/huge\.pdf is 26214400 bytes, which exceeds the maximum/i),
    ).toBeInTheDocument();
    expect(screen.queryByText("huge.pdf")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /dismiss error/i }));
    expect(
      screen.queryByText(/huge\.pdf is 26214400 bytes, which exceeds the maximum/i),
    ).not.toBeInTheDocument();
  });

  it("AC-013: a multi-file upload shows each returned document as its own row with its own status badge", async () => {
    vi.spyOn(documentsApi, "listDocuments").mockResolvedValue([]);
    vi.spyOn(documentsApi, "uploadDocuments").mockResolvedValue([
      {
        id: "alpha",
        filename: "alpha.txt",
        created_at: "2026-01-10T00:00:00Z",
        size_bytes: 1024,
        status: "queued",
      },
      {
        id: "beta",
        filename: "beta.md",
        created_at: "2026-01-10T00:00:00Z",
        size_bytes: 2048,
        status: "queued",
      },
    ]);

    renderDocuments();
    await screen.findByText(/no documents yet/i);

    selectFiles(getFileInput(), [
      makeFile("alpha.txt", 1024, "text/plain"),
      makeFile("beta.md", 2048, "text/markdown"),
    ]);

    const alphaHeading = await screen.findByText("alpha.txt");
    const betaHeading = screen.getByText("beta.md");
    const alphaRow = alphaHeading.closest("li") as HTMLElement;
    const betaRow = betaHeading.closest("li") as HTMLElement;

    expect(alphaRow).not.toBe(betaRow);
    expect(within(alphaRow).getByText(/queued/i)).toBeInTheDocument();
    expect(within(betaRow).getByText(/queued/i)).toBeInTheDocument();
  });

  it("AC-015: updates a document's status in place from an SSE status event, and closes the subscription on unmount", async () => {
    vi.spyOn(documentsApi, "listDocuments").mockResolvedValue([
      {
        id: "doc-1",
        filename: "report.pdf",
        created_at: "2026-01-01T00:00:00Z",
        size_bytes: 1024,
        status: "queued",
      },
    ]);

    const { unmount } = renderDocuments();
    const heading = await screen.findByText("report.pdf");
    let row = heading.closest("li") as HTMLElement;
    expect(within(row).getByText(/queued/i)).toBeInTheDocument();

    const source = FakeEventSource.instances[0];
    expect(source).toBeDefined();
    expect(source.withCredentials).toBe(true);

    act(() => {
      source.emit("status", { id: "doc-1", status: "ready", filename: "report.pdf" });
    });

    await waitFor(() => {
      row = screen.getByText("report.pdf").closest("li") as HTMLElement;
      expect(within(row).getByText(/ready/i)).toBeInTheDocument();
    });

    unmount();
    expect(source.close).toHaveBeenCalledTimes(1);
  });
});
