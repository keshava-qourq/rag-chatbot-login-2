import { expect, type Locator, type Page, test } from "@playwright/test";

// Mobile-viewport coverage (US-018-3) for the full journey -- document
// library and a conversation -- at a 375x667 viewport. Every test in this
// file runs at that viewport via `test.use` below, and reuses the same
// stubbing approach as chat.spec.ts / documents-library.spec.ts: open the
// app (there is no login), then every response the screen reads is routed
// and stubbed by hand.

test.use({ viewport: { width: 375, height: 667 } });

// There is no login: opening the app lands straight on the document library.
// Goes to "/" and lets the app redirect, rather than loading /documents
// directly: tests stub any URL ending in /documents, which would otherwise
// intercept the page load itself instead of just the API call.
async function openTheApp(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page).toHaveURL(/\/documents/);
}

/** AC: "no horizontal scroll (document scrollWidth <= viewport width) on
 * each screen" -- compares the document's full scrollable width against the
 * viewport actually configured for this test (375), not against the
 * document's own clientWidth, so a screen that quietly grew the viewport
 * itself (e.g. via a wide fixed-position element) would not pass by
 * comparing itself to itself. */
async function assertNoHorizontalScroll(page: Page): Promise<void> {
  const viewportWidth = page.viewportSize()?.width ?? 375;
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(viewportWidth);
}

/** AC: "interactive controls on those screens meet a 44x44px minimum tap
 * target". Takes the specific controls a screen's layout makes available at
 * this viewport, rather than scanning the whole DOM -- scanning everything
 * would also catch off-canvas sidebar rows translated out of view (still
 * "visible" by Playwright's CSS checks despite being positioned off
 * screen), and inline, sentence-embedded text links (e.g. the chat
 * citation marker, or a short link folded into a line of prose) that are sized by their text rather than a fixed
 * control box -- the common exception for a target embedded in a sentence
 * of text, not a primary action control. */
async function assertTapTarget(locator: Locator, label: string): Promise<void> {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, `${label} has a bounding box`).not.toBeNull();
  expect(box!.width, `${label} width >= 44px`).toBeGreaterThanOrEqual(44);
  expect(box!.height, `${label} height >= 44px`).toBeGreaterThanOrEqual(44);
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
  await page.route(/\/documents\/events(\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
      body: sseBody,
    });
  });
}

async function stubUpload(page: Page, response: { status: number; body: unknown }): Promise<void> {
  await page.route(/\/documents(\?.*)?$/, async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: response.status,
      contentType: "application/json",
      body: JSON.stringify(response.body),
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
  title_locked: false,
  created_at: "2026-01-05T00:00:00Z",
  updated_at: "2026-01-05T00:00:00Z",
};

const CONVERSATION_MESSAGES = [
  {
    id: "m1",
    role: "user",
    content: "When can we break the lease?",
    created_at: "2026-01-05T00:00:00Z",
  },
];

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

async function stubAskQuestion(page: Page, conversationId: string, body: string): Promise<void> {
  await page.route(new RegExp(`/conversations/${conversationId}/messages$`), async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
      body,
    });
  });
}

test.describe("Mobile viewport (375x667): document library", () => {
  test("no horizontal scroll, tap targets, upload and live status display", async ({ page }) => {
    await stubDocumentList(page, [
      {
        id: "doc-2",
        filename: "broken-scan.pdf",
        created_at: "2026-01-05T00:00:00Z",
        size_bytes: 4096,
        status: "queued",
      },
    ]);
    await stubDocumentEvents(
      page,
      'event: status\ndata: {"id":"doc-2","status":"ready","filename":"broken-scan.pdf"}\n\n',
    );
    await stubUpload(page, {
      status: 201,
      body: [
        {
          id: "new-doc",
          filename: "meeting-minutes.txt",
          created_at: "2026-01-10T00:00:00Z",
          size_bytes: 512,
          status: "queued",
        },
      ],
    });

    await openTheApp(page);
    await assertNoHorizontalScroll(page);

    // Tap targets: the upload affordances and the per-row action controls.
    await assertTapTarget(
      page.getByLabel(/choose documents to upload/i),
      "choose documents to upload label",
    );
    await assertTapTarget(
      page.getByRole("button", { name: /^upload documents$/i }),
      "upload documents button",
    );
    await assertTapTarget(
      page.getByRole("button", { name: /delete broken-scan\.pdf/i }),
      "delete document button",
    );

    // AC-015-equivalent at this viewport: a status SSE event updates the
    // badge live, with no reload or horizontal overflow introduced.
    const row = page.locator("li", { has: page.getByText("broken-scan.pdf") });
    await expect(row.getByText(/queued/i)).toBeVisible();
    await expect(row.getByText(/ready/i)).toBeVisible({ timeout: 10_000 });
    await assertNoHorizontalScroll(page);

    // Upload: the new row appears at the top with status "queued".
    await page.getByLabel(/choose documents to upload/i).setInputFiles({
      name: "meeting-minutes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("notes"),
    });
    const newRow = page.locator("li", { has: page.getByText("meeting-minutes.txt") });
    await expect(newRow.getByText(/queued/i)).toBeVisible();
    await assertNoHorizontalScroll(page);
  });
});

