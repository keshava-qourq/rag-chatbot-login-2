import { expect, type Page, test } from "@playwright/test";

// Browser-level coverage for the Document library screen (US-005-1), driven
// through routed/stubbed responses for GET /documents, POST /documents and
// GET /documents/events -- no reliance on a seeded production database, no
// reliance on background worker timing. Each test signs up a fresh account
// (mirroring frontend/e2e/auth.spec.ts's sign-up steps) purely to obtain a
// real, authenticated session; every documents-related response the screen
// reads is then stubbed for that page.

const STRONG_PASSWORD = "Str0ngPass!";

function uniqueEmail(): string {
  return `docs-ui-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`;
}

// Mirrors the sign-up steps in auth.spec.ts rather than importing them,
// since routes must be registered on the page before the post-sign-up
// redirect fires the screen's first GET /documents.
async function signUpFreshAccount(page: Page): Promise<void> {
  await page.goto("/sign-up");
  await page.getByLabel(/email address/i).fill(uniqueEmail());
  await page.getByLabel("Password", { exact: true }).fill(STRONG_PASSWORD);
  await page.getByLabel(/confirm password/i).fill(STRONG_PASSWORD);
  await page.getByLabel(/answers come only from documents/i).check();
  await page.getByRole("button", { name: /create account/i }).click();
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

test.describe("Document library screen", () => {
  test("AC-014: shows only this account's documents, with name, upload date, size and status badge", async ({
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

    await signUpFreshAccount(page);

    const heading = page.getByText("lease-agreement.pdf");
    await expect(heading).toBeVisible();
    const row = page.locator("li", { has: heading });
    await expect(row.getByText(/ready/i)).toBeVisible();
    await expect(row.getByText(/2\.0 KB/)).toBeVisible();
    await expect(row.getByText(/jan 5, 2026/i)).toBeVisible();

    // Stubbed list is the only account's documents: no other row appears.
    await expect(page.locator("ul > li")).toHaveCount(1);
  });

  test("AC-015: a 'status' SSE event updates the row's badge without a page reload", async ({
    page,
  }) => {
    await stubDocumentList(page, [
      {
        id: "doc-1",
        filename: "report.pdf",
        created_at: "2026-01-01T00:00:00Z",
        size_bytes: 1024,
        status: "queued",
      },
    ]);
    await stubDocumentEvents(
      page,
      'event: status\ndata: {"id":"doc-1","status":"ready","filename":"report.pdf"}\n\n',
    );

    await signUpFreshAccount(page);

    const heading = page.getByText("report.pdf");
    await expect(heading).toBeVisible();
    const row = page.locator("li", { has: heading });
    await expect(row.getByText(/queued/i)).toBeVisible();

    await expect(row.getByText(/ready/i)).toBeVisible({ timeout: 10_000 });
    // Still the same document row, not a freshly fetched page.
    await expect(heading).toBeVisible();
  });

  test("AC-016: zero documents shows the empty state, and its link navigates to Getting started", async ({
    page,
  }) => {
    await stubDocumentList(page, []);
    await stubDocumentEvents(page, "");

    await signUpFreshAccount(page);

    await expect(page.getByText(/no documents yet/i)).toBeVisible();
    await page.getByRole("link", { name: /getting started/i }).click();

    await expect(page).toHaveURL(/\/getting-started/);
  });

  test("AC-010: uploading a supported file adds its row at the top with status 'queued'", async ({
    page,
  }) => {
    await stubDocumentList(page, [
      {
        id: "existing",
        filename: "existing.pdf",
        created_at: "2026-01-01T00:00:00Z",
        size_bytes: 1024,
        status: "ready",
      },
    ]);
    await stubDocumentEvents(page, "");
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

    await signUpFreshAccount(page);
    await expect(page.getByText("existing.pdf")).toBeVisible();

    await page
      .getByLabel(/choose documents to upload/i)
      .setInputFiles({
        name: "meeting-minutes.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("notes"),
      });

    const newHeading = page.getByText("meeting-minutes.txt");
    await expect(newHeading).toBeVisible();
    const headings = page.getByRole("heading", { level: 3 });
    await expect(headings.first()).toHaveText("meeting-minutes.txt");
    const newRow = page.locator("li", { has: newHeading });
    await expect(newRow.getByText(/queued/i)).toBeVisible();
  });

  test("AC-011: an oversized file surfaces the server's error inline and leaves the list unchanged", async ({
    page,
  }) => {
    await stubDocumentList(page, []);
    await stubDocumentEvents(page, "");
    await stubUpload(page, {
      status: 413,
      body: {
        detail:
          "huge.pdf is 26214400 bytes, which exceeds the maximum allowed upload size of 26214400 bytes.",
      },
    });

    await signUpFreshAccount(page);
    await expect(page.getByText(/no documents yet/i)).toBeVisible();

    await page
      .getByLabel(/choose documents to upload/i)
      .setInputFiles({ name: "huge.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(1024) });

    await expect(page.getByRole("alert").filter({ hasText: /exceeds the maximum/i })).toBeVisible();
    await expect(page.getByText(/no documents yet/i)).toBeVisible();
    await expect(page.getByText("huge.pdf")).toHaveCount(0);
  });

  test("AC-012: an unsupported file type surfaces the server's error inline and leaves the list unchanged", async ({
    page,
  }) => {
    await stubDocumentList(page, []);
    await stubDocumentEvents(page, "");
    await stubUpload(page, {
      status: 422,
      body: {
        detail:
          "spreadsheet.xlsx is not a supported file type. Supported types: PDF, Word, Markdown, plain text.",
      },
    });

    await signUpFreshAccount(page);
    await expect(page.getByText(/no documents yet/i)).toBeVisible();

    await page
      .getByLabel(/choose documents to upload/i)
      .setInputFiles({
        name: "spreadsheet.xlsx",
        mimeType: "application/vnd.ms-excel",
        buffer: Buffer.from("binary"),
      });

    await expect(page.getByRole("alert").filter({ hasText: /not a supported file type/i })).toBeVisible();
    await expect(page.getByText(/no documents yet/i)).toBeVisible();
    await expect(page.getByText("spreadsheet.xlsx")).toHaveCount(0);
  });
});
