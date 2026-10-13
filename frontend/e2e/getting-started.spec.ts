import { expect, type Page, test } from "@playwright/test";

// Browser-level coverage for the Getting started page (US-012-1): reachable
// from in-app navigation, and states the setup steps, upload limits and
// the documents-only grounding promise (AC-058/059/060). Each test signs
// up a fresh account purely to obtain a real, authenticated session, same
// convention as documents-library.spec.ts.

const STRONG_PASSWORD = "Str0ngPass!";

function uniqueEmail(): string {
  return `gs-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`;
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

test.describe("Getting started page", () => {
  test("AC-058: reachable from in-app navigation and shows the setup steps", async ({ page }) => {
    await signUpFreshAccount(page);

    await page.getByRole("link", { name: /getting started/i }).click();
    await expect(page).toHaveURL(/\/getting-started/);

    await expect(page.getByRole("heading", { name: /getting started/i })).toBeVisible();

    // Setup steps: an account, a document to upload, and a question to ask
    // are the minimum walkthrough a first-time user needs.
    await expect(page.getByText(/sign up|create an account/i)).toBeVisible();
    await expect(page.getByText(/upload/i)).toBeVisible();
    await expect(page.getByText(/ask/i)).toBeVisible();
  });

  test("AC-059: shows the supported file types and the size and page limits", async ({ page }) => {
    await signUpFreshAccount(page);
    await page.goto("/getting-started");

    await expect(page.getByText(/pdf/i)).toBeVisible();
    await expect(page.getByText(/word/i)).toBeVisible();
    await expect(page.getByText(/markdown/i)).toBeVisible();
    await expect(page.getByText(/plain text/i)).toBeVisible();

    await expect(page.getByText(/25\s*mb/i)).toBeVisible();
    await expect(page.getByText(/500\s*pages?/i)).toBeVisible();
  });

  test("AC-060: states that answers are grounded only in the user's documents", async ({
    page,
  }) => {
    await signUpFreshAccount(page);
    await page.goto("/getting-started");

    await expect(page.getByText(/only.*(your )?documents|documents.*only/i)).toBeVisible();
  });
});
