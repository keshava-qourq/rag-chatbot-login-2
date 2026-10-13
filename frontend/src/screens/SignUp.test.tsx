import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/lib/auth";

import SignUp from "./SignUp";

function renderSignUp() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={["/sign-up"]}>
        <Routes>
          <Route path="/sign-up" element={<SignUp />} />
          <Route path="/documents" element={<div>Documents screen</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

const VALID = { email: "person@example.com", password: "Password123" };

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/email address/i), VALID.email);
  await user.type(screen.getByLabelText(/^password$/i), VALID.password);
  await user.type(screen.getByLabelText(/confirm password/i), VALID.password);
  await user.click(screen.getByRole("checkbox"));
}

describe("SignUp", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts to /auth/signup with credentials included and navigates to /documents on success", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: "u1", email: VALID.email }),
    });
    const user = userEvent.setup();
    renderSignUp();
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => expect(screen.getByText("Documents screen")).toBeInTheDocument());

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/auth/signup"),
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
  });

  it("renders the server's field message on a 409 and shows no account-created state", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ field: "email", message: "That email is already registered." }),
    });
    const user = userEvent.setup();
    renderSignUp();
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() =>
      expect(screen.getAllByText("That email is already registered.").length).toBeGreaterThan(0),
    );
    expect(screen.queryByText("Documents screen")).not.toBeInTheDocument();
  });

  it("renders the server's field message on a 422 against the password field", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({ field: "password", message: "Password is too common." }),
    });
    const user = userEvent.setup();
    renderSignUp();
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() =>
      expect(screen.getAllByText("Password is too common.").length).toBeGreaterThan(0),
    );
    expect(screen.queryByText("Documents screen")).not.toBeInTheDocument();
  });
});
