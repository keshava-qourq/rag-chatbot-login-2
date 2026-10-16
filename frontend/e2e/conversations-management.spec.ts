import { expect, type Page, test } from "@playwright/test";

// Browser-level coverage for conversation list, reopen, new-chat isolation,
// inline rename and delete (US-014-1/US-014-2/US-014-3) -- same stubbing
// approach as chat.spec.ts: each test opens the app (there is no login),
// then every conversation/document response the Chat screen reads is routed
// and stubbed by hand.

// There is no login: opening the app lands straight on the document library.
// Goes to "/" and lets the app redirect, rather than loading /documents
// directly: tests stub any URL ending in /documents, which would otherwise
// intercept the page load itself instead of just the API call.
async function openTheApp(page: Page): Promise<void> {
  await page.goto("/");
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
  // Registered after stubConversationList so it wins for the more specific
  // /conversations/{id} path, matching chat.spec.ts's ordering trick.
  await page.route(new RegExp(`/conversations/${id}$`), async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(detail),
      });
      return;
    }
    await route.fallback();
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

const CONVERSATION_A = {
  id: "c1",
  title: "Lease questions",
  title_locked: false,
  created_at: "2026-01-05T00:00:00Z",
  updated_at: "2026-01-05T00:00:00Z",
};

const CONVERSATION_B = {
  id: "c2",
  title: "Deposit questions",
  title_locked: false,
  created_at: "2026-01-04T00:00:00Z",
  updated_at: "2026-01-04T00:00:00Z",
};

const CONVERSATION_A_MESSAGES = [
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
        n: 1,
        document_id: "doc-1",
        document: "lease-agreement.pdf",
        page: 14,
        quoted_passage: "Six months' prior notice.",
      },
    ],
  },
];

async function setUpSidebarWithTwoConversations(page: Page): Promise<void> {
  await stubConversationList(page, [CONVERSATION_A, CONVERSATION_B]);
  await stubConversationDetail(page, "c1", {
    ...CONVERSATION_A,
    messages: CONVERSATION_A_MESSAGES,
  });
  await stubConversationDetail(page, "c2", { ...CONVERSATION_B, messages: [] });
  await stubDocumentList(page, [READY_DOCUMENT]);
  await stubDocumentEvents(page);

  await openTheApp(page);
  await page.goto("/chat");
}

