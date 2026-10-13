import { act } from "react";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as conversationsApi from "@/lib/conversations";
import * as documentsApi from "@/lib/documents";

import Chat from "./Chat";

function renderChat() {
  return render(
    <MemoryRouter initialEntries={["/chat"]}>
      <Routes>
        <Route path="/chat" element={<Chat />} />
        <Route path="/documents" element={<div>Document library screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

function mockDocs(ready: number, processing: number) {
  const docs: documentsApi.Document[] = [];
  for (let i = 0; i < ready; i++) {
    docs.push({
      id: `r${i}`,
      filename: `ready-${i}.pdf`,
      created_at: "2026-01-01T00:00:00Z",
      size_bytes: 10,
      status: "ready",
    });
  }
  for (let i = 0; i < processing; i++) {
    docs.push({
      id: `p${i}`,
      filename: `processing-${i}.pdf`,
      created_at: "2026-01-01T00:00:00Z",
      size_bytes: 10,
      status: "processing",
    });
  }
  return docs;
}

describe("Chat screen", () => {
  it("loads conversations from GET /conversations and shows document counts from GET /documents", async () => {
    vi.spyOn(conversationsApi, "listConversations").mockResolvedValue([
      { id: "c1", title: "Lease questions", created_at: "", updated_at: "" },
    ]);
    vi.spyOn(documentsApi, "listDocuments").mockResolvedValue(mockDocs(7, 2));

    renderChat();

    expect(await screen.findByText("Lease questions")).toBeInTheDocument();
    expect(await screen.findByText("7 ready")).toBeInTheDocument();
    expect(screen.getByText("2 processing")).toBeInTheDocument();
  });

  it("shows an error state when the conversation list fails to load", async () => {
    vi.spyOn(conversationsApi, "listConversations").mockRejectedValue(new Error("down"));
    vi.spyOn(documentsApi, "listDocuments").mockResolvedValue([]);

    renderChat();

    expect(await screen.findByText(/couldn.t load your conversations/i)).toBeInTheDocument();
  });

  it("shows an empty state with no conversations", async () => {
    vi.spyOn(conversationsApi, "listConversations").mockResolvedValue([]);
    vi.spyOn(documentsApi, "listDocuments").mockResolvedValue(mockDocs(1, 0));

    renderChat();

    expect(await screen.findByText(/start your first conversation/i)).toBeInTheDocument();
  });

  it("loads a conversation's thread from GET /conversations/{id} when selected", async () => {
    vi.spyOn(conversationsApi, "listConversations").mockResolvedValue([
      { id: "c1", title: "Lease questions", created_at: "", updated_at: "" },
    ]);
    vi.spyOn(documentsApi, "listDocuments").mockResolvedValue(mockDocs(1, 0));
    vi.spyOn(conversationsApi, "getConversation").mockResolvedValue({
      id: "c1",
      title: "Lease questions",
      title_locked: false,
      created_at: "",
      updated_at: "",
      messages: [{ id: "m1", role: "user", content: "When does the lease end?", created_at: "" }],
    });

    renderChat();
    fireEvent.click(await screen.findByText("Lease questions"));

    expect(await screen.findByText("When does the lease end?")).toBeInTheDocument();
  });

  it("AC-038: after reload, GET /conversations/{id} shows the same answer with an expandable citation", async () => {
    vi.spyOn(conversationsApi, "listConversations").mockResolvedValue([
      { id: "c1", title: "Lease questions", created_at: "", updated_at: "" },
    ]);
    vi.spyOn(documentsApi, "listDocuments").mockResolvedValue(mockDocs(1, 0));
    vi.spyOn(conversationsApi, "getConversation").mockResolvedValue({
      id: "c1",
      title: "Lease questions",
      title_locked: false,
      created_at: "",
      updated_at: "",
      messages: [
        {
          id: "m1",
          role: "user",
          content: "When can we break the lease?",
          created_at: "",
        },
        {
          id: "m2",
          role: "assistant",
          content: "Six months notice [[1]]",
          created_at: "",
          citations: [
            { id: "cit-1", document_id: "r0", page: 14, quoted_passage: "Six months' prior notice." },
          ],
        },
      ],
    });

    renderChat();
    fireEvent.click(await screen.findByText("Lease questions"));

    expect(await screen.findByText("When can we break the lease?")).toBeInTheDocument();
    expect(screen.getByText(/six months notice/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /citation 1/i }));
    expect(await screen.findByText(/six months' prior notice/i)).toBeInTheDocument();
    expect(screen.getByText(/ready-0\.pdf/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /citation 1/i }));
    expect(screen.queryByText(/six months' prior notice/i)).not.toBeInTheDocument();
  });

  it("renames a conversation via PATCH /conversations/{id}", async () => {
    vi.spyOn(conversationsApi, "listConversations").mockResolvedValue([
      { id: "c1", title: "Old title", created_at: "", updated_at: "" },
    ]);
    vi.spyOn(documentsApi, "listDocuments").mockResolvedValue(mockDocs(1, 0));
    const renameSpy = vi.spyOn(conversationsApi, "renameConversation").mockResolvedValue({
      id: "c1",
      title: "New title",
      created_at: "",
      updated_at: "",
    });

    renderChat();
    await screen.findByText("Old title");
    fireEvent.click(screen.getByRole("button", { name: /rename old title/i }));
    const input = screen.getByLabelText(/rename conversation/i);
    fireEvent.change(input, { target: { value: "New title" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(renameSpy).toHaveBeenCalledWith("c1", "New title"));
    expect(await screen.findByText("New title")).toBeInTheDocument();
  });

  it("deletes a conversation via DELETE /conversations/{id}", async () => {
    vi.spyOn(conversationsApi, "listConversations").mockResolvedValue([
      { id: "c1", title: "Lease questions", created_at: "", updated_at: "" },
    ]);
    vi.spyOn(documentsApi, "listDocuments").mockResolvedValue(mockDocs(1, 0));
    const deleteSpy = vi
      .spyOn(conversationsApi, "deleteConversation")
      .mockResolvedValue(undefined);

    renderChat();
    await screen.findByText("Lease questions");
    fireEvent.click(screen.getByRole("button", { name: /delete lease questions/i }));

    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith("c1"));
    await waitFor(() => expect(screen.queryByText("Lease questions")).not.toBeInTheDocument());
  });

  it("asking a question posts to /conversations/{id}/messages, streams tokens, then renders citations on expand", async () => {
    vi.spyOn(conversationsApi, "listConversations").mockResolvedValue([
      { id: "c1", title: "Lease questions", created_at: "", updated_at: "" },
    ]);
    vi.spyOn(documentsApi, "listDocuments").mockResolvedValue(mockDocs(1, 0));
    vi.spyOn(conversationsApi, "getConversation").mockResolvedValue({
      id: "c1",
      title: "Lease questions",
      title_locked: false,
      created_at: "",
      updated_at: "",
      messages: [],
    });

    let handlers: conversationsApi.AskQuestionHandlers | undefined;
    vi.spyOn(conversationsApi, "askQuestion").mockImplementation((_id, _q, h) => {
      handlers = h;
      return () => {};
    });

    renderChat();
    fireEvent.click(await screen.findByText("Lease questions"));
    await screen.findByText(/ask a question about your documents/i);

    const textarea = screen.getByLabelText(/ask a question/i);
    fireEvent.change(textarea, { target: { value: "When can we break the lease?" } });
    fireEvent.click(screen.getByRole("button", { name: "" }));

    await waitFor(() => expect(handlers).toBeDefined());

    act(() => {
      handlers!.onToken("Six months");
      handlers!.onToken(" notice [[1]]");
    });

    expect(await screen.findByText(/six months notice/i)).toBeInTheDocument();

    act(() => {
      handlers!.onDone({
        id: "m-final",
        role: "assistant",
        content: "Six months notice [[1]]",
        created_at: "",
        citations: [
          { id: "cit-1", document_id: "r0", page: 14, quoted_passage: "Six months' prior notice." },
        ],
      });
    });

    expect(await screen.findByText("When can we break the lease?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /citation 1/i }));
    expect(await screen.findByText(/six months' prior notice/i)).toBeInTheDocument();
    expect(screen.getByText(/ready-0\.pdf/)).toBeInTheDocument();
  });

  it("AC-031/032: a 'not in your documents' answer renders as a normal message with no citation chips or retry banner", async () => {
    vi.spyOn(conversationsApi, "listConversations").mockResolvedValue([
      { id: "c1", title: "Lease questions", created_at: "", updated_at: "" },
    ]);
    vi.spyOn(documentsApi, "listDocuments").mockResolvedValue(mockDocs(1, 0));
    vi.spyOn(conversationsApi, "getConversation").mockResolvedValue({
      id: "c1",
      title: "Lease questions",
      title_locked: false,
      created_at: "",
      updated_at: "",
      messages: [],
    });

    let handlers: conversationsApi.AskQuestionHandlers | undefined;
    vi.spyOn(conversationsApi, "askQuestion").mockImplementation((_id, _q, h) => {
      handlers = h;
      return () => {};
    });

    renderChat();
    fireEvent.click(await screen.findByText("Lease questions"));
    await screen.findByText(/ask a question about your documents/i);

    const textarea = screen.getByLabelText(/ask a question/i);
    fireEvent.change(textarea, { target: { value: "What is the capital of France?" } });
    fireEvent.click(screen.getByRole("button", { name: "" }));

    await waitFor(() => expect(handlers).toBeDefined());

    act(() => {
      handlers!.onToken("I don't see an answer to that in your documents.");
      handlers!.onDone({
        id: "m-final",
        role: "assistant",
        content: "I don't see an answer to that in your documents.",
        created_at: "",
        citations: [],
      });
    });

    expect(
      await screen.findByText(/i don.t see an answer to that in your documents/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /citation/i })).not.toBeInTheDocument();
  });

  it("AC-033: a user with zero documents sees the nothing-to-search prompt and a disabled, explained composer", async () => {
    vi.spyOn(conversationsApi, "listConversations").mockResolvedValue([]);
    vi.spyOn(documentsApi, "listDocuments").mockResolvedValue([]);

    renderChat();

    expect(await screen.findByText(/nothing to search yet/i)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /upload a document/i });
    expect(link).toHaveAttribute("href", "/documents");

    expect(
      await screen.findByText(/upload a document before you can ask a question/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/ask a question/i)).toBeDisabled();
  });

  it("AC-030: when there are no ready documents, the composer shows the processing message instead of allowing a question", async () => {
    vi.spyOn(conversationsApi, "listConversations").mockResolvedValue([
      { id: "c1", title: "Lease questions", created_at: "", updated_at: "" },
    ]);
    vi.spyOn(documentsApi, "listDocuments").mockResolvedValue(mockDocs(0, 3));

    renderChat();

    expect(
      await screen.findByText(/your documents are still being processed/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/ask a question/i)).toBeDisabled();
  });

  it("AC-039: a mid-stream error event replaces the partial answer with a clear error and a Retry that resubmits the same question", async () => {
    vi.spyOn(conversationsApi, "listConversations").mockResolvedValue([
      { id: "c1", title: "Lease questions", created_at: "", updated_at: "" },
    ]);
    vi.spyOn(documentsApi, "listDocuments").mockResolvedValue(mockDocs(1, 0));
    vi.spyOn(conversationsApi, "getConversation").mockResolvedValue({
      id: "c1",
      title: "Lease questions",
      title_locked: false,
      created_at: "",
      updated_at: "",
      messages: [],
    });

    let handlers: conversationsApi.AskQuestionHandlers | undefined;
    const askSpy = vi.spyOn(conversationsApi, "askQuestion").mockImplementation((_id, _q, h) => {
      handlers = h;
      return () => {};
    });

    renderChat();
    fireEvent.click(await screen.findByText("Lease questions"));
    await screen.findByText(/ask a question about your documents/i);

    const textarea = screen.getByLabelText(/ask a question/i);
    fireEvent.change(textarea, { target: { value: "What happened?" } });
    fireEvent.click(screen.getByRole("button", { name: "" }));

    await waitFor(() => expect(handlers).toBeDefined());

    act(() => {
      handlers!.onToken("partial answer");
      handlers!.onError("The provider failed. Please try again.");
    });

    expect(await screen.findByText("The provider failed. Please try again.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    expect(screen.queryByText(/partial answer/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() => expect(askSpy).toHaveBeenCalledTimes(2));
    expect(askSpy.mock.calls[1][1]).toBe("What happened?");
  });
});
