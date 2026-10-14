import * as React from "react";
import { Link } from "react-router-dom";

import { ApiError } from "@/lib/api";
import {
  type Conversation,
  type Message,
  askQuestion,
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  renameConversation,
} from "@/lib/conversations";
import { type Document, listDocuments } from "@/lib/documents";
import { Icons } from "@/lib/icons";
import { Badge, Button, Empty, Textarea } from "@/lib/ui";

const { Plus, Trash, Edit, ArrowRight, AlertCircle, X } = Icons;

type ListState = "loading" | "error" | "ready";
type ThreadState = "idle" | "loading" | "error" | "ready";
type Citation = NonNullable<Message["citations"]>[number];

function actionErrorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

/**
 * AC-065/AC-067: the one message ever shown when a turn's stream ends in
 * error -- whatever the SSE `error` event, a non-2xx response, or a network
 * failure actually said is never rendered. The provider's own wording can
 * carry technical detail (stack fragments, internal error codes, key
 * fragments) that must never reach the page, and an unrecognized or absent
 * payload has nothing safe to show either -- so this fixed, non-technical
 * copy is what every failure path renders, with no branch on the
 * underlying message text.
 */
const ASSISTANT_UNAVAILABLE_MESSAGE =
  "The assistant is temporarily unavailable. Please try again.";

/** Splits an assistant message's content on `[[n]]` markers and renders the
 * matching citation as an expandable chip inline, so the quoted passage
 * behind a claim is one click away without leaving the message. A marker
 * resolves to its citation by the citation's own `n` (the marker number the
 * API returns), not by position in the citations array -- so a skipped or
 * reordered marker still resolves correctly, including after a reload. The
 * document name comes from the citation's own `document` field when the API
 * supplies it, falling back to `documentNames` (keyed by `document_id`)
 * only when it does not.
 *
 * Also reused for the in-flight streaming bubble, before `citations` is
 * known (the SSE client only hands citation data to the caller once via the
 * `done` event's assembled message). A marker whose citation isn't known
 * yet -- or never resolves -- is hidden rather than left as raw `[[n]]`
 * text, so the user never sees the bracket syntax, whether mid-stream or in
 * the completed message. */
function MessageContent({
  content,
  citations,
  documentNames,
}: {
  content: string;
  citations?: Citation[];
  documentNames: Map<string, string>;
}) {
  const [expanded, setExpanded] = React.useState<number | null>(null);
  const list = citations ?? [];
  const byNumber = new Map(list.map((citation) => [citation.n, citation]));
  const parts = content.split(/(\[\[\d+\]\])/g);

  function resolveDocumentName(citation: Citation): string {
    return citation.document ?? documentNames.get(citation.document_id) ?? "Document";
  }

  return (
    <div className="space-y-2">
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--brand-fg)]">
        {parts.map((part, index) => {
          const match = /^\[\[(\d+)\]\]$/.exec(part);
          if (!match) return <React.Fragment key={index}>{part}</React.Fragment>;
          const n = Number(match[1]);
          const citation = byNumber.get(n);
          if (!citation) return null;
          const documentName = resolveDocumentName(citation);
          return (
            <button
              key={index}
              type="button"
              onClick={() => setExpanded((prev) => (prev === n ? null : n))}
              aria-expanded={expanded === n}
              aria-label={`Citation ${n}: ${documentName}, page ${citation.page}`}
              className="mx-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-[var(--brand-hover)] align-super text-[10px] font-semibold text-[var(--brand-primary)]"
            >
              {n}
            </button>
          );
        })}
      </p>
      {list.map((citation) => {
        const n = citation.n;
        if (expanded !== n) return null;
        const documentName = resolveDocumentName(citation);
        return (
          <div
            key={citation.id || n}
            className="rounded-[var(--brand-radius)] border border-slate-200 bg-[var(--brand-surface)] p-3 text-xs text-[var(--brand-fg-muted)]"
          >
            <p className="font-medium text-[var(--brand-fg)]">
              {documentName} · p.{citation.page}
            </p>
            <p className="mt-1 italic">&ldquo;{citation.quoted_passage}&rdquo;</p>
          </div>
        );
      })}
    </div>
  );
}

