import { expect, type Page, test } from "@playwright/test";

// Browser-level coverage for document delete, cancel-delete and retry on
// the Document library screen (US-006), driven through routed/stubbed
// responses for GET /documents, DELETE /documents/{id} and
// POST /documents/{id}/retry -- mirrors the stubbing approach in
// documents-library.spec.ts: each test opens the app (there is no login),
// then stubs every documents-related response the screen reads.

// There is no login: opening the app lands straight on the document library.
// Goes to "/" and lets the app redirect, rather than loading /documents
// directly: tests stub any URL ending in /documents, which would otherwise
// intercept the page load itself instead of just the API call.
async function openTheApp(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page).toHaveURL(/\/documents/);
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

async function stubDocumentEvents(page: Page, sseBody: string): Promise<void> {
  // Registered after stubDocumentList: Playwright invokes the most recently
  // registered matching route first, so /documents/events is intercepted
  // here rather than by the broader /documents GET stub above.
  await page.route(/\/documents\/events(\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
      body: sseBody,
    });
  });
}

async function stubDelete(page: Page, id: string): Promise<void> {
  await page.route(new RegExp(`/documents/${id}$`), async (route) => {
    if (route.request().method() !== "DELETE") {
      await route.fallback();
      return;
    }
    await route.fulfill({ status: 204, body: "" });
  });
}

async function stubRetry(page: Page, id: string, body: unknown): Promise<void> {
  await page.route(new RegExp(`/documents/${id}/retry$`), async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
}

test.describe("Document library: delete and retry", () => {
  test("deleting a document via the confirm dialog removes it from the library", async ({
    page,
  }) => {
    await stubDocumentList(page, [
      {
        id: "doc-1",
        filename: "lease-agreement.pdf",
        created_at: "2026-01-05T00:00:00Z",
        size_bytes: 2048,
        status: "ready",
      },
    ]);
    await stubDocumentEvents(page, "");
    await stubDelete(page, "doc-1");

    await openTheApp(page);

    const heading = page.getByText("lease-agreement.pdf");
    await expect(heading).toBeVisible();

    await page.getByRole("button", { name: /delete lease-agreement\.pdf/i }).click();
    const dialog = page.getByRole("dialog", { name: /delete this document/i });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /^delete$/i }).click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(heading).toHaveCount(0);
    await expect(page.getByText(/no documents yet/i)).toBeVisible();
  });

  test("cancelling the confirm dialog leaves the document in the library", async ({ page }) => {
    await stubDocumentList(page, [
      {
        id: "doc-1",
        filename: "lease-agreement.pdf",
        created_at: "2026-01-05T00:00:00Z",
        size_bytes: 2048,
        status: "ready",
      },
    ]);
    await stubDocumentEvents(page, "");
    let deleteWasCalled = false;
    await page.route(/\/documents\/doc-1$/, async (route) => {
      if (route.request().method() === "DELETE") {
        deleteWasCalled = true;
      }
      await route.fallback();
    });

    await openTheApp(page);

    const heading = page.getByText("lease-agreement.pdf");
    await expect(heading).toBeVisible();

    await page.getByRole("button", { name: /delete lease-agreement\.pdf/i }).click();
    const dialog = page.getByRole("dialog", { name: /delete this document/i });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /cancel/i }).click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(heading).toBeVisible();
    expect(deleteWasCalled).toBe(false);
  });

  test("retrying a failed document shows it as Queued", async ({ page }) => {
    await stubDocumentList(page, [
      {
        id: "doc-2",
        filename: "broken-scan.pdf",
        created_at: "2026-01-05T00:00:00Z",
        size_bytes: 4096,
        status: "failed",
        failure_reason: "No readable text found in this file.",
      },
    ]);
    await stubDocumentEvents(page, "");
    await stubRetry(page, "doc-2", {
      id: "doc-2",
      filename: "broken-scan.pdf",
      created_at: "2026-01-05T00:00:00Z",
      size_bytes: 4096,
      status: "queued",
      failure_reason: null,
    });

    await openTheApp(page);

    const heading = page.getByText("broken-scan.pdf");
    await expect(heading).toBeVisible();
    const row = page.locator("li", { has: heading });
    await expect(row.getByText(/failed/i)).toBeVisible();

    await row.getByRole("button", { name: /retry/i }).click();

    await expect(row.getByText(/queued/i)).toBeVisible();
    await expect(row.getByRole("button", { name: /retry/i })).toHaveCount(0);
  });
});
