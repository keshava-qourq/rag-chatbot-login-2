import { NavLink, Navigate, Route, Routes } from "react-router-dom";

import SignUp from "@/screens/SignUp";
import Login from "@/screens/Login";
import Documents from "@/screens/Documents";
import Chat from "@/screens/Chat";
import GettingStarted from "@/screens/GettingStarted";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  [
    "block rounded-[var(--brand-radius)] px-3 py-2 text-sm font-medium transition-colors",
    isActive ? "bg-[var(--brand-hover)] text-[var(--brand-fg)]" : "text-[var(--brand-fg-muted)]",
  ].join(" ");

export default function App() {
  return (
    <div className="flex min-h-screen">
      <aside
        className="w-56 shrink-0 border-r p-4"
        style={{
          backgroundColor: "var(--brand-surface)",
          borderColor: "var(--brand-border)",
        }}
      >
        <p
          className="mb-4 px-3 text-sm font-semibold"
          style={{ fontFamily: "var(--brand-font-heading)" }}
        >
          {"RAG Chatbot Login (2)"}
        </p>
        <nav className="flex flex-col gap-1">
          <NavLink to="/sign-up" className={navLinkClass}>
            {"Sign up"}
          </NavLink>
          <NavLink to="/login" className={navLinkClass}>
            {"Log in"}
          </NavLink>
          <NavLink to="/documents" className={navLinkClass}>
            {"Document library"}
          </NavLink>
          <NavLink to="/chat" className={navLinkClass}>
            {"Chat"}
          </NavLink>
          <NavLink to="/getting-started" className={navLinkClass}>
            {"Getting started"}
          </NavLink>
        </nav>
      </aside>
      <main className="flex-1 overflow-auto">
        <Routes>
          <Route path="/sign-up" element={<SignUp />} />
          <Route path="/login" element={<Login />} />
          <Route path="/documents" element={<Documents />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/getting-started" element={<GettingStarted />} />
          <Route path="*" element={<Navigate to="/sign-up" replace />} />
        </Routes>
      </main>
    </div>
  );
}
