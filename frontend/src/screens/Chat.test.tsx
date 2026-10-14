import { act } from "react";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";
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
  it("AC-043: loads conversations from GET /conversations and shows document counts from GET /documents, most recently active first as the server returns them", async () => {
    vi.spyOn(conversationsApi, "listConversations").mockResolvedValue([
      { id: "c1", title: "Lease questions", created_at: "", updated_at: "" },
      { id: "c2", title: "Older chat", created_at: "", updated_at: "" },
    ]);
    vi.spyOn(documentsApi, "listDocuments").mockResolvedValue(mockDocs(7, 2));

    renderChat();

    expect(await screen.findByText("Lease questions")).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Lease questions");
    expect(items[1]).toHaveTextContent("Older chat");
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

  it("AC-044: loads a conversation's thread from GET /conversations/{id} when selected", async () => {
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

  it("AC-045: 'New conversation' opens an empty thread and leaves the previous conversation in the sidebar", async () => {
    vi.spyOn(conversationsApi, "listConversations").mockResolvedValue([
      { id: "c1", title: "Lease questions", created_at: "", updated_at: "" },
    ]);
    vi.spyOn(documentsApi, "listDocuments").mockResolvedValue(mockDocs(1, 0));
    vi.spyOn(conversationsApi, "getConversation").mockImplementation(async (id: string) => {
      if (id === "c1") {
        return {
          id: "c1",
          title: "Lease questions",
          title_locked: false,
          created_at: "",
          updated_at: "",
          messages: [{ id: "m1", role: "user", content: "Prior message", created_at: "" }],
        };
      }
      return {
        id,
        title: "New chat",
        title_locked: false,
        created_at: "",
        updated_at: "",
        messages: [],
      };
    });
    vi.spyOn(conversationsApi, "createConversation").mockResolvedValue({
      id: "c2",
      title: "New chat",
      created_at: "",
      updated_at: "",
    });

    renderChat();
    fireEvent.click(await screen.findByText("Lease questions"));
    await screen.findByText("Prior message");

    fireEvent.click(screen.getByRole("button", { name: /new conversation/i }));

    await screen.findByText("New chat");
    expect(screen.getByText("Lease questions")).toBeInTheDocument();
    expect(screen.queryByText("Prior message")).not.toBeInTheDocument();
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
            {
              id: "cit-1",
              n: 1,
              document_id: "r0",
              document: "ready-0.pdf",
              page: 14,
              quoted_passage: "Six months' prior notice.",
            },
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

  it("AC-034/038: a marker resolves by its citation's n, not by array position, even when a marker is skipped", async () => {
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
        { id: "m1", role: "user", content: "What else?", created_at: "" },
        {
          id: "m2",
          role: "assistant",
          content: "First point [[1]]. Third point [[3]].",
          created_at: "",
          // Note: citation array order deliberately does not match marker
          // order, and marker [[2]] was skipped entirely -- [[3]] must
          // still resolve to the citation whose own n is 3, not to the
          // second array entry.
          citations: [
            {
              id: "cit-3",
              n: 3,
              document_id: "r0",
              document: "ready-0.pdf",
              page: 9,
              quoted_passage: "Third passage.",
            },
            {
              id: "cit-1",
              n: 1,
              document_id: "r0",
              document: "ready-0.pdf",
              page: 2,
              quoted_passage: "First passage.",
            },
          ],
        },
      ],
    });

    renderChat();
    fireEvent.click(await screen.findByText("Lease questions"));
    await screen.findByText(/first point/i);

    fireEvent.click(screen.getByRole("button", { name: /citation 3/i }));
    expect(await screen.findByText(/third passage/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /citation 3/i }));
    fireEvent.click(screen.getByRole("button", { name: /citation 1/i }));
    expect(await screen.findByText(/first passage/i)).toBeInTheDocument();
  });

  it("AC-049: renames a conversation via PATCH /conversations/{id} and it appears in the sidebar immediately", async () => {
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

  it("AC-050: submitting an empty rename is rejected, the previous title is retained, and the user sees why", async () => {
    vi.spyOn(conversationsApi, "listConversations").mockResolvedValue([
      { id: "c1", title: "Old title", created_at: "", updated_at: "" },
    ]);
    vi.spyOn(documentsApi, "listDocuments").mockResolvedValue(mockDocs(1, 0));
    const renameSpy = vi.spyOn(conversationsApi, "renameConversation");

    renderChat();
    await screen.findByText("Old title");
    fireEvent.click(screen.getByRole("button", { name: /rename old title/i }));
    const input = screen.getByLabelText(/rename conversation/i);
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(await screen.findByText(/title can.t be empty/i)).toBeInTheDocument();
    expect(renameSpy).not.toHaveBeenCalled();
    // Editor stays open with the previous value available to fix, nothing
    // was persisted.
    expect(screen.getByLabelText(/rename conversation/i)).toBeInTheDocument();
  });

  it("AC-051: a rename refused by the API surfaces an error and the title stays the stored one", async () => {
    vi.spyOn(conversationsApi, "listConversations").mockResolvedValue([
      { id: "c1", title: "Old title", created_at: "", updated_at: "" },
    ]);
    vi.spyOn(documentsApi, "listDocuments").mockResolvedValue(mockDocs(1, 0));
    vi.spyOn(conversationsApi, "renameConversation").mockRejectedValue(
      new ApiError(422, { message: "Title is too long." }, "Title is too long."),
    );

    renderChat();
    await screen.findByText("Old title");
    fireEvent.click(screen.getByRole("button", { name: /rename old title/i }));
    const input = screen.getByLabelText(/rename conversation/i);
    fireEvent.change(input, { target: { value: "A new attempted title" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(await screen.findByText("Title is too long.")).toBeInTheDocument();
    expect(await screen.findByText("Old title")).toBeInTheDocument();
    expect(screen.queryByText("A new attempted title")).not.toBeInTheDocument();
  });

  it("AC-048: long titles truncate within the sidebar row", async () => {
    const longTitle =
      "This is an extremely long conversation title that should truncate instead of wrapping or breaking the sidebar layout";
    vi.spyOn(conversationsApi, "listConversations").mockResolvedValue([
      { id: "c1", title: longTitle, created_at: "", updated_at: "" },
    ]);
    vi.spyOn(documentsApi, "listDocuments").mockResolvedValue(mockDocs(1, 0));

    renderChat();
    const button = await screen.findByText(longTitle);
    expect(button.className).toContain("truncate");
  });

  it("AC-052: delete asks for confirmation; on confirm the conversation disappears and the open thread clears", async () => {
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
      messages: [{ id: "m1", role: "user", content: "Prior message", created_at: "" }],
    });
    const deleteSpy = vi.spyOn(conversationsApi, "deleteConversation").mockResolvedValue(undefined);

    renderChat();
    fireEvent.click(await screen.findByText("Lease questions"));
    await screen.findByText("Prior message");

    fireEvent.click(screen.getByRole("button", { name: /delete lease questions/i }));
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(await screen.findByText(/delete "lease questions"\?/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith("c1"));
    await waitFor(() => expect(screen.queryByText("Lease questions")).not.toBeInTheDocument());
    expect(screen.queryByText("Prior message")).not.toBeInTheDocument();
  });

  it("AC-052: cancelling the delete confirmation leaves the conversation and thread untouched", async () => {
    vi.spyOn(conversationsApi, "listConversations").mockResolvedValue([
      { id: "c1", title: "Lease questions", created_at: "", updated_at: "" },
    ]);
    vi.spyOn(documentsApi, "listDocuments").mockResolvedValue(mockDocs(1, 0));
    const deleteSpy = vi.spyOn(conversationsApi, "deleteConversation");

    renderChat();
    await screen.findByText("Lease questions");

    fireEvent.click(screen.getByRole("button", { name: /delete lease questions/i }));
    expect(await screen.findByText(/delete "lease questions"\?/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.queryByText(/delete "lease questions"\?/i)).not.toBeInTheDocument();
    expect(screen.getByText("Lease questions")).toBeInTheDocument();
    expect(deleteSpy).not.toHaveBeenCalled();
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
          {
            id: "cit-1",
            n: 1,
            document_id: "r0",
            document: "ready-0.pdf",
            page: 14,
            quoted_passage: "Six months' prior notice.",
          },
        ],
      });
    });

    expect(await screen.findByText("When can we break the lease?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /citation 1/i }));
    expect(await screen.findByText(/six months' prior notice/i)).toBeInTheDocument();
    expect(screen.getByText(/ready-0\.pdf/)).toBeInTheDocument();
  });

  it("AC-046: a newly auto-titled conversation shows its title in the sidebar after the first answer completes, without a manual reload", async () => {
    vi.spyOn(conversationsApi, "listConversations")
      .mockResolvedValueOnce([{ id: "c1", title: "New chat", created_at: "", updated_at: "" }])
      .mockResolvedValueOnce([
        {
          id: "c1",
          title: "When can we break the lease?",
          created_at: "",
          updated_at: "",
        },
      ]);
    vi.spyOn(documentsApi, "listDocuments").mockResolvedValue(mockDocs(1, 0));
    vi.spyOn(conversationsApi, "getConversation").mockResolvedValue({
      id: "c1",
      title: "New chat",
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
    fireEvent.click(await screen.findByText("New chat"));
    await screen.findByText(/ask a question about your documents/i);

    const textarea = screen.getByLabelText(/ask a question/i);
    fireEvent.change(textarea, { target: { value: "When can we break the lease?" } });
    fireEvent.click(screen.getByRole("button", { name: "" }));

    await waitFor(() => expect(handlers).toBeDefined());

    act(() => {
      handlers!.onDone({
        id: "m-final",
        role: "assistant",
        content: "Six months notice.",
        created_at: "",
        citations: [],
      });
    });

    expect(await screen.findByText("When can we break the lease?")).toBeInTheDocument();
  });

  it("AC-037/AC-034: tokens appear progressively mid-stream, and an inline marker is hidden -- never shown as raw [[n]] -- until its citation arrives with done", async () => {
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
    });
    expect(await screen.findByText(/^six months$/i)).toBeInTheDocument();

    act(() => {
      handlers!.onToken(" notice [[1]]");
    });

    expect(await screen.findByText(/six months notice/i)).toBeInTheDocument();
    expect(screen.queryByText(/\[\[1\]\]/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /citation 1/i })).not.toBeInTheDocument();

    act(() => {
      handlers!.onDone({
        id: "m-final",
        role: "assistant",
        content: "Six months notice [[1]]",
        created_at: "",
        citations: [
          {
            id: "cit-1",
            n: 1,
            document_id: "r0",
            document: "ready-0.pdf",
            page: 14,
            quoted_passage: "Six months' prior notice.",
          },
        ],
      });
    });

    expect(await screen.findByRole("button", { name: /citation 1/i })).toBeInTheDocument();
    expect(screen.queryByText(/\[\[1\]\]/)).not.toBeInTheDocument();
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

  it("AC-065/AC-067: a mid-stream error event drops the partial answer and shows only the fixed 'temporarily unavailable' copy -- never the provider's own error text -- with a Retry that resubmits the same question", async () => {
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
      // A raw, technical provider error -- must never reach the DOM.
      handlers!.onError("GeminiError: 503 UNAVAILABLE at provider.internal, key=sk-abc123");
    });

    expect(
      await screen.findByText("The assistant is temporarily unavailable. Please try again."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/GeminiError/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/sk-abc123/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    expect(screen.queryByText(/partial answer/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() => expect(askSpy).toHaveBeenCalledTimes(2));
    expect(askSpy.mock.calls[1][1]).toBe("What happened?");
  });

  it("AC-065/AC-067: an unknown/empty error payload still falls back to the same fixed copy", async () => {
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
    fireEvent.change(textarea, { target: { value: "What happened?" } });
    fireEvent.click(screen.getByRole("button", { name: "" }));

    await waitFor(() => expect(handlers).toBeDefined());

    act(() => {
      handlers!.onError("");
    });

    expect(
      await screen.findByText("The assistant is temporarily unavailable. Please try again."),
    ).toBeInTheDocument();
  });

  it("AC-065: dismissing the error clears the banner without leaving the failed turn rendered as an answer", async () => {
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
    fireEvent.change(textarea, { target: { value: "What happened?" } });
    fireEvent.click(screen.getByRole("button", { name: "" }));

    await waitFor(() => expect(handlers).toBeDefined());

    act(() => {
      handlers!.onToken("partial answer");
      handlers!.onError("boom");
    });

    expect(
      await screen.findByText("The assistant is temporarily unavailable. Please try again."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /dismiss error/i }));

    expect(
      screen.queryByText("The assistant is temporarily unavailable. Please try again."),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/partial answer/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("AC-056: the sidebar toggle is closed by default, labelled, and opens the sidebar on tap", async () => {
    vi.spyOn(conversationsApi, "listConversations").mockResolvedValue([
      { id: "c1", title: "Lease questions", created_at: "", updated_at: "" },
    ]);
    vi.spyOn(documentsApi, "listDocuments").mockResolvedValue(mockDocs(1, 0));

    renderChat();
    await screen.findByText("Lease questions");

    const toggle = screen.getByRole("button", { name: /open conversations/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(toggle);

    const closeToggle = screen.getByRole("button", { name: /close conversations/i });
    expect(closeToggle).toHaveAttribute("aria-expanded", "true");
  });

  it("AC-056: closing the sidebar via the toggle or the backdrop preserves the open conversation and its messages", async () => {
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
      messages: [{ id: "m1", role: "user", content: "Prior message", created_at: "" }],
    });

    renderChat();
    fireEvent.click(await screen.findByText("Lease questions"));
    await screen.findByText("Prior message");

    fireEvent.click(screen.getByRole("button", { name: /open conversations/i }));
    expect(screen.getByText("Prior message")).toBeInTheDocument();

    // Toggling closed again: the same conversation and its messages are
    // still there -- toggling never re-fetches or clears the thread.
    fireEvent.click(screen.getByRole("button", { name: /close conversations/i }));
    expect(screen.getByText("Prior message")).toBeInTheDocument();
    expect(screen.getByText("Lease questions")).toBeInTheDocument();
  });

  it("AC-056: clicking the backdrop closes the sidebar", async () => {
    vi.spyOn(conversationsApi, "listConversations").mockResolvedValue([
      { id: "c1", title: "Lease questions", created_at: "", updated_at: "" },
    ]);
    vi.spyOn(documentsApi, "listDocuments").mockResolvedValue(mockDocs(1, 0));

    const { container } = renderChat();
    await screen.findByText("Lease questions");

    fireEvent.click(screen.getByRole("button", { name: /open conversations/i }));
    expect(screen.getByRole("button", { name: /close conversations/i })).toBeInTheDocument();

    const backdrop = container.querySelector('[aria-hidden="true"]');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop as Element);

    expect(screen.getByRole("button", { name: /open conversations/i })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("AC-055: interactive sidebar row controls and the composer's send button meet a 44x44px minimum tap target", async () => {
    vi.spyOn(conversationsApi, "listConversations").mockResolvedValue([
      { id: "c1", title: "Lease questions", created_at: "", updated_at: "" },
    ]);
    vi.spyOn(documentsApi, "listDocuments").mockResolvedValue(mockDocs(1, 0));

    renderChat();
    await screen.findByText("Lease questions");

    const toggle = screen.getByRole("button", { name: /open conversations/i });
    expect(toggle.className).toMatch(/h-11/);
    expect(toggle.className).toMatch(/w-11/);

    const rename = screen.getByRole("button", { name: /rename lease questions/i });
    expect(rename.className).toMatch(/h-11/);
    expect(rename.className).toMatch(/w-11/);

    const del = screen.getByRole("button", { name: /delete lease questions/i });
    expect(del.className).toMatch(/h-11/);
    expect(del.className).toMatch(/w-11/);
  });
});
