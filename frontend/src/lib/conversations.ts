/**
 * Conversations API client.
 *
 * The one place the Chat screen talks to `/conversations`. Plain JSON
 * endpoints go through `apiFetch`, same as `documents.ts`. Asking a
 * question is different: the server answers over `text/event-stream`, so
 * `askQuestion` opens its own `fetch` (a POST body rules out `EventSource`,
 * which only issues GET) and parses the SSE frames itself, calling the
 * matching handler as each one arrives.
 *
 * The SSE contract (see `backend/app/routers/conversations.py`):
 *   - `token`     data: {"text": "<piece of the answer>"}
 *   - `citations` data: {"citations": [{"id","document_id","page","quoted_passage"}]}
 *                 sent once, after the last token, in the same order the
 *                 model was offered the excerpts -- so a citation's 1-based
 *                 position in this array is the `[[n]]` marker number the
 *                 answer text cites it by.
 *   - `done`      data: {} -- the turn is fully persisted server-side; this
 *                 client assembles the final `Message` itself from the
 *                 tokens and citations already received.
 *   - `error`     data: {"message": "<human-readable failure>"}
 */
import { API_BASE_URL, apiFetch } from "@/lib/api";

export type Citation = {
  id: string;
  document_id: string;
  page: number;
  quoted_passage: string;
};

export type MessageRole = "user" | "assistant";

export type Message = {
  id: string;
  role: MessageRole;
  content: string;
  citations?: Citation[];
  created_at: string;
};

export type Conversation = {
  id: string;
  title: string;
  title_locked?: boolean;
  created_at: string;
  updated_at: string;
};

export type ConversationDetail = Conversation & {
  messages: Message[];
};

export async function listConversations(): Promise<Conversation[]> {
  return apiFetch<Conversation[]>("/conversations");
}

export async function createConversation(): Promise<Conversation> {
  return apiFetch<Conversation>("/conversations", { method: "POST" });
}

export async function getConversation(id: string): Promise<ConversationDetail> {
  return apiFetch<ConversationDetail>(`/conversations/${id}`);
}

export async function renameConversation(id: string, title: string): Promise<Conversation> {
  return apiFetch<Conversation>(`/conversations/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
}

export async function deleteConversation(id: string): Promise<void> {
  await apiFetch<void>(`/conversations/${id}`, { method: "DELETE" });
}

export type AskQuestionHandlers = {
  onToken: (token: string) => void;
  onDone: (message: Message) => void;
  onError: (message: string) => void;
};

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function fieldFromBody(body: unknown, field: string): string | undefined {
  if (body && typeof body === "object") {
    const value = (body as Record<string, unknown>)[field];
    if (typeof value === "string") return value;
  }
  return undefined;
}

function citationsFromBody(body: unknown): Citation[] | undefined {
  if (!body || typeof body !== "object") return undefined;
  const list = (body as Record<string, unknown>).citations;
  return Array.isArray(list) ? (list as Citation[]) : undefined;
}

function randomMessageId(): string {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * POSTs the question to `/conversations/{id}/messages` and reads the
 * server's SSE response, assembling the final assistant `Message` itself
 * from the `token` and `citations` events as they arrive, and handing it to
 * `onDone` once the server's `done` event confirms the turn is persisted.
 *
 * A non-2xx response is surfaced through `onError` the same way a mid-
 * stream `error` event is, so the caller has one place to branch on either.
 *
 * Returns an abort function; callers must invoke it on unmount so the
 * connection does not keep streaming against an unmounted screen.
 */
export function askQuestion(
  conversationId: string,
  question: string,
  handlers: AskQuestionHandlers,
): () => void {
  const controller = new AbortController();

  let content = "";
  let citations: Citation[] = [];

  function processEvent(rawEvent: string): void {
    let eventType = "message";
    const dataLines: string[] = [];
    for (const line of rawEvent.split("\n")) {
      if (line.startsWith("event:")) {
        eventType = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trim());
      }
    }
    const raw = dataLines.join("\n");
    if (!raw) return;
    const data = parseJson(raw);

    if (eventType === "token") {
      const text = fieldFromBody(data, "text");
      if (text !== undefined) {
        content += text;
        handlers.onToken(text);
      }
      return;
    }
    if (eventType === "citations") {
      const list = citationsFromBody(data);
      if (list) citations = list;
      return;
    }
    if (eventType === "done") {
      handlers.onDone({
        id: randomMessageId(),
        role: "assistant",
        content,
        citations,
        created_at: new Date().toISOString(),
      });
      return;
    }
    if (eventType === "error") {
      const message = fieldFromBody(data, "message");
      handlers.onError(message ?? "Something went wrong. Please try again.");
    }
  }

  void (async () => {
    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}/conversations/${conversationId}/messages`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
        signal: controller.signal,
      });
    } catch {
      if (!controller.signal.aborted) {
        handlers.onError("Something went wrong. Please try again.");
      }
      return;
    }

    if (!response.ok) {
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = undefined;
      }
      const message = fieldFromBody(body, "message") ?? fieldFromBody(body, "detail");
      handlers.onError(message ?? "Something went wrong. Please try again.");
      return;
    }

    if (!response.body) {
      handlers.onError("Something went wrong. Please try again.");
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let boundary = buffer.indexOf("\n\n");
        while (boundary !== -1) {
          const rawEvent = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          processEvent(rawEvent);
          boundary = buffer.indexOf("\n\n");
        }
      }
    } catch {
      if (!controller.signal.aborted) {
        handlers.onError("Something went wrong. Please try again.");
      }
    }
  })();

  return () => controller.abort();
}