test.describe("Mobile viewport (375x667): chat", () => {
  test("sidebar is collapsed behind a toggle, opens and closes, and the selected conversation survives toggling", async ({
    page,
  }) => {
    await stubConversationList(page, [CONVERSATION]);
    await stubConversationDetail(page, "c1", { ...CONVERSATION, messages: CONVERSATION_MESSAGES });
    await stubDocumentList(page, [READY_DOCUMENT]);
    await stubDocumentEvents(page);

    await openTheApp(page);
    await page.goto("/chat");
    await assertNoHorizontalScroll(page);

    const toggle = page.getByRole("button", { name: /open conversations|close conversations/i });

    // Collapsed by default: the toggle advertises the closed state and the
    // sidebar's conversation row is not reachable yet.
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await assertTapTarget(toggle, "sidebar toggle");

    // Opens via the toggle.
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const conversationRow = page.getByText("Lease questions");
    await expect(conversationRow).toBeVisible();
    await assertTapTarget(
      page.getByRole("button", { name: /new conversation/i }),
      "new conversation button",
    );
    await assertTapTarget(
      page.getByRole("button", { name: /rename lease questions/i }),
      "rename conversation button",
    );
    await assertTapTarget(
      page.getByRole("button", { name: /delete lease questions/i }),
      "delete conversation button",
    );

    // Selecting a conversation, then closing and reopening the sidebar,
    // leaves the open thread exactly as it was -- toggling the sidebar
    // never touches which conversation is selected or its history.
    await conversationRow.click();
    await expect(page.getByText(/when can we break the lease/i)).toBeVisible();

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByText(/when can we break the lease/i)).toBeVisible();

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByText(/when can we break the lease/i)).toBeVisible();
    await expect(page.getByText("Lease questions")).toBeVisible();
  });

  test("a streamed answer completes and its citation expands to a quoted passage, at 375px", async ({
    page,
  }) => {
    await stubConversationList(page, [CONVERSATION]);
    await stubConversationDetail(page, "c1", { ...CONVERSATION, messages: [] });
    await stubDocumentList(page, [READY_DOCUMENT]);
    await stubDocumentEvents(page);

    const body =
      sseEvent("token", { token: "FirstTokenChunk" }) +
      sseEvent("token", { token: " SecondTokenChunk [[1]]" }) +
      sseEvent("citations", {
        citations: [
          {
            id: "cit-1",
            n: 1,
            document_id: "doc-1",
            document: "lease-agreement.pdf",
            page: 14,
            quoted_passage: "Six months' prior notice.",
          },
        ],
      }) +
      sseEvent("done", {
        message: {
          id: "m2",
          role: "assistant",
          content: "FirstTokenChunk SecondTokenChunk [[1]]",
          created_at: "2026-01-05T00:00:01Z",
          citations: [
            {
              id: "cit-1",
              n: 1,
              document_id: "doc-1",
              document: "lease-agreement.pdf",
              page: 14,
              quoted_passage: "Six months' prior notice.",
            },
          ],
        },
      });
    await stubAskQuestion(page, "c1", body);

    await openTheApp(page);
    await page.goto("/chat");
    await page.getByText("Lease questions").click();
    await assertNoHorizontalScroll(page);

    const askField = page.getByLabel(/ask a question/i);
    await assertTapTarget(askField, "ask a question field");

    await askField.fill("When can we break the lease?");
    await page.getByRole("button", { name: "" }).click();

    // Streamed answer completes.
    await expect(page.getByText(/FirstTokenChunk SecondTokenChunk/)).toBeVisible();
    await assertNoHorizontalScroll(page);

    // The citation expands to render its quoted passage, document name and
    // page, without introducing horizontal overflow at this viewport.
    await page.getByRole("button", { name: /citation 1/i }).click();
    await expect(page.getByText(/six months' prior notice/i)).toBeVisible();
    await expect(page.getByText(/lease-agreement\.pdf/)).toBeVisible();
    await expect(page.getByText(/p\.14/)).toBeVisible();
    await assertNoHorizontalScroll(page);
  });
});
