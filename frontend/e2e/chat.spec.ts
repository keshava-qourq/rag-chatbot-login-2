import { expect, type Page, test } from "@playwright/test";

// Browser-level coverage for the chat answer experience (US-012), driven
// through routed/stubbed responses for GET /conversations, GET /documents,
// GET /documents/events, GET /conversations/{id} and POST
// /conversations/{id}/messages -- mirrors the stubbing approach in
// documents-library.spec.ts: each test signs up a fresh account purely to
// obtain a real, authenticated session, then stubs every chat-related
// response the screen reads. SSE responses are built by hand to match the
// token/citations/done/error contract documented in
// frontend/src/lib/conversations.ts.

const STRONG_PASSWORD = "Str0ngPass!";

function uniqueEmail(): string {
  return `chat-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`;
}

async function signUpFreshAccount(page: Page): Promise<void> {
  await page.goto("/sign-up");
  await page.getByLabel(/email address/i).fill(uniqueEmail());
  await page.getByLabel("Password", { exact: true }).fill(STRONG_PASSWORD);
  await page.getByLabel(/confirm password/i).fill(STRONG_PASSWORD);
  await page.getByLabel(/answers come only from documents/i).check();
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/documents/);
}

async function stubConversationList(page: Page, conversations: unknown[]): Promise<void> {
  await page.route(/\/conversations(\?.*)?$/, async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(conversations),
    });
  });
}

async function stubConversationDetail(
  page: Page,
  id: string,
  detail: unknown,
): Promise<void> {
  // Registered after stubConversationList so it wins for the more specific
  // /conversations/{id} path (same ordering trick as
  // documents-library.spec.ts's stubDocumentEvents vs stubDocumentList).
  await page.route(new RegExp(`/conversations/${id}$`), async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(detail),
    });
  });
}

async function stubDocumentList(page: Page, documents: unknown[]): Promise<void> {
  await page.route(/\/documents(\?.*)?$/, async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(documents),
    });
  });
}

async function stubDocumentEvents(page: Page): Promise<void> {
  await page.route(/\/documents\/events(\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
      body: "",
    });
  });
}

const READY_DOCUMENT = {
  id: "doc-1",
  filename: "lease-agreement.pdf",
  created_at: "2026-01-05T00:00:00Z",
  size_bytes: 2048,
  status: "ready",
};

const CONVERSATION = {
  id: "c1",
  title: "Lease questions",
  created_at: "2026-01-05T00:00:00Z",
  updated_at: "2026-01-05T00:00:00Z",
};

// Inert SSE padding: a comment-shaped frame with no `data:` line parses to
// an empty payload the client's own parser discards (see
// conversations.ts's `processEvent`: `if (!raw) return;`). Large padding
// frames between real events encourage the browser to deliver the mocked
// response across more than one `reader.read()` resolution, which is what
// makes it possible to observe a token on screen before the stream's
// `done` frame has been processed -- AC-037's "before the stream
// completes".
function padding(bytes: number): string {
  return `: ${"p".repeat(bytes)}\n\n`;
}

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

async function stubAskQuestion(
  page: Page,
  conversationId: string,
  responder: (callIndex: number) => { body: string } | { status: number; body: unknown },
): Promise<void> {
  let callIndex = 0;
  await page.route(new RegExp(`/conversations/${conversationId}/messages$`), async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    const result = responder(callIndex);
    callIndex += 1;
    if ("status" in result) {
      await route.fulfill({
        status: result.status,
        contentType: "application/json",
        body: JSON.stringify(result.body),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
      body: result.body,
    });
  });
}

async function openChatAndSelectConversation(page: Page): Promise<void> {
  await signUpFreshAccount(page);
  await page.goto("/chat");
  await page.getByText("Lease questions").click();
}

