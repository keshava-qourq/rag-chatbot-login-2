import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/lib/auth";

import Login from "./Login";

function renderLogin() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/documents" element={<div>Documents screen</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe("Login", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("has no hard-coded recent-session email prefill", () => {
    renderLogin();
    expect(screen.getByLabelText(/email address/i)).toHaveValue("");
  });

  it("posts to /auth/login with credentials included and navigates to /documents on success", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: "u1", email: "person@example.com" }),
    });
    const user = userEvent.setup();
    renderLogin();
    await user.type(screen.getByLabelText(/email address/i), "person@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "Password123");
    await user.click(screen.getByRole("button", { name: /^log in$/i }));

    await waitFor(() => expect(screen.getByText("Documents screen")).toBeInTheDocument());

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/auth/login"),
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
  });

  it("renders exactly the server's generic message on a 401 without indicating which field was wrong", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ message: "The email or password is incorrect." }),
    });
    const user = userEvent.setup();
    renderLogin();
    await user.type(screen.getByLabelText(/email address/i), "person@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "wrong-password");
    await user.click(screen.getByRole("button", { name: /^log in$/i }));

    expect(await screen.findByText("The email or password is incorrect.")).toBeInTheDocument();
    expect(screen.queryByText("Documents screen")).not.toBeInTheDocument();
  });

  it("AC-055: the password-visibility toggle and 'Create an account' link carry a 44px mobile tap-target floor that releases at lg", () => {
    renderLogin();

    const toggle = screen.getByRole("button", { name: /show password/i });
    expect(toggle).toHaveClass("min-h-11");
    expect(toggle).toHaveClass("lg:min-h-0");

    const createAccount = screen.getByRole("button", { name: /create an account/i });
    expect(createAccount).toHaveClass("min-h-11");
    expect(createAccount).toHaveClass("lg:min-h-0");
  });

  it("AC-055: the 'keep me signed in' checkbox grows to a 44x44 floor on mobile and releases it at lg", () => {
    renderLogin();
    const checkbox = screen.getByRole("checkbox", { name: /keep me signed in/i });
    expect(checkbox).toHaveClass("min-h-11");
    expect(checkbox).toHaveClass("min-w-11");
    expect(checkbox).toHaveClass("lg:min-h-0");
    expect(checkbox).toHaveClass("lg:min-w-0");
  });

  it("AC-055: the primary/secondary columns stack before the lg breakpoint, not a fixed two-column grid", () => {
    const { container } = renderLogin();
    const grid = container.querySelector(".grid");
    expect(grid).toHaveClass("lg:grid-cols-[minmax(0,1fr)_21rem]");
    expect(grid).not.toHaveClass("grid-cols-[minmax(0,1fr)_21rem]");
  });
});