export default function Chat() {
  const [listState, setListState] = React.useState<ListState>("loading");
  const [conversations, setConversations] = React.useState<Conversation[]>([]);
  const [listError, setListError] = React.useState<string | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const [threadState, setThreadState] = React.useState<ThreadState>("idle");
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [streamingContent, setStreamingContent] = React.useState<string | null>(null);
  const [sendError, setSendError] = React.useState<string | null>(null);
  const [sending, setSending] = React.useState(false);

  const [documents, setDocuments] = React.useState<Document[] | null>(null);
  const [question, setQuestion] = React.useState("");
  const [renamingId, setRenamingId] = React.useState<string | null>(null);
  const [renameValue, setRenameValue] = React.useState("");
  const [renameError, setRenameError] = React.useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = React.useState<string | null>(null);

  const lastQuestionRef = React.useRef("");
  const abortRef = React.useRef<(() => void) | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    listConversations()
      .then((convos) => {
        if (cancelled) return;
        setConversations(convos);
        setListState("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setListState("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    listDocuments()
      .then((docs) => {
        if (cancelled) return;
        setDocuments(docs);
      })
      .catch(() => {
        if (cancelled) return;
        setDocuments([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      setThreadState("idle");
      return;
    }
    let cancelled = false;
    setThreadState("loading");
    getConversation(selectedId)
      .then((detail) => {
        if (cancelled) return;
        setMessages(detail.messages);
        setThreadState("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setThreadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  React.useEffect(() => {
    return () => {
      abortRef.current?.();
    };
  }, []);

  /** Refreshes the sidebar list from the server, in the server's own order
   * (most recently active first -- AC-043). Used after a turn completes so
   * an auto-assigned title shows up without a manual reload (AC-046), since
   * the SSE `done` event only carries the message, never the conversation's
   * own (possibly just-changed) title. Failures are swallowed: a background
   * refresh failing must not disrupt a thread the user is already looking
   * at or the error banner already shown for the turn itself. */
  const refreshConversationsSilently = React.useCallback(async () => {
    try {
      const list = await listConversations();
      setConversations(list);
    } catch {
      // Keep whatever the sidebar already shows.
    }
  }, []);

  const handleNewConversation = React.useCallback(async () => {
    try {
      const conversation = await createConversation();
      setConversations((prev) => [conversation, ...prev]);
      setSelectedId(conversation.id);
    } catch (err) {
      setListError(actionErrorMessage(err, "Couldn't start a new conversation."));
    }
  }, []);

  const handleRequestDelete = (id: string) => {
    setConfirmingDeleteId(id);
  };

  const handleCancelDelete = () => {
    setConfirmingDeleteId(null);
  };

  const handleConfirmDelete = React.useCallback(
    async (id: string) => {
      setConfirmingDeleteId(null);
      try {
        await deleteConversation(id);
        setConversations((prev) => prev.filter((c) => c.id !== id));
        if (selectedId === id) setSelectedId(null);
      } catch (err) {
        setListError(actionErrorMessage(err, "Couldn't delete this conversation."));
      }
    },
    [selectedId],
  );

  const handleStartRename = (conversation: Conversation) => {
    setRenamingId(conversation.id);
    setRenameValue(conversation.title);
    setRenameError(null);
  };

  const handleCancelRename = () => {
    setRenamingId(null);
    setRenameError(null);
  };

  const handleSubmitRename = React.useCallback(
    async (id: string) => {
      const title = renameValue.trim();
      if (!title) {
        // AC-050: an empty rename is rejected without touching the stored
        // title -- the editor stays open with the reason, not silently
        // closed, so the user knows why nothing happened.
        setRenameError("Title can't be empty.");
        return;
      }
      setRenamingId(null);
      setRenameError(null);
      try {
        const updated = await renameConversation(id, title);
        setConversations((prev) => prev.map((c) => (c.id === id ? updated : c)));
      } catch (err) {
        // AC-051: nothing in the sidebar was changed ahead of this call, so
        // the title the row already shows is the stored one -- the error
        // just has to surface, not force a revert.
        setListError(actionErrorMessage(err, "Couldn't rename this conversation."));
      }
    },
    [renameValue],
  );

  const handleRenameKeyDown = (event: React.KeyboardEvent<HTMLInputElement>, id: string) => {
    if (event.key === "Enter") {
      void handleSubmitRename(id);
    } else if (event.key === "Escape") {
      handleCancelRename();
    }
  };

  const handleRenameBlur = (id: string) => {
    if (!renameValue.trim()) {
      // Blurring away from an empty field cancels quietly rather than
      // trapping focus on the row -- Enter is the path that surfaces the
      // "can't be empty" reason.
      handleCancelRename();
      return;
    }
    void handleSubmitRename(id);
  };

  const runQuestion = React.useCallback(
    async (conversationId: string, text: string) => {
      lastQuestionRef.current = text;
      setSendError(null);
      setSending(true);
      setStreamingContent("");
      setMessages((prev) => [
        ...prev,
        {
          id: `local-${Date.now()}`,
          role: "user",
          content: text,
          created_at: new Date().toISOString(),
        },
      ]);

      await new Promise<void>((resolve) => {
        const abort = askQuestion(conversationId, text, {
          onToken: (token) => {
            setStreamingContent((prev) => (prev ?? "") + token);
          },
          onDone: (message) => {
            setMessages((prev) => [...prev, message]);
            setStreamingContent(null);
            setSending(false);
            void refreshConversationsSilently();
            resolve();
          },
          onError: () => {
            // AC-065/AC-067: whatever the stream actually said is discarded
            // here -- the partial, in-progress bubble is dropped (it was
            // never added to `messages`, only held in `streamingContent`),
            // and the one fixed, non-technical message is what the user
            // ever sees, regardless of what the provider, the server, or a
            // network failure reported underneath.
            setStreamingContent(null);
            setSending(false);
            setSendError(ASSISTANT_UNAVAILABLE_MESSAGE);
            resolve();
          },
        });
        abortRef.current = abort;
      });
    },
    [refreshConversationsSilently],
  );

  const readyCount = documents?.filter((d) => d.status === "ready").length ?? 0;
  const processingCount =
    documents?.filter((d) => d.status === "processing" || d.status === "queued").length ?? 0;
  const noDocumentsAtAll = documents !== null && documents.length === 0;
  const noReadyDocuments = documents !== null && documents.length > 0 && readyCount === 0;
  const composerBlocked = noDocumentsAtAll || noReadyDocuments;
  const documentNames = React.useMemo(
    () => new Map((documents ?? []).map((d) => [d.id, d.filename])),
    [documents],
  );

  const handleSend = React.useCallback(async () => {
    const text = question.trim();
    if (!text || sending || composerBlocked) return;
    setQuestion("");

    let conversationId = selectedId;
    if (!conversationId) {
      try {
        const conversation = await createConversation();
        setConversations((prev) => [conversation, ...prev]);
        setSelectedId(conversation.id);
        conversationId = conversation.id;
      } catch (err) {
        setSendError(actionErrorMessage(err, "Couldn't start a new conversation."));
        return;
      }
    }
    await runQuestion(conversationId, text);
  }, [question, sending, composerBlocked, selectedId, runQuestion]);

  const handleRetry = React.useCallback(() => {
    // AC-065: Retry resends the exact same question to the same
    // conversation, not a fresh one -- the failed turn's banner and partial
    // bubble are already gone (cleared when the error arrived), so a
    // successful retry simply appends the new turn with nothing left over
    // from the failed attempt.
    if (!selectedId || !lastQuestionRef.current) return;
    void runQuestion(selectedId, lastQuestionRef.current);
  }, [selectedId, runQuestion]);

  const handleDismissError = React.useCallback(() => {
    // AC-065: dismissing just clears the banner -- the failed turn was
    // never rendered as an answer (it only ever lived in the now-cleared
    // streaming buffer), so there is nothing else to roll back.
    setSendError(null);
  }, []);

  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  return (
    <div className="flex h-full min-h-screen">
      <aside
        className="flex w-72 shrink-0 flex-col border-r p-4"
        style={{ backgroundColor: "var(--brand-surface)", borderColor: "var(--brand-border)" }}
      >
        <Button type="button" size="sm" onClick={() => void handleNewConversation()}>
          <Plus size={14} />
          {"New conversation"}
        </Button>

        {listError ? (
          <div
            role="alert"
            className="mt-3 flex items-start gap-2 rounded-[var(--brand-radius)] border border-red-200 bg-red-50 p-3 text-xs text-red-700"
          >
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <p className="flex-1">{listError}</p>
          </div>
        ) : null}

        {listState === "loading" ? (
          <p className="mt-4 text-sm text-[var(--brand-fg-muted)]">{"Loading conversations…"}</p>
        ) : null}

        {listState === "error" ? (
          <p className="mt-4 text-sm text-red-700">{"Couldn't load your conversations."}</p>
        ) : null}

        {listState === "ready" && conversations.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--brand-fg-muted)]">
            {"Start your first conversation."}
          </p>
        ) : null}

        {listState === "ready" && conversations.length > 0 ? (
          <ul className="mt-4 flex-1 space-y-1 overflow-auto">
            {conversations.map((conversation) => (
              <li key={conversation.id}>
                {renamingId === conversation.id ? (
                  <div>
                    <input
                      autoFocus
                      aria-label="Rename conversation"
                      value={renameValue}
                      onChange={(e) => {
                        setRenameValue(e.target.value);
                        if (renameError) setRenameError(null);
                      }}
                      onBlur={() => handleRenameBlur(conversation.id)}
                      onKeyDown={(e) => handleRenameKeyDown(e, conversation.id)}
                      className="w-full rounded-[var(--brand-radius)] border border-slate-300 px-2 py-1.5 text-sm"
                    />
                    {renameError ? (
                      <p role="alert" className="mt-1 px-2 text-xs text-red-700">
                        {renameError}
                      </p>
                    ) : null}
                  </div>
                ) : confirmingDeleteId === conversation.id ? (
                  <div className="rounded-[var(--brand-radius)] border border-red-200 bg-red-50 px-2 py-1.5">
                    <p className="truncate text-xs text-red-800">
                      {`Delete "${conversation.title}"?`}
                    </p>
                    <div className="mt-1.5 flex gap-2">
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => void handleConfirmDelete(conversation.id)}
                      >
                        {"Delete"}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={handleCancelDelete}
                      >
                        {"Cancel"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div
                    className={`group flex items-center justify-between gap-1 rounded-[var(--brand-radius)] px-2 py-1.5 ${
                      selectedId === conversation.id ? "bg-[var(--brand-hover)]" : ""
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedId(conversation.id)}
                      className="min-w-0 flex-1 truncate text-left text-sm text-[var(--brand-fg)]"
                      title={conversation.title}
                    >
                      {conversation.title}
                    </button>
                    <button
                      type="button"
                      aria-label={`Rename ${conversation.title}`}
                      onClick={() => handleStartRename(conversation)}
                      className="shrink-0 text-[var(--brand-fg-muted)] hover:text-[var(--brand-fg)]"
                    >
                      <Edit size={14} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${conversation.title}`}
                      onClick={() => handleRequestDelete(conversation.id)}
                      className="shrink-0 text-[var(--brand-fg-muted)] hover:text-red-700"
                    >
                      <Trash size={14} />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </aside>

      <section className="flex flex-1 flex-col">
        <header
          className="flex items-center justify-between border-b px-6 py-4"
          style={{ borderColor: "var(--brand-border)" }}
        >
          <h1
            className="text-lg font-semibold text-[var(--brand-fg)]"
            style={{ fontFamily: "var(--brand-font-heading)" }}
          >
            {"Chat"}
          </h1>
          {documents !== null ? (
            <div className="flex items-center gap-2">
              <Badge variant="success">{`${readyCount} ready`}</Badge>
              <Badge variant="warning">{`${processingCount} processing`}</Badge>
            </div>
          ) : null}
        </header>

        <div className="flex-1 overflow-auto p-6">
          {threadState === "loading" ? (
            <p className="text-sm text-[var(--brand-fg-muted)]">{"Loading conversation…"}</p>
          ) : null}

          {threadState === "error" ? (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-[var(--brand-radius)] border border-red-200 bg-red-50 p-4 text-sm text-red-700"
            >
              <AlertCircle size={16} />
              <p>{"Couldn't load this conversation."}</p>
            </div>
          ) : null}

          {(threadState === "idle" || threadState === "ready") &&
          messages.length === 0 &&
          noDocumentsAtAll ? (
            <Empty
              title="Nothing to search yet"
              description="Upload a document to start asking questions about it."
              action={
                <Link
                  to="/documents"
                  className="text-sm font-medium text-[var(--brand-primary)] underline"
                >
                  {"Upload a document"}
                </Link>
              }
            />
          ) : null}

          {(threadState === "idle" || threadState === "ready") &&
          messages.length === 0 &&
          !noDocumentsAtAll ? (
            <Empty
              title="Ask a question about your documents"
              description="Answers are grounded in the documents you've uploaded, with citations you can expand."
            />
          ) : null}

          <ul className="space-y-4">
            {messages.map((message) => (
              <li
                key={message.id}
                className={message.role === "user" ? "flex justify-end" : "flex justify-start"}
              >
                <div
                  className={`max-w-xl rounded-[var(--brand-radius)] px-4 py-3 ${
                    message.role === "user"
                      ? "bg-[var(--brand-primary)] text-white"
                      : "border border-slate-200 bg-white"
                  }`}
                >
                  {message.role === "assistant" ? (
                    <MessageContent
                      content={message.content}
                      citations={message.citations}
                      documentNames={documentNames}
                    />
                  ) : (
                    <p className="whitespace-pre-wrap text-sm">{message.content}</p>
                  )}
                </div>
              </li>
            ))}
            {streamingContent !== null ? (
              <li className="flex justify-start">
                <div className="max-w-xl rounded-[var(--brand-radius)] border border-slate-200 bg-white px-4 py-3">
                  <MessageContent content={streamingContent} documentNames={documentNames} />
                </div>
              </li>
            ) : null}
          </ul>

          {sendError ? (
            <div
              role="alert"
              className="mt-4 flex items-center gap-3 rounded-[var(--brand-radius)] border border-red-200 bg-red-50 p-4 text-sm text-red-700"
            >
              <AlertCircle size={16} className="shrink-0" />
              <p className="flex-1">{sendError}</p>
              <Button type="button" variant="secondary" size="sm" onClick={handleRetry}>
                {"Retry"}
              </Button>
              <button
                type="button"
                aria-label="Dismiss error"
                onClick={handleDismissError}
                className="shrink-0 text-red-700 hover:text-red-900"
              >
                <X size={16} />
              </button>
            </div>
          ) : null}
        </div>

        <footer className="border-t p-4" style={{ borderColor: "var(--brand-border)" }}>
          {noDocumentsAtAll ? (
            <p
              role="status"
              className="mb-2 flex items-center gap-2 text-sm text-[var(--brand-fg-muted)]"
            >
              <AlertCircle size={14} />
              {"Upload a document before you can ask a question."}
            </p>
          ) : noReadyDocuments ? (
            <p
              role="status"
              className="mb-2 flex items-center gap-2 text-sm text-[var(--brand-fg-muted)]"
            >
              <AlertCircle size={14} />
              {
                "Your documents are still being processed. You can ask a question once at least one is ready."
              }
            </p>
          ) : null}
          <div className="flex items-end gap-2">
            <Textarea
              aria-label="Ask a question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder="Ask a question about your documents…"
              disabled={sending || composerBlocked}
              className="flex-1"
            />
            <Button
              type="button"
              onClick={() => void handleSend()}
              disabled={sending || composerBlocked || !question.trim()}
            >
              {sending ? "Sending…" : <ArrowRight size={16} />}
            </Button>
          </div>
        </footer>
      </section>
    </div>
  );
}
