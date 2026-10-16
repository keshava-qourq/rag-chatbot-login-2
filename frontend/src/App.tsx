import { NavLink, Navigate, Route, Routes } from "react-router-dom";

import Documents from "@/screens/Documents";
import Chat from "@/screens/Chat";
import GettingStarted from "@/screens/GettingStarted";
import Settings from "@/screens/Settings";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  [
    "block rounded-[var(--brand-radius)] px-3 py-2 text-sm font-medium transition-colors",
    isActive ? "bg-[var(--brand-hover)] text-[var(--brand-fg)]" : "text-[var(--brand-fg-muted)]",
  ].join(" ");

// There is no login: the app opens straight onto the document library, and
// every visitor works in the same shared workspace.
export default function App() {
  return (
    <div className="flex min-h-screen">
      <aside
        className="flex w-56 shrink-0 flex-col justify-between border-r p-4"
        style={{
          backgroundColor: "var(--brand-surface)",
          borderColor: "var(--brand-border)",
        }}
      >
        <div>
          <p
            className="mb-4 px-3 text-sm font-semibold"
            style={{ fontFamily: "var(--brand-font-heading)" }}
          >
            {"RAG Chatbot Login (2)"}
          </p>
          <nav className="flex flex-col gap-1">
            <NavLink to="/documents" className={navLinkClass}>
              {"Document library"}
            </NavLink>
            <NavLink to="/chat" className={navLinkClass}>
              {"Chat"}
            </NavLink>
            <NavLink to="/getting-started" className={navLinkClass}>
              {"Getting started"}
            </NavLink>
            <NavLink to="/settings" className={navLinkClass}>
              {"Settings"}
            </NavLink>
          </nav>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <Routes>
          <Route path="/documents" element={<Documents />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/getting-started" element={<GettingStarted />} />
          <Route path="/settings" element={<Settings />} />
          {/* Old /login and /sign-up links land here too. */}
          <Route path="*" element={<Navigate to="/documents" replace />} />
        </Routes>
      </main>
    </div>
  );
}
