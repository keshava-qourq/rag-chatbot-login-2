import { afterEach, describe, expect, it, vi } from "vitest";

import { askQuestion } from "./conversations";

function sseResponse(frames: string[]): Response {
  const encoder = new TextEncoder();
  let index = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < frames.length) {
        controller.enqueue(encoder.encode(frames[index]));
        index++;
      } else {
        controller.close();
      }
    },
  });
  return new Response(stream, { status: 200 });
}

async function flush(times = 10) {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}

describe("askQuestion (SSE client)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("AC-037: calls onToken for each `token` event's `token` field while the stream is open", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      sseResponse([
        'event: token\ndata: {"token":"Six "}\n\n',
        'event: token\ndata: {"token":"months"}\n\n',
        'event: citations\ndata: {"citations":[]}\n\n',
        'event: done\ndata: {"message":{"id":"m1","role":"assistant","content":"Six months","citations":[],"created_at":"2026-01-01T00:00:00Z"}}\n\n',
      ]),
    );

    const onToken = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();
    askQuestion("c1", "When?", { onToken, onDone, onError });

    await flush(5);
    expect(onToken).toHaveBeenCalledWith("Six ");

    await flush(20);
    expect(onToken).toHaveBeenCalledWith("months");
    expect(onToken).toHaveBeenCalledTimes(2);
    expect(onError).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledWith({
      id: "m1",
      role: "assistant",
      content: "Six months",
      citations: [],
      created_at: "2026-01-01T00:00:00Z",
    });
  });

  it("resolves a marker by the citation's own `n`, passing the `done` message straight through", async () => {
    const message = {
      id: "m1",
      role: "assistant",
      content: "First point [[1]]. Third point [[3]].",
      citations: [
        {
          id: "cit-3",
          n: 3,
          document_id: "d1",
          document: "lease.pdf",
          page: 9,
          quoted_passage: "Third passage.",
        },
        {
          id: "cit-1",
          n: 1,
          document_id: "d1",
          document: "lease.pdf",
          page: 2,
          quoted_passage: "First passage.",
        },
      ],
      created_at: "2026-01-01T00:00:00Z",
    };
    globalThis.fetch = vi.fn().mockResolvedValue(
      sseResponse([
        `event: citations\ndata: ${JSON.stringify({ citations: message.citations })}\n\n`,
        `event: done\ndata: ${JSON.stringify({ message })}\n\n`,
      ]),
    );

    const onDone = vi.fn();
    askQuestion("c1", "What else?", { onToken: vi.fn(), onDone, onError: vi.fn() });

    await flush(20);
    expect(onDone).toHaveBeenCalledWith(message);
  });

  it("AC-039: calls onError, not onDone, when a mid-stream `error` event arrives", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      sseResponse([
        'event: token\ndata: {"token":"partial"}\n\n',
        'event: error\ndata: {"message":"The provider failed. Please try again."}\n\n',
      ]),
    );

    const onToken = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();
    askQuestion("c1", "What happened?", { onToken, onDone, onError });

    await flush(20);
    expect(onToken).toHaveBeenCalledWith("partial");
    expect(onError).toHaveBeenCalledWith("The provider failed. Please try again.");
    expect(onDone).not.toHaveBeenCalled();
  });

  it("surfaces a non-2xx response's server message through onError", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ message: "conversation not found" }),
    });

    const onError = vi.fn();
    askQuestion("missing", "Hello?", { onToken: vi.fn(), onDone: vi.fn(), onError });

    await flush(20);
    expect(onError).toHaveBeenCalledWith("conversation not found");
  });
});
