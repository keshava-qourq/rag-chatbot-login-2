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
 *   - `token`     data: {"token": "<piece of the answer>"}
 *   - `citations` data: {"citations": [{"n","id","document_id","document",
 *                 "page","quoted_passage"}]} -- sent once, after the last
 *                 token. Each citation carries its own `[[n]]` marker
 *                 number, so a marker resolves to its citation by that
 *                 number, not by position in the array: a skipped or
 *                 reordered marker still resolves correctly.
 *   - `done`      data: {"message": {...}} -- the fully persisted
 *                 assistant message, exactly as `GET /conversations/{id}`
 *                 will return it on reload. This client hands it straight
 *                 to `onDone` rather than re-assembling it from the tokens
 *                 and citations it saw along the way.
 *   - `error`     data: {"message": "<human-readable failure>"}
 */
import { API_BASE_URL, apiFetch } from "@/lib/api";

export type Citation = {
  id: string;
  n: number;
  document_id: string;
  document?: string;
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

function objectFromBody(body: unknown, field: string): Record<string, unknown> | undefined {
  if (body && typeof body === "object") {
    const value = (body as Record<string, unknown>)[field];
    if (value && typeof value === "object") return value as Record<string, unknown>;
  }
  return undefined;
}

/**
 * POSTs the question to `/conversations/{id}/messages` and reads the
 * server's SSE response, calling `onToken` for every `token` event as it
 * arrives -- while the stream is still open, not only once it closes --
 * and `onDone` with the server's own `message` payload from the `done`
 * event once the turn is persisted.
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
      const token = fieldFromBody(data, "token");
      if (token !== undefined) {
        handlers.onToken(token);
      }
      return;
    }
    if (eventType === "citations") {
      // Sent for completeness ahead of `done`; this client waits for the
      // server's assembled `message` on `done` rather than re-deriving it.
      return;
    }
    if (eventType === "done") {
      const message = objectFromBody(data, "message");
      if (message) {
        handlers.onDone(message as unknown as Message);
      }
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