test.describe("Conversation list, reopen, rename and delete", () => {
  test("the sidebar lists both conversations and reopening one shows its full history with citations", async ({
    page,
  }) => {
    await setUpSidebarWithTwoConversations(page);

    await expect(page.getByText("Lease questions")).toBeVisible();
    await expect(page.getByText("Deposit questions")).toBeVisible();

    await page.getByText("Lease questions").click();

    await expect(page.getByText(/when can we break the lease/i)).toBeVisible();
    await expect(page.getByText(/six months notice/i)).toBeVisible();

    await page.getByRole("button", { name: /citation 1/i }).click();
    await expect(page.getByText(/six months' prior notice/i)).toBeVisible();
    await expect(page.getByText(/lease-agreement\.pdf/)).toBeVisible();
    await expect(page.getByText(/p\.14/)).toBeVisible();
  });

  test("starting a new conversation leaves the previously open conversation's history intact", async ({
    page,
  }) => {
    await setUpSidebarWithTwoConversations(page);

    await page.getByText("Lease questions").click();
    await expect(page.getByText(/when can we break the lease/i)).toBeVisible();

    const newConversation = {
      id: "c3",
      title: "New chat",
      title_locked: false,
      created_at: "2026-01-06T00:00:00Z",
      updated_at: "2026-01-06T00:00:00Z",
    };
    await page.route(/\/conversations$/, async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(newConversation),
      });
    });
    await stubConversationDetail(page, "c3", { ...newConversation, messages: [] });

    await page.getByRole("button", { name: /new conversation/i }).click();

    // The new, empty conversation is now showing -- the old thread's
    // content is gone from view...
    await expect(page.getByText(/when can we break the lease/i)).not.toBeVisible();

    // ...but switching back to the original conversation proves its history
    // was never touched, only navigated away from.
    await page.getByText("Lease questions").click();
    await expect(page.getByText(/when can we break the lease/i)).toBeVisible();
    await expect(page.getByText(/six months notice/i)).toBeVisible();
  });

  test("an inline rename persists across a page reload", async ({ page }) => {
    await setUpSidebarWithTwoConversations(page);

    let patchedTitle: string | null = null;
    await page.route(/\/conversations\/c1$/, async (route) => {
      if (route.request().method() !== "PATCH") {
        await route.fallback();
        return;
      }
      const payload = JSON.parse(route.request().postData() ?? "{}");
      patchedTitle = payload.title;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...CONVERSATION_A, title: patchedTitle, title_locked: true }),
      });
    });

    await page.getByRole("button", { name: /rename lease questions/i }).click();
    const input = page.getByLabel("Rename conversation");
    await input.fill("Eviction timeline");
    await input.press("Enter");

    await expect(page.getByText("Eviction timeline")).toBeVisible();
    expect(patchedTitle).toBe("Eviction timeline");

    // Reload: the sidebar now reflects the renamed title from the server,
    // not whatever the client held in memory before the reload.
    await stubConversationList(page, [
      { ...CONVERSATION_A, title: "Eviction timeline", title_locked: true },
      CONVERSATION_B,
    ]);
    await page.reload();

    await expect(page.getByText("Eviction timeline")).toBeVisible();
    await expect(page.getByText("Lease questions")).not.toBeVisible();
  });

  test("submitting an empty rename is rejected and the original title is kept", async ({
    page,
  }) => {
    await setUpSidebarWithTwoConversations(page);

    let patchCalled = false;
    await page.route(/\/conversations\/c1$/, async (route) => {
      if (route.request().method() === "PATCH") {
        patchCalled = true;
      }
      await route.fallback();
    });

    await page.getByRole("button", { name: /rename lease questions/i }).click();
    const input = page.getByLabel("Rename conversation");
    await input.fill("   ");
    await input.press("Enter");

    await expect(page.getByText(/title can.t be empty/i)).toBeVisible();
    expect(patchCalled).toBe(false);

    // The row still shows the original, stored title -- nothing was
    // optimistically changed ahead of the (never-sent) request.
    await page.keyboard.press("Escape");
    await expect(page.getByText("Lease questions")).toBeVisible();
  });

  test("deleting a conversation requires confirmation and removes the row only after it", async ({
    page,
  }) => {
    await setUpSidebarWithTwoConversations(page);

    let deleteCalled = false;
    await page.route(/\/conversations\/c1$/, async (route) => {
      if (route.request().method() === "DELETE") {
        deleteCalled = true;
        await route.fulfill({ status: 204, body: "" });
        return;
      }
      await route.fallback();
    });

    await page.getByRole("button", { name: /delete lease questions/i }).click();

    // Still present, with a confirmation prompt -- not removed yet.
    await expect(page.getByText(/delete "lease questions"\?/i)).toBeVisible();
    expect(deleteCalled).toBe(false);
    await expect(page.getByText("Lease questions")).toBeVisible();

    await page.getByRole("button", { name: "Delete" }).click();

    expect(deleteCalled).toBe(true);
    await expect(page.getByText("Lease questions")).not.toBeVisible();
    await expect(page.getByText("Deposit questions")).toBeVisible();
  });

  test("cancelling the delete confirmation leaves the conversation in place", async ({ page }) => {
    await setUpSidebarWithTwoConversations(page);

    let deleteCalled = false;
    await page.route(/\/conversations\/c1$/, async (route) => {
      if (route.request().method() === "DELETE") {
        deleteCalled = true;
      }
      await route.fallback();
    });

    await page.getByRole("button", { name: /delete lease questions/i }).click();
    await expect(page.getByText(/delete "lease questions"\?/i)).toBeVisible();

    await page.getByRole("button", { name: "Cancel" }).click();

    expect(deleteCalled).toBe(false);
    await expect(page.getByText("Lease questions")).toBeVisible();
    await expect(page.getByText(/delete "lease questions"\?/i)).not.toBeVisible();
  });
});
