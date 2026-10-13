/**
 * Documents API client.
 *
 * The one place the Documents screen talks to the network. `listDocuments`
 * goes through `apiFetch` like every other JSON endpoint; `uploadDocuments`
 * does not, because `apiFetch` forces a JSON `Content-Type` header and a
 * multipart upload must leave that to the browser, which sets it together
 * with the boundary token the server needs to split the parts.
 */
import { API_BASE_URL, ApiError, apiFetch } from "@/lib/api";

export type DocumentStatus = "queued" | "processing" | "ready" | "failed";

export type Document = {
  id: string;
  filename: string;
  created_at: string;
  size_bytes: number;
  status: DocumentStatus;
};

export async function listDocuments(): Promise<Document[]> {
  return apiFetch<Document[]>("/documents");
}

function messageFromErrorBody(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    if (typeof record.detail === "string") return record.detail;
    if (typeof record.message === "string") return record.message;
  }
  return fallback;
}

export async function uploadDocuments(files: File[]): Promise<Document[]> {
  const formData = new FormData();
  for (const file of files) {
    formData.append("files", file);
  }

  const response = await fetch(`${API_BASE_URL}/documents`, {
    method: "POST",
    // Session auth lives in the cookie, same as every other request -- but
    // no Content-Type header: the browser sets `multipart/form-data` with
    // its own boundary, and overriding it here would break that boundary.
    credentials: "include",
    body: formData,
  });

  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
    const message = messageFromErrorBody(body, `Upload failed: ${response.status}`);
    throw new ApiError(response.status, body, message);
  }

  return (await response.json()) as Document[];
}

export type DocumentStatusEvent = {
  id: string;
  status: DocumentStatus;
  filename: string;
};

/**
 * Opens the `/documents/events` SSE stream and calls `onStatus` for every
 * `status` event the server sends. Returns an unsubscribe function that
 * removes the listener and closes the connection -- callers must invoke it
 * on unmount so the browser does not keep a connection open against a
 * screen that is no longer mounted.
 *
 * No-ops (returning a no-op unsubscribe) when `EventSource` is not
 * available in the current runtime -- older test/browser environments --
 * rather than throw and take the whole screen down with it.
 */
export function subscribeToDocumentEvents(
  onStatus: (event: DocumentStatusEvent) => void,
): () => void {
  if (typeof EventSource === "undefined") {
    return () => {};
  }

  const source = new EventSource(`${API_BASE_URL}/documents/events`, {
    withCredentials: true,
  });

  const handleStatus = (event: MessageEvent<string>) => {
    try {
      const data = JSON.parse(event.data) as DocumentStatusEvent;
      onStatus(data);
    } catch {
      // Malformed payload: ignore this event rather than crash the stream.
    }
  };

  source.addEventListener("status", handleStatus as EventListener);

  return () => {
    source.removeEventListener("status", handleStatus as EventListener);
    source.close();
  };
}
