import { expect, test } from "@playwright/test";

// Covers the error paths frontend/e2e/auth.spec.ts never exercises: that
// path only drives the happy-path signup/login/logout flows. Those flows
// pass whether or not the screen actually understands the real backend's
// error response shapes, because nothing ever fails along the way.
//
// `backend/tests/test_auth.py` already proves the *server* returns a
// field-specific 409/422 (nested under `detail`) and a generic 401; the
// frontend unit tests (`SignUp.test.tsx`, `Login.test.tsx`,
// `auth.test.tsx`) already prove `parseAuthError` reads that nested shape
// correctly in isolation. What none of those cover is the two halves
// actually wired together: a real signup/login request against the real,
// running backend, rendered by the real screen. That is what this file
// drives -- no mocked `fetch`, no stubbed route; every request here goes to
// the backend the webServer in playwright.config.ts starts.

const STRONG_PASSWORD = "Str0ngPass!";

function uniqueEmail(): string {
  return `qa-err-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`;
}

test.describe("signup and login error paths against the real backend", () => {
  test("signing up with an email that is already registered shows the server's own per-field message", async ({
    page,
  }) => {
    const email = uniqueEmail();

    // First signup: succeeds and claims the email for real.
    await page.goto("/sign-up");
    await page.getByLabel(/email address/i).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(STRONG_PASSWORD);
    await page.getByLabel(/confirm password/i).fill(STRONG_PASSWORD);
    await page.getByLabel(/answers come only from documents/i).check();
    await page.getByRole("button", { name: /create account/i }).click();
    await expect(page).toHaveURL(/\/documents/);

    // Second signup with the exact same (now-registered) email, from a
    // clean, logged-out browser state: the real backend answers 409 with
    // `{"detail": {"field": "email", "message": ...}}`, and the screen
    // must show that message against the email field, not a generic
    // service-unavailable banner and not silently succeed.
    await page.context().clearCookies();
    await page.goto("/sign-up");
    await page.getByLabel(/email address/i).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(STRONG_PASSWORD);
    await page.getByLabel(/confirm password/i).fill(STRONG_PASSWORD);
    await page.getByLabel(/answers come only from documents/i).check();
    await page.getByRole("button", { name: /create account/i }).click();

    await expect(page.getByText(/already exists/i)).toBeVisible();
    await expect(page.getByText(/sign-up service unavailable/i)).not.toBeVisible();
    // Never got past signup to the document library.
    await expect(page).toHaveURL(/\/sign-up/);
  });

  test("logging in with the wrong password shows the server's generic message, naming neither field", async ({
    page,
  }) => {
    const email = uniqueEmail();

    await page.goto("/sign-up");
    await page.getByLabel(/email address/i).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(STRONG_PASSWORD);
    await page.getByLabel(/confirm password/i).fill(STRONG_PASSWORD);
    await page.getByLabel(/answers come only from documents/i).check();
    await page.getByRole("button", { name: /create account/i }).click();
    await expect(page).toHaveURL(/\/documents/);

    await page.context().clearCookies();
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/^password$/i).fill("TotallyWrongPass1");
    await page.getByRole("button", { name: /log in/i }).click();

    await expect(page.getByText(/email or password is incorrect/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("logging in with an email that was never registered shows the identical generic message", async ({
    page,
  }) => {
    // AC-005 (enumeration protection), driven through the real backend: an
    // unregistered email must read exactly like a wrong password to
    // someone using the screen, not a different message that would let a
    // visitor learn whether an account exists.
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(uniqueEmail());
    await page.getByLabel(/^password$/i).fill("WhateverPass1");
    await page.getByRole("button", { name: /log in/i }).click();

    await expect(page.getByText(/email or password is incorrect/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});
