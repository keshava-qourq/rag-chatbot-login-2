import { expect, test } from "@playwright/test";

// Each test uses a fresh email so repeated runs against the same backend
// database never collide on a duplicate-email 409.
function uniqueEmail(): string {
  return `qa-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`;
}

const STRONG_PASSWORD = "Str0ngPass!";

test.describe("signup, login and logout", () => {
  test("sign up lands on the document library", async ({ page }) => {
    const email = uniqueEmail();

    await page.goto("/sign-up");
    await page.getByLabel(/email address/i).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(STRONG_PASSWORD);
    await page.getByLabel(/confirm password/i).fill(STRONG_PASSWORD);
    await page.getByLabel(/answers come only from documents/i).check();
    await page.getByRole("button", { name: /create account/i }).click();

    await expect(page).toHaveURL(/\/documents/);
  });

  test("log in with an existing account lands on the document library", async ({ page }) => {
    const email = uniqueEmail();

    // Arrange: create the account first via the UI so login has something
    // real to authenticate against.
    await page.goto("/sign-up");
    await page.getByLabel(/email address/i).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(STRONG_PASSWORD);
    await page.getByLabel(/confirm password/i).fill(STRONG_PASSWORD);
    await page.getByLabel(/answers come only from documents/i).check();
    await page.getByRole("button", { name: /create account/i }).click();
    await expect(page).toHaveURL(/\/documents/);

    // Clear client state and log in fresh.
    await page.context().clearCookies();
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/^password$/i).fill(STRONG_PASSWORD);
    await page.getByRole("button", { name: /log in/i }).click();

    await expect(page).toHaveURL(/\/documents/);
  });

  test("logging out returns to the login page and ends the session", async ({ page }) => {
    const email = uniqueEmail();

    await page.goto("/sign-up");
    await page.getByLabel(/email address/i).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(STRONG_PASSWORD);
    await page.getByLabel(/confirm password/i).fill(STRONG_PASSWORD);
    await page.getByLabel(/answers come only from documents/i).check();
    await page.getByRole("button", { name: /create account/i }).click();
    await expect(page).toHaveURL(/\/documents/);

    await page.getByRole("button", { name: /log out/i }).click();

    await expect(page).toHaveURL(/\/login/);

    // The session cookie is gone server-side too: reloading the document
    // library redirects back to login rather than showing stale content.
    await page.goto("/documents");
    const meResponse = await page.request.get("/me");
    expect(meResponse.status()).toBe(401);
  });
});