test.describe("Chat answer experience", () => {
  test("AC-037/AC-035: an answer streams progressively, completes, and its citation can be expanded", async ({
    page,
  }) => {
    await stubConversationList(page, [CONVERSATION]);
    await stubConversationDetail(page, "c1", { ...CONVERSATION, messages: [] });
    await stubDocumentList(page, [READY_DOCUMENT]);
    await stubDocumentEvents(page);

    const body =
      padding(200_000) +
      sseEvent("token", { text: "FirstTokenChunk" }) +
      padding(200_000) +
      sseEvent("token", { text: " SecondTokenChunk [[1]]" }) +
      padding(200_000) +
      sseEvent("citations", {
        citations: [
          {
            id: "cit-1",
            document_id: "doc-1",
            page: 14,
            quoted_passage: "Six months' prior notice.",
          },
        ],
      }) +
      padding(200_000) +
      sseEvent("done", {});
    await stubAskQuestion(page, "c1", () => ({ body }));

    await openChatAndSelectConversation(page);
    await page.getByLabel(/ask a question/i).fill("When can we break the lease?");
    await page.getByRole("button", { name: "" }).click();

    // The first token chunk is on screen while the second has not arrived
    // yet -- the answer is appearing progressively, not materializing in
    // one piece once the stream ends.
    await expect(page.getByText(/FirstTokenChunk/)).toBeVisible();
    await expect(page.getByText(/SecondTokenChunk/)).not.toBeVisible();

    // The stream completes and the full, persisted answer is shown.
    await expect(page.getByText(/FirstTokenChunk SecondTokenChunk/)).toBeVisible();

    // AC-035: the citation marker reveals the quoted passage with document
    // name and page.
    await page.getByRole("button", { name: /citation 1/i }).click();
    await expect(page.getByText(/six months' prior notice/i)).toBeVisible();
    await expect(page.getByText(/lease-agreement\.pdf/)).toBeVisible();
    await expect(page.getByText(/p\.14/)).toBeVisible();
  });

  test("AC-038: after a page reload the answer and its citations are still present in the thread", async ({
    page,
  }) => {
    await stubConversationList(page, [CONVERSATION]);
    await stubConversationDetail(page, "c1", {
      ...CONVERSATION,
      messages: [
        {
          id: "m1",
          role: "user",
          content: "When can we break the lease?",
          created_at: "2026-01-05T00:00:00Z",
        },
        {
          id: "m2",
          role: "assistant",
          content: "Six months notice [[1]]",
          created_at: "2026-01-05T00:00:01Z",
          citations: [
            {
              id: "cit-1",
              document_id: "doc-1",
              page: 14,
              quoted_passage: "Six months' prior notice.",
            },
          ],
        },
      ],
    });
    await stubDocumentList(page, [READY_DOCUMENT]);
    await stubDocumentEvents(page);

    await openChatAndSelectConversation(page);
    await expect(page.getByText(/six months notice/i)).toBeVisible();

    await page.reload();
    await page.getByText("Lease questions").click();

    await expect(page.getByText(/six months notice/i)).toBeVisible();
    await page.getByRole("button", { name: /citation 1/i }).click();
    await expect(page.getByText(/six months' prior notice/i)).toBeVisible();
    await expect(page.getByText(/lease-agreement\.pdf/)).toBeVisible();
  });

  test("AC-039: a mid-stream failure shows an error in place of the truncated answer, and Retry resubmits the question", async ({
    page,
  }) => {
    await stubConversationList(page, [CONVERSATION]);
    await stubConversationDetail(page, "c1", { ...CONVERSATION, messages: [] });
    await stubDocumentList(page, [READY_DOCUMENT]);
    await stubDocumentEvents(page);

    const requestedQuestions: string[] = [];
    await page.route(/\/conversations\/c1\/messages$/, async (route) => {
      const payload = JSON.parse(route.request().postData() ?? "{}");
      requestedQuestions.push(payload.question);

      if (requestedQuestions.length === 1) {
        await route.fulfill({
          status: 200,
          headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
          body:
            sseEvent("token", { text: "a partial answer that never finishes" }) +
            sseEvent("error", { message: "The provider failed. Please try again." }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
        body: sseEvent("token", { text: "Six months notice" }) + sseEvent("done", {}),
      });
    });

    await openChatAndSelectConversation(page);
    await page.getByLabel(/ask a question/i).fill("What happened?");
    await page.getByRole("button", { name: "" }).click();

    const errorBanner = page.getByRole("alert").filter({ hasText: /provider failed/i });
    await expect(errorBanner).toBeVisible();
    await expect(page.getByText(/partial answer that never finishes/i)).not.toBeVisible();

    await errorBanner.getByRole("button", { name: /retry/i }).click();

    await expect(page.getByText(/six months notice/i)).toBeVisible();
    expect(requestedQuestions).toEqual(["What happened?", "What happened?"]);
  });

  test("AC-031: a refusal answer renders with no citation chips", async ({ page }) => {
    await stubConversationList(page, [CONVERSATION]);
    await stubConversationDetail(page, "c1", { ...CONVERSATION, messages: [] });
    await stubDocumentList(page, [READY_DOCUMENT]);
    await stubDocumentEvents(page);
    await stubAskQuestion(page, "c1", () => ({
      body:
        sseEvent("token", { text: "I don't see an answer to that in your documents." }) +
        sseEvent("citations", { citations: [] }) +
        sseEvent("done", {}),
    }));

    await openChatAndSelectConversation(page);
    await page.getByLabel(/ask a question/i).fill("What is the capital of France?");
    await page.getByRole("button", { name: "" }).click();

    await expect(
      page.getByText(/i don.t see an answer to that in your documents/i),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /citation/i })).toHaveCount(0);
  });

  test("AC-033: a user with no documents sees the upload prompt instead of an answer", async ({
    page,
  }) => {
    await stubConversationList(page, []);
    await stubDocumentList(page, []);
    await stubDocumentEvents(page);

    await signUpFreshAccount(page);
    await page.goto("/chat");

    await expect(page.getByText(/nothing to search yet/i)).toBeVisible();
    const link = page.getByRole("link", { name: /upload a document/i });
    await expect(link).toHaveAttribute("href", "/documents");
    await expect(page.getByLabel(/ask a question/i)).toBeDisabled();
  });
});
