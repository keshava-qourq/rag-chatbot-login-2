import { expect, type Page, test } from "@playwright/test";

// Browser-level coverage for US-021-3: a Gemini outage never reaches the
// user as anything but the one fixed, non-technical message, with a
// working Retry, and a failed document's reason is visible in the library.
//
// Complements frontend/e2e/chat.spec.ts's AC-039 case (a failure *partway
// through* a stream, after some tokens have already rendered) with the case
// that test does not cover: a failure with *zero* tokens at all -- the
// chat stream (or the retrieval call ahead of it) never opened -- which
// exercises the error banner appearing with nothing to replace, and the
// same stubbing approach as documents-delete-retry.spec.ts for a document
// whose own `failure_reason` must be visible in the library, not just its
// "Failed" badge.

const STRONG_PASSWORD = "Str0ngPass!";

function uniqueEmail(): string {
  return `gemini-fail-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`;
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

async function stubConversationDetail(page: Page, id: string, detail: unknown): Promise<void> {
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

async function stubDocumentEvents(page: Page, sseBody = ""): Promise<void> {
  // Registered after stubDocumentList so it wins for the more specific
  // /documents/events path (same ordering trick used throughout the other
  // documents/chat specs).
  await page.route(/\/documents\/events(\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
      body: sseBody,
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

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

async function openChatAndSelectConversation(page: Page): Promise<void> {
  await signUpFreshAccount(page);
  await page.goto("/chat");
  await page.getByText("Lease questions").click();
}

test.describe("Gemini outage: chat failure path", () => {
  test("a stubbed provider failure with no tokens at all shows the temporary-unavailability message with a working Retry", async ({
    page,
  }) => {
    await stubConversationList(page, [CONVERSATION]);
    await stubConversationDetail(page, "c1", { ...CONVERSATION, messages: [] });
    await stubDocumentList(page, [READY_DOCUMENT]);
    await stubDocumentEvents(page);

    // A provider-shaped failure string this test proves never reaches the
    // page -- the client only ever renders its own fixed copy, regardless
    // of what the SSE `error` event actually said.
    const rawProviderMessage =
      "google.genai.errors.ServerError: upstream 503 (request id a1b2c3)";

    const requestedQuestions: string[] = [];
    await page.route(/\/conversations\/c1\/messages$/, async (route) => {
      const payload = JSON.parse(route.request().postData() ?? "{}");
      requestedQuestions.push(payload.question);

      if (requestedQuestions.length === 1) {
        // Fails before a single token is produced.
        await route.fulfill({
          status: 200,
          headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
          body: sseEvent("error", { message: rawProviderMessage }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
        body:
          sseEvent("token", { token: "Six months notice" }) +
          sseEvent("citations", { citations: [] }) +
          sseEvent("done", {
            message: {
              id: "m2",
              role: "assistant",
              content: "Six months notice",
              created_at: "2026-01-05T00:00:02Z",
              citations: [],
            },
          }),
      });
    });

    await openChatAndSelectConversation(page);
    await page.getByLabel(/ask a question/i).fill("When can we break the lease?");
    await page.getByRole("button", { name: "" }).click();

    const errorBanner = page.getByRole("alert").filter({ hasText: /temporarily unavailable/i });
    await expect(errorBanner).toBeVisible();
    // The provider's own wording is discarded entirely, not merely hidden
    // behind the fixed message -- it must never be present on the page.
    await expect(page.getByText(rawProviderMessage)).toHaveCount(0);
    await expect(page.getByText(/upstream 503/i)).toHaveCount(0);

    await errorBanner.getByRole("button", { name: /retry/i }).click();

    await expect(page.getByText(/six months notice/i)).toBeVisible();
    expect(requestedQuestions).toEqual([
      "When can we break the lease?",
      "When can we break the lease?",
    ]);
    // The error banner is gone once the retry succeeds.
    await expect(page.getByRole("alert").filter({ hasText: /temporarily unavailable/i })).toHaveCount(
      0,
    );
  });
});

test.describe("Gemini outage: failed document in the library", () => {
  test("a failed document shows its plain-language failure reason in the library", async ({
    page,
  }) => {
    await stubDocumentList(page, [
      {
        id: "doc-2",
        filename: "broken-scan.pdf",
        created_at: "2026-01-05T00:00:00Z",
        size_bytes: 4096,
        status: "failed",
        failure_reason: "Processing service unavailable - try again.",
      },
    ]);
    await stubDocumentEvents(page);

    await signUpFreshAccount(page);

    const heading = page.getByText("broken-scan.pdf");
    await expect(heading).toBeVisible();
    const row = page.locator("li", { has: heading });

    await expect(row.getByText(/failed/i)).toBeVisible();
    // The reason itself -- not just the status badge -- is visible in the
    // library, and it is the exact plain-language string the API sent, not
    // a raw provider error or a generic fallback.
    await expect(row.getByText("Processing service unavailable - try again.")).toBeVisible();
    await expect(row.getByRole("button", { name: /retry/i })).toBeVisible();
  });

  test("a failed document with no failure_reason falls back to fixed, non-technical copy", async ({
    page,
  }) => {
    await stubDocumentList(page, [
      {
        id: "doc-3",
        filename: "mystery-failure.pdf",
        created_at: "2026-01-05T00:00:00Z",
        size_bytes: 4096,
        status: "failed",
        failure_reason: null,
      },
    ]);
    await stubDocumentEvents(page);

    await signUpFreshAccount(page);

    const heading = page.getByText("mystery-failure.pdf");
    await expect(heading).toBeVisible();
    const row = page.locator("li", { has: heading });

    await expect(row.getByText(/failed/i)).toBeVisible();
    await expect(
      row.getByText("This document failed to process. Please try again."),
    ).toBeVisible();
  });
});
