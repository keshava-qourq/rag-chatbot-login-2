// @ts-nocheck -- generated from the approved design under its JS runtime contract; not hand-written TypeScript.
/* eslint-disable @typescript-eslint/no-unused-vars */
import React from "react";

import * as UI from "@/lib/ui";
import { Icons } from "@/lib/icons";
import { brand } from "@/lib/brand";
import { useNavigate } from "@/lib/navigate";

const { Button, Input, Label } = UI;
const { Search, Check, X, ChevronRight, ChevronDown, FileText, Clock, Trash, Filter, Upload, ArrowRight, AlertCircle, CheckCircle } = Icons;

const UIKit = (typeof UI !== "undefined" && UI) ? UI : {};
const Ico = (typeof Icons !== "undefined" && Icons) ? Icons : {};

const Btn = UIKit.Button || function FallbackButton(props) {
  const { children, ...rest } = props;
  return React.createElement("button", rest, children);
};
const TextField = UIKit.Input || function FallbackInput(props) {
  return React.createElement("input", props);
};
const FieldLabel = UIKit.Label || function FallbackLabel(props) {
  const { children, ...rest } = props;
  return React.createElement("label", rest, children);
};

const I = {
  File: Ico.FileText || (() => null),
  Upload: Ico.Upload || (() => null),
  Trash: Ico.Trash || (() => null),
  Alert: Ico.AlertCircle || (() => null),
  Check: Ico.CheckCircle || (() => null),
  Search: Ico.Search || (() => null),
  Down: Ico.ChevronDown || (() => null),
  Right: Ico.ChevronRight || (() => null),
  Close: Ico.X || (() => null),
  Clock: Ico.Clock || (() => null),
  Arrow: Ico.ArrowRight || (() => null),
};

/* ---------- colour helpers: everything derives from brand tokens ---------- */
function toRgb(hex) {
  const h = String(hex).replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
function rgba(hex, a) {
  const [r, g, b] = toRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
function shade(hex, amt) {
  const [r, g, b] = toRgb(hex);
  const t = amt > 0 ? 255 : 0;
  const p = Math.abs(amt);
  const m = (c) => Math.round(c + (t - c) * p);
  return `rgb(${m(r)}, ${m(g)}, ${m(b)})`;
}

const MAX_BYTES = 25 * 1024 * 1024;
const MAX_PAGES = 400;
const SUPPORTED = ["pdf", "docx", "md", "txt"];
const ACCOUNT_EMAIL = "kate.mercer@northbrook.co.uk";

const INITIAL_DOCS = [
  {
    id: "doc_9f21ab",
    filename: "Northbrook-Pension-Scheme-Rules-2026.pdf",
    kind: "pdf",
    size_bytes: 8_412_160,
    page_count: 214,
    unit: "pages",
    status: "processing",
    progress: 58,
    chunks: 0,
    failure_reason: null,
    created_at: "2026-10-13T09:12:00",
    s3_key: "u-4417/9f21ab/pension-scheme-rules.pdf",
  },
  {
    id: "doc_8c0471",
    filename: "Q3-Board-Pack-October.docx",
    kind: "docx",
    size_bytes: 2_201_088,
    page_count: 48,
    unit: "pages",
    status: "queued",
    progress: 0,
    chunks: 0,
    failure_reason: null,
    created_at: "2026-10-13T08:55:00",
    s3_key: "u-4417/8c0471/q3-board-pack.docx",
  },
  {
    id: "doc_2a1839",
    filename: "Insurance-Renewal-Pack-2027.pdf",
    kind: "pdf",
    size_bytes: 19_241_472,
    page_count: 302,
    unit: "pages",
    status: "failed",
    progress: 0,
    chunks: 0,
    failure_reason:
      "The assistant service was unavailable. We tried three times over four minutes and stopped.",
    created_at: "2026-10-12T16:40:00",
    s3_key: "u-4417/2a1839/insurance-renewal.pdf",
  },
  {
    id: "doc_7b5520",
    filename: "Supplier-Agreement-Vectra-signed.pdf",
    kind: "pdf",
    size_bytes: 1_438_515,
    page_count: 22,
    unit: "pages",
    status: "ready",
    progress: 100,
    chunks: 96,
    failure_reason: null,
    created_at: "2026-10-12T11:03:00",
    s3_key: "u-4417/7b5520/supplier-agreement-vectra.pdf",
  },
  {
    id: "doc_5d7744",
    filename: "Scanned-invoices-September.pdf",
    kind: "pdf",
    size_bytes: 11_795_628,
    page_count: 64,
    unit: "pages",
    status: "failed",
    progress: 0,
    chunks: 0,
    failure_reason:
      "No readable text found. These pages look like photographs of paper, and we cannot read scans yet.",
    created_at: "2026-10-09T14:21:00",
    s3_key: "u-4417/5d7744/scanned-invoices-sept.pdf",
  },
  {
    id: "doc_6a1205",
    filename: "onboarding-handbook.md",
    kind: "md",
    size_bytes: 188_416,
    page_count: 31,
    unit: "sections",
    status: "ready",
    progress: 100,
    chunks: 74,
    failure_reason: null,
    created_at: "2026-10-08T09:47:00",
    s3_key: "u-4417/6a1205/onboarding-handbook.md",
  },
  {
    id: "doc_4e3118",
    filename: "Data-Protection-Policy-v4.docx",
    kind: "docx",
    size_bytes: 655_360,
    page_count: 18,
    unit: "pages",
    status: "ready",
    progress: 100,
    chunks: 61,
    failure_reason: null,
    created_at: "2026-10-07T15:12:00",
    s3_key: "u-4417/4e3118/data-protection-policy-v4.docx",
  },
  {
    id: "doc_3f9002",
    filename: "meeting-notes-2026-10-06.txt",
    kind: "txt",
    size_bytes: 24_576,
    page_count: 3,
    unit: "sections",
    status: "ready",
    progress: 100,
    chunks: 11,
    failure_reason: null,
    created_at: "2026-10-06T17:30:00",
    s3_key: "u-4417/3f9002/meeting-notes-2026-10-06.txt",
  },
];

const STATUS_COPY = {
  queued: {
    label: "Queued",
    note: "Waiting for a free worker. You can close this page.",
  },
  processing: {
    label: "Processing",
    note: "Reading the text, splitting it into passages and embedding them.",
  },
  ready: { label: "Ready", note: "Included in every answer you ask for." },
  failed: { label: "Failed", note: "Nothing from this file can be used yet." },
};

function fmtBytes(b) {
  if (b >= 1048576) return (b / 1048576).toFixed(1) + " MB";
  if (b >= 1024) return Math.round(b / 1024) + " KB";
  return b + " B";
}
function fmtWhen(iso) {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return date + ", " + time;
}
function clockNow() {
  return new Date().toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Screen() {
  const navigate = useNavigate();
  const INK = shade(brand.neutralColor, -0.62);
  const BODY = brand.neutralColor;
  const LINE = rgba(brand.neutralColor, 0.2);
  const SURFACE = shade(brand.backgroundColor, 0.72);
  const ACCENT_INK = shade(brand.accentColor, -0.34);
  const PRIMARY_INK = brand.primaryColor;
  const FAIL_BG = shade(brand.neutralColor, -0.42);
  const R = brand.radius;

  const [docs, setDocs] = React.useState(INITIAL_DOCS);
  const [loading, setLoading] = React.useState(true);
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState("all");
  const [notices, setNotices] = React.useState([]);
  const [expanded, setExpanded] = React.useState(null);
  const [pendingDelete, setPendingDelete] = React.useState(null);
  const [live, setLive] = React.useState(true);
  const [lastChecked, setLastChecked] = React.useState("09:41");
  const [dragging, setDragging] = React.useState(false);

  const noticeId = React.useRef(0);
  const docsRef = React.useRef(docs);
  const fileRef = React.useRef(null);
  const cancelRef = React.useRef(null);
  const returnFocusRef = React.useRef(null);

  React.useEffect(() => {
    docsRef.current = docs;
  });

  React.useEffect(() => {
    const t = setTimeout(() => setLoading(false), 650);
    return () => clearTimeout(t);
  }, []);

  const addNotice = React.useCallback((n) => {
    noticeId.current += 1;
    const item = { id: noticeId.current, ...n };
    setNotices((prev) => [item, ...prev].slice(0, 4));
  }, []);

  /* live status advancement — the queue moving in front of the user */
  React.useEffect(() => {
    if (!live || loading) return undefined;
    const t = setInterval(() => {
      const becameReady = [];
      const next = docsRef.current.map((d) => {
        if (d.status === "processing") {
          const p = Math.min(100, d.progress + 9 + Math.round(Math.random() * 9));
          if (p >= 100) {
            becameReady.push(d.filename);
            return {
              ...d,
              status: "ready",
              progress: 100,
              chunks: Math.max(6, Math.round((d.page_count || 12) * 2.4)),
            };
          }
          return { ...d, progress: p };
        }
        if (d.status === "queued") {
          const ticks = (d.queueTicks || 0) + 1;
          if (ticks >= 2) {
            const pages =
              d.page_count || Math.max(1, Math.round(d.size_bytes / 42000));
            return {
              ...d,
              status: "processing",
              progress: 5,
              page_count: pages,
              queueTicks: 0,
            };
          }
          return { ...d, queueTicks: ticks };
        }
        return d;
      });
      setDocs(next);
      setLastChecked(clockNow());
      if (becameReady.length) {
        addNotice({
          tone: "success",
          title:
            becameReady.length === 1
              ? becameReady[0] + " is ready"
              : becameReady.length + " documents are ready",
          body: "Its passages are embedded and will be searched the next time you ask a question.",
        });
      }
    }, 1600);
    return () => clearInterval(t);
  }, [live, loading, addNotice]);

  /* dialog: escape to close, focus the safe action */
  React.useEffect(() => {
    if (!pendingDelete) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") closeDialog();
    };
    window.addEventListener("keydown", onKey);
    const t = setTimeout(() => cancelRef.current && cancelRef.current.focus(), 20);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [pendingDelete]);

  function closeDialog() {
    setPendingDelete(null);
    if (returnFocusRef.current && returnFocusRef.current.focus) {
      returnFocusRef.current.focus();
    }
  }

  function acceptFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const accepted = [];
    files.forEach((f) => {
      const ext = (f.name.split(".").pop() || "").toLowerCase();
      if (SUPPORTED.indexOf(ext) === -1) {
        addNotice({
          tone: "error",
          title: "We can’t read “" + f.name + "”",
          body:
            "That’s a ." +
            (ext || "file") +
            " file. Upload PDF, Word (.docx), Markdown (.md) or plain text (.txt) instead — nothing else was changed.",
        });
        return;
      }
      if (f.size > MAX_BYTES) {
        addNotice({
          tone: "error",
          title: "“" + f.name + "” is too large",
          body:
            "It is " +
            fmtBytes(f.size) +
            ". The limit is 25.0 MB per file, or about " +
            MAX_PAGES +
            " pages. Try splitting it and uploading the parts.",
        });
        return;
      }
      accepted.push({
        id: "doc_" + Math.random().toString(16).slice(2, 8),
        filename: f.name,
        kind: ext,
        size_bytes: f.size,
        page_count: null,
        unit: ext === "md" || ext === "txt" ? "sections" : "pages",
        status: "queued",
        progress: 0,
        chunks: 0,
        failure_reason: null,
        created_at: new Date().toISOString(),
        s3_key: "u-4417/" + Math.random().toString(16).slice(2, 8) + "/" + f.name,
        isNew: true,
        queueTicks: 0,
      });
    });
    if (accepted.length) {
      setDocs((prev) => [...accepted, ...prev]);
      addNotice({
        tone: "success",
        title:
          accepted.length === 1
            ? "“" + accepted[0].filename + "” was added to the queue"
            : accepted.length + " files were added to the queue",
        body: "Each one is processed on its own. You can leave this page — we keep going without you.",
      });
      setFilter("all");
      setQuery("");
    }
  }

  function retry(doc) {
    setDocs((prev) =>
      prev.map((d) =>
        d.id === doc.id
          ? {
              ...d,
              status: "queued",
              failure_reason: null,
              progress: 0,
              chunks: 0,
              queueTicks: 0,
            }
          : d
      )
    );
    addNotice({
      tone: "info",
      title: "Trying “" + doc.filename + "” again",
      body: "We discarded the half-finished text from the last attempt and put the file back in the queue.",
    });
  }

  function confirmDelete() {
    const doc = pendingDelete;
    setDocs((prev) => prev.filter((d) => d.id !== doc.id));
    addNotice({
      tone: "success",
      title: "“" + doc.filename + "” was deleted",
      body: "The file, its extracted text and its embeddings are gone. Answers can no longer quote it.",
    });
    setPendingDelete(null);
    if (returnFocusRef.current && returnFocusRef.current.focus) {
      returnFocusRef.current.focus();
    }
  }

  const counts = {
    all: docs.length,
    ready: docs.filter((d) => d.status === "ready").length,
    progress: docs.filter((d) => d.status === "queued" || d.status === "processing")
      .length,
    failed: docs.filter((d) => d.status === "failed").length,
  };
  const stored = docs.reduce((s, d) => s + d.size_bytes, 0);

  const q = query.trim().toLowerCase();
  const visible = docs.filter((d) => {
    const matchQ = !q || d.filename.toLowerCase().indexOf(q) !== -1;
    const matchF =
      filter === "all"
        ? true
        : filter === "progress"
        ? d.status === "queued" || d.status === "processing"
        : d.status === filter;
    return matchQ && matchF;
  });

  const FILTERS = [
    { key: "all", label: "All documents", n: counts.all },
    { key: "ready", label: "Ready", n: counts.ready },
    { key: "progress", label: "In progress", n: counts.progress },
    { key: "failed", label: "Failed", n: counts.failed },
  ];

  const css =
    "@keyframes rowIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}" +
    "@keyframes noteIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}" +
    "@keyframes panelIn{from{opacity:0;max-height:0}to{opacity:1;max-height:420px}}" +
    "@keyframes pulseSoft{0%,100%{opacity:1}50%{opacity:.45}}" +
    "@keyframes shimmer{0%{opacity:.5}50%{opacity:.9}100%{opacity:.5}}" +
    ".fv:focus-visible{outline:2px solid " +
    brand.primaryColor +
    ";outline-offset:2px}" +
    "@media (prefers-reduced-motion: reduce){*{animation:none !important;transition:none !important}}";

  function StatusChip({ status, small }) {
    const base =
      "inline-flex items-center gap-2 rounded-full font-semibold " +
      (small ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-sm");
    const map = {
      ready: {
        bg: rgba(brand.accentColor, 0.14),
        fg: ACCENT_INK,
        bd: rgba(brand.accentColor, 0.35),
      },
      processing: {
        bg: rgba(brand.primaryColor, 0.12),
        fg: PRIMARY_INK,
        bd: rgba(brand.primaryColor, 0.3),
      },
      queued: {
        bg: rgba(brand.neutralColor, 0.12),
        fg: shade(brand.neutralColor, -0.3),
        bd: rgba(brand.neutralColor, 0.28),
      },
      failed: { bg: FAIL_BG, fg: shade(brand.backgroundColor, 0.6), bd: FAIL_BG },
    };
    const s = map[status];
    return (
      <span
        className={base}
        style={{
          backgroundColor: s.bg,
          color: s.fg,
          border: "1px solid " + s.bd,
        }}
      >
        {status === "processing" ? (
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-full"
            style={{
              backgroundColor: PRIMARY_INK,
              animation: "pulseSoft 1.4s ease-in-out infinite",
            }}
          />
        ) : null}
        {status === "failed" ? (
          <span aria-hidden="true" className="inline-flex">
            <I.Alert className="h-3.5 w-3.5" />
          </span>
        ) : null}
        {STATUS_COPY[status].label}
      </span>
    );
  }

  function GhostButton({ children, onClick, title, danger, forwardRef }) {
    return (
      <Btn
        ref={forwardRef}
        type="button"
        onClick={onClick}
        title={title}
        className="fv inline-flex min-h-[40px] items-center gap-2 px-3 py-2 text-sm font-semibold transition-colors"
        style={{
          backgroundColor: "transparent",
          color: danger ? shade(brand.neutralColor, -0.35) : PRIMARY_INK,
          border: "1px solid " + LINE,
          borderRadius: R,
        }}
      >
        {children}
      </Btn>
    );
  }

  return (
    <div
      className="min-h-full"
      style={{
        backgroundColor: brand.backgroundColor,
        fontFamily: brand.fontBody,
        color: BODY,
      }}
    >
      <style>{css}</style>

      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        {/* ---------------- heading ---------------- */}
        <header className="mb-8">
          <p
            className="text-xs font-semibold uppercase tracking-[0.14em]"
            style={{ color: BODY }}
          >
            Step 1 of 3 · Your material
          </p>
          <h1
            className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl"
            style={{ color: INK, fontFamily: brand.fontHeading }}
          >
            Document library
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed" style={{ color: BODY }}>
            Everything here belongs to <span style={{ color: INK }}>{ACCOUNT_EMAIL}</span> and
            nobody else can see it. Only documents marked <strong>Ready</strong> are used when
            the assistant answers a question.
          </p>
        </header>

        {/* ---------------- focal point: upload ---------------- */}
        <section aria-labelledby="upload-heading" className="mb-8">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              acceptFiles(e.dataTransfer && e.dataTransfer.files);
            }}
            className="px-5 py-8 text-center transition-all sm:px-10 sm:py-12"
            style={{
              borderRadius: "calc(" + R + " * 1.5)",
              backgroundColor: dragging ? rgba(brand.primaryColor, 0.06) : SURFACE,
              border:
                "2px dashed " +
                (dragging ? brand.primaryColor : rgba(brand.primaryColor, 0.35)),
              boxShadow: "0 1px 2px " + rgba(brand.neutralColor, 0.08),
            }}
          >
            <span
              aria-hidden="true"
              className="mx-auto mb-4 grid h-12 w-12 place-items-center"
              style={{
                borderRadius: R,
                backgroundColor: rgba(brand.primaryColor, 0.1),
                color: PRIMARY_INK,
              }}
            >
              <I.Upload className="h-6 w-6" />
            </span>
            <h2
              id="upload-heading"
              className="text-xl font-semibold tracking-tight sm:text-2xl"
              style={{ color: INK, fontFamily: brand.fontHeading }}
            >
              Add a document to ask questions about
            </h2>
            <p
              className="mx-auto mt-2 max-w-md text-sm leading-relaxed"
              style={{ color: BODY }}
            >
              Drag files here, or choose them from your device. PDF, Word, Markdown and plain
              text — up to 25.0 MB and about 400 pages each.
            </p>

            <FieldLabel htmlFor="library-file-input" className="sr-only">
              Choose documents to upload
            </FieldLabel>
            <input
              id="library-file-input"
              ref={fileRef}
              type="file"
              multiple
              tabIndex={-1}
              accept=".pdf,.docx,.md,.txt"
              className="sr-only"
              onChange={(e) => {
                acceptFiles(e.target.files);
                e.target.value = "";
              }}
            />

            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Btn
                type="button"
                onClick={() => fileRef.current && fileRef.current.click()}
                className="fv inline-flex w-full min-h-[48px] items-center justify-center gap-2 px-6 py-3 text-base font-semibold transition-transform sm:w-auto"
                style={{
                  backgroundColor: brand.primaryColor,
                  color: shade(brand.backgroundColor, 0.85),
                  borderRadius: R,
                  border: "1px solid " + brand.primaryColor,
                  boxShadow: "0 2px 10px " + rgba(brand.primaryColor, 0.28),
                }}
              >
                <span aria-hidden="true" className="inline-flex">
                  <I.Upload className="h-5 w-5" />
                </span>
                Choose files
              </Btn>
              <Btn
                type="button"
                onClick={() => navigate("getting-started")}
                className="fv inline-flex w-full min-h-[48px] items-center justify-center gap-2 px-5 py-3 text-base font-semibold sm:w-auto"
                style={{
                  backgroundColor: "transparent",
                  color: PRIMARY_INK,
                  border: "1px solid " + rgba(brand.primaryColor, 0.4),
                  borderRadius: R,
                }}
              >
                What happens next?
                <span aria-hidden="true" className="inline-flex">
                  <I.Right className="h-4 w-4" />
                </span>
              </Btn>
            </div>
          </div>
        </section>

        {/* ---------------- notices ---------------- */}
        <div aria-live="polite" className="space-y-3">
          {notices.map((n) => {
            const tone =
              n.tone === "error"
                ? { bg: SURFACE, bd: FAIL_BG, fg: FAIL_BG, Icon: I.Alert }
                : n.tone === "success"
                ? {
                    bg: rgba(brand.accentColor, 0.09),
                    bd: rgba(brand.accentColor, 0.4),
                    fg: ACCENT_INK,
                    Icon: I.Check,
                  }
                : {
                    bg: rgba(brand.primaryColor, 0.07),
                    bd: rgba(brand.primaryColor, 0.3),
                    fg: PRIMARY_INK,
                    Icon: I.Clock,
                  };
            const Icon = tone.Icon;
            return (
              <div
                key={n.id}
                className="mb-3 flex items-start gap-3 px-4 py-3.5"
                style={{
                  backgroundColor: tone.bg,
                  border: "1px solid " + tone.bd,
                  borderRadius: R,
                  animation: "noteIn 220ms ease-out",
                }}
              >
                <span aria-hidden="true" className="mt-0.5 inline-flex" style={{ color: tone.fg }}>
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold" style={{ color: INK }}>
                    {n.title}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed" style={{ color: BODY }}>
                    {n.body}
                  </p>
                </div>
                <Btn
                  type="button"
                  aria-label={"Dismiss: " + n.title}
                  onClick={() => setNotices((prev) => prev.filter((x) => x.id !== n.id))}
                  className="fv inline-flex h-9 w-9 shrink-0 items-center justify-center"
                  style={{
                    backgroundColor: "transparent",
                    color: BODY,
                    border: "1px solid transparent",
                    borderRadius: R,
                  }}
                >
                  <span aria-hidden="true" className="inline-flex">
                    <I.Close className="h-4 w-4" />
                  </span>
                </Btn>
              </div>
            );
          })}
        </div>

        {/* ---------------- summary strip ---------------- */}
        <div
          className="mb-6 grid grid-cols-2 gap-px overflow-hidden sm:grid-cols-4"
          style={{
            borderRadius: R,
            border: "1px solid " + LINE,
            backgroundColor: LINE,
          }}
        >
          {[
            { label: "Ready to query", value: counts.ready, tone: ACCENT_INK },
            { label: "In progress", value: counts.progress, tone: PRIMARY_INK },
            { label: "Needs attention", value: counts.failed, tone: INK },
            { label: "Stored", value: fmtBytes(stored), tone: INK },
          ].map((s) => (
            <div key={s.label} className="px-4 py-4" style={{ backgroundColor: SURFACE }}>
              <p
                className="text-[11px] font-semibold uppercase tracking-[0.12em]"
                style={{ color: BODY }}
              >
                {s.label}
              </p>
              <p
                className="mt-1 text-2xl font-semibold"
                style={{ color: s.tone, fontVariantNumeric: "tabular-nums" }}
              >
                {s.value}
              </p>
            </div>
          ))}
        </div>

        {/* ---------------- list header + controls ---------------- */}
        <section aria-labelledby="library-heading">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2
                id="library-heading"
                className="text-xl font-semibold tracking-tight"
                style={{ color: INK, fontFamily: brand.fontHeading }}
              >
                Your documents
              </h2>
              <p className="mt-1 text-sm" style={{ color: BODY }}>
                {live ? (
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>
                    Statuses update on their own · last checked {lastChecked}
                  </span>
                ) : (
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>
                    Updates paused · statuses are from {lastChecked}
                  </span>
                )}
              </p>
            </div>
            <Btn
              type="button"
              role="switch"
              aria-checked={live}
              onClick={() => {
                setLive((v) => !v);
                setLastChecked(clockNow());
              }}
              className="fv inline-flex min-h-[40px] items-center gap-2.5 px-3 py-2 text-sm font-semibold"
              style={{
                backgroundColor: live ? rgba(brand.accentColor, 0.1) : SURFACE,
                color: live ? ACCENT_INK : shade(brand.neutralColor, -0.25),
                border: "1px solid " + (live ? rgba(brand.accentColor, 0.4) : LINE),
                borderRadius: R,
              }}
            >
              <span
                aria-hidden="true"
                className="relative h-5 w-9 rounded-full transition-colors"
                style={{
                  backgroundColor: live
                    ? brand.accentColor
                    : rgba(brand.neutralColor, 0.35),
                }}
              >
                <span
                  className="absolute top-0.5 h-4 w-4 rounded-full transition-all"
                  style={{
                    left: live ? "18px" : "2px",
                    backgroundColor: shade(brand.backgroundColor, 0.9),
                  }}
                />
              </span>
              Live updates {live ? "on" : "off"}
            </Btn>
          </div>

          {!live ? (
            <div
              className="mb-5 flex flex-wrap items-center gap-3 px-4 py-3"
              style={{
                backgroundColor: SURFACE,
                border: "1px dashed " + rgba(brand.neutralColor, 0.4),
                borderRadius: R,
              }}
            >
              <span aria-hidden="true" className="inline-flex" style={{ color: BODY }}>
                <I.Clock className="h-4 w-4" />
              </span>
              <p className="text-sm" style={{ color: BODY }}>
                You paused live updates. Documents keep processing in the background — this list
                just isn’t refreshing.
              </p>
              <Btn
                type="button"
                onClick={() => {
                  setLive(true);
                  setLastChecked(clockNow());
                }}
                className="fv ml-auto min-h-[36px] px-3 py-1.5 text-sm font-semibold"
                style={{
                  backgroundColor: "transparent",
                  color: PRIMARY_INK,
                  border: "1px solid " + rgba(brand.primaryColor, 0.4),
                  borderRadius: R,
                }}
              >
                Resume updates
              </Btn>
            </div>
          ) : null}

          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="w-full lg:max-w-xs">
              <FieldLabel
                htmlFor="doc-search"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em]"
                style={{ color: BODY }}
              >
                Find a document
              </FieldLabel>
              <div className="relative">
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
                  style={{ color: BODY }}
                >
                  <I.Search className="h-4 w-4" />
                </span>
                <TextField
                  id="doc-search"
                  type="text"
                  value={query}
                  placeholder="e.g. pension"
                  onChange={(e) => setQuery(e.target.value)}
                  className="fv w-full min-h-[44px] pl-9 pr-3 text-sm"
                  style={{
                    backgroundColor: SURFACE,
                    border: "1px solid " + LINE,
                    borderRadius: R,
                    color: INK,
                  }}
                />
              </div>
            </div>

            <div
              role="group"
              aria-label="Filter documents by status"
              className="flex flex-wrap gap-2"
            >
              {FILTERS.map((f) => {
                const on = filter === f.key;
                return (
                  <Btn
                    key={f.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setFilter(f.key)}
                    className="fv inline-flex min-h-[44px] items-center gap-2 px-3.5 py-2 text-sm font-semibold transition-colors"
                    style={{
                      backgroundColor: on ? brand.primaryColor : SURFACE,
                      color: on ? shade(brand.backgroundColor, 0.9) : shade(brand.neutralColor, -0.25),
                      border: "1px solid " + (on ? brand.primaryColor : LINE),
                      borderRadius: R,
                    }}
                  >
                    {f.label}
                    <span
                      className="text-xs"
                      style={{
                        fontVariantNumeric: "tabular-nums",
                        opacity: on ? 0.85 : 0.7,
                      }}
                    >
                      {f.n}
                    </span>
                  </Btn>
                );
              })}
            </div>
          </div>

          {/* ---------------- list / states ---------------- */}
          {loading ? (
            <ul className="space-y-3" aria-busy="true" aria-label="Loading your documents">
              {[0, 1, 2].map((i) => (
                <li
                  key={i}
                  className="px-5 py-6"
                  style={{
                    backgroundColor: SURFACE,
                    border: "1px solid " + LINE,
                    borderRadius: R,
                    animation: "shimmer 1.3s ease-in-out infinite",
                    animationDelay: i * 140 + "ms",
                  }}
                >
                  <div className="flex items-center gap-4">
                    <div
                      className="h-11 w-11 shrink-0"
                      style={{
                        borderRadius: R,
                        backgroundColor: rgba(brand.neutralColor, 0.14),
                      }}
                    />
                    <div className="flex-1 space-y-2">
                      <div
                        className="h-3.5 w-2/5 rounded"
                        style={{ backgroundColor: rgba(brand.neutralColor, 0.16) }}
                      />
                      <div
                        className="h-3 w-1/4 rounded"
                        style={{ backgroundColor: rgba(brand.neutralColor, 0.1) }}
                      />
                    </div>
                  </div>
                </li>
              ))}
              <li className="pt-1 text-sm" style={{ color: BODY }}>
                Checking your library…
              </li>
            </ul>
          ) : docs.length === 0 ? (
            <div
              className="px-6 py-12 text-center"
              style={{
                backgroundColor: SURFACE,
                border: "1px solid " + LINE,
                borderRadius: "calc(" + R + " * 1.5)",
              }}
            >
              <span
                aria-hidden="true"
                className="mx-auto mb-4 grid h-12 w-12 place-items-center"
                style={{
                  borderRadius: R,
                  backgroundColor: rgba(brand.neutralColor, 0.1),
                  color: BODY,
                }}
              >
                <I.File className="h-6 w-6" />
              </span>
              <h3
                className="text-lg font-semibold"
                style={{ color: INK, fontFamily: brand.fontHeading }}
              >
                Your library is empty
              </h3>
              <p
                className="mx-auto mt-2 max-w-sm text-sm leading-relaxed"
                style={{ color: BODY }}
              >
                Upload one file to start. We read the text, break it into passages and tell you
                when it is ready — usually a minute or two for a long PDF. Until then there is
                nothing for the assistant to search.
              </p>
              <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Btn
                  type="button"
                  onClick={() => fileRef.current && fileRef.current.click()}
                  className="fv min-h-[44px] w-full px-5 py-2.5 text-sm font-semibold sm:w-auto"
                  style={{
                    backgroundColor: brand.primaryColor,
                    color: shade(brand.backgroundColor, 0.9),
                    border: "1px solid " + brand.primaryColor,
                    borderRadius: R,
                  }}
                >
                  Upload your first document
                </Btn>
                <Btn
                  type="button"
                  onClick={() => navigate("getting-started")}
                  className="fv min-h-[44px] w-full px-5 py-2.5 text-sm font-semibold sm:w-auto"
                  style={{
                    backgroundColor: "transparent",
                    color: PRIMARY_INK,
                    border: "1px solid " + rgba(brand.primaryColor, 0.4),
                    borderRadius: R,
                  }}
                >
                  Read getting started
                </Btn>
              </div>
            </div>
          ) : visible.length === 0 ? (
            <div
              className="px-6 py-10 text-center"
              style={{
                backgroundColor: SURFACE,
                border: "1px dashed " + rgba(brand.neutralColor, 0.4),
                borderRadius: "calc(" + R + " * 1.5)",
              }}
            >
              <h3 className="text-base font-semibold" style={{ color: INK }}>
                Nothing matches {q ? "“" + query + "”" : "that filter"}
              </h3>
              <p className="mx-auto mt-2 max-w-sm text-sm" style={{ color: BODY }}>
                You have {docs.length} documents in your library. Try a different word, or show
                all of them.
              </p>
              <Btn
                type="button"
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                }}
                className="fv mt-5 min-h-[44px] px-5 py-2.5 text-sm font-semibold"
                style={{
                  backgroundColor: "transparent",
                  color: PRIMARY_INK,
                  border: "1px solid " + rgba(brand.primaryColor, 0.4),
                  borderRadius: R,
                }}
              >
                Clear search and filters
              </Btn>
            </div>
          ) : (
            <ul className="space-y-3">
              {visible.map((d) => {
                const open = expanded === d.id;
                return (
                  <li
                    key={d.id}
                    style={{ animation: d.isNew ? "rowIn 280ms ease-out" : "none" }}
                  >
                    <div
                      className="px-4 py-4 transition-shadow sm:px-5 sm:py-5"
                      style={{
                        backgroundColor: SURFACE,
                        border:
                          "1px solid " +
                          (d.status === "failed" ? rgba(brand.neutralColor, 0.42) : LINE),
                        borderRadius: R,
                      }}
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex min-w-0 gap-3">
                          <span
                            aria-hidden="true"
                            className="grid h-11 w-11 shrink-0 place-items-center text-[11px] font-bold tracking-wide"
                            style={{
                              borderRadius: R,
                              backgroundColor: rgba(brand.primaryColor, 0.08),
                              color: PRIMARY_INK,
                            }}
                          >
                            {d.kind.toUpperCase()}
                          </span>
                          <div className="min-w-0">
                            <h3
                              className="truncate text-[15px] font-semibold"
                              style={{ color: INK }}
                              title={d.filename}
                            >
                              {d.filename}
                            </h3>
                            <p
                              className="mt-1 text-sm"
                              style={{ color: BODY, fontVariantNumeric: "tabular-nums" }}
                            >
                              {fmtWhen(d.created_at)} · {fmtBytes(d.size_bytes)} ·{" "}
                              {d.page_count
                                ? d.page_count + " " + d.unit
                                : "counting " + d.unit + "…"}
                            </p>

                            {d.status === "processing" ? (
                              <div className="mt-3 max-w-sm">
                                <div
                                  className="h-1.5 w-full overflow-hidden rounded-full"
                                  style={{ backgroundColor: rgba(brand.primaryColor, 0.14) }}
                                >
                                  <div
                                    className="h-full rounded-full transition-all duration-700"
                                    style={{
                                      width: d.progress + "%",
                                      backgroundColor: brand.primaryColor,
                                    }}
                                  />
                                </div>
                                <p
                                  className="mt-1.5 text-xs"
                                  style={{
                                    color: BODY,
                                    fontVariantNumeric: "tabular-nums",
                                  }}
                                >
                                  {d.progress}% — reading text and embedding passages
                                </p>
                              </div>
                            ) : null}

                            {d.status === "failed" ? (
                              <p
                                className="mt-2 max-w-xl text-sm leading-relaxed"
                                style={{ color: shade(brand.neutralColor, -0.3) }}
                              >
                                <strong style={{ color: INK }}>Why it stopped: </strong>
                                {d.failure_reason}
                              </p>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                          <StatusChip status={d.status} />
                          {d.status === "ready" ? (
                            <GhostButton onClick={() => navigate("chat")}>
                              Ask about this
                              <span aria-hidden="true" className="inline-flex">
                                <I.Arrow className="h-4 w-4" />
                              </span>
                            </GhostButton>
                          ) : null}
                          {d.status === "failed" ? (
                            <Btn
                              type="button"
                              onClick={() => retry(d)}
                              className="fv inline-flex min-h-[40px] items-center gap-2 px-3.5 py-2 text-sm font-semibold"
                              style={{
                                backgroundColor: brand.primaryColor,
                                color: shade(brand.backgroundColor, 0.9),
                                border: "1px solid " + brand.primaryColor,
                                borderRadius: R,
                              }}
                            >
                              Try again
                            </Btn>
                          ) : null}
                          <Btn
                            type="button"
                            aria-expanded={open}
                            onClick={() => setExpanded(open ? null : d.id)}
                            className="fv inline-flex min-h-[40px] items-center gap-1.5 px-3 py-2 text-sm font-semibold"
                            style={{
                              backgroundColor: "transparent",
                              color: shade(brand.neutralColor, -0.25),
                              border: "1px solid " + LINE,
                              borderRadius: R,
                            }}
                          >
                            Details
                            <span
                              aria-hidden="true"
                              className="inline-flex transition-transform"
                              style={{ transform: open ? "rotate(180deg)" : "none" }}
                            >
                              <I.Down className="h-4 w-4" />
                            </span>
                          </Btn>
                          <Btn
                            type="button"
                            aria-label={"Delete " + d.filename}
                            onClick={(e) => {
                              returnFocusRef.current = e.currentTarget;
                              setPendingDelete(d);
                            }}
                            className="fv inline-flex h-10 w-10 items-center justify-center"
                            style={{
                              backgroundColor: "transparent",
                              color: shade(brand.neutralColor, -0.2),
                              border: "1px solid " + LINE,
                              borderRadius: R,
                            }}
                          >
                            <span aria-hidden="true" className="inline-flex">
                              <I.Trash className="h-4 w-4" />
                            </span>
                          </Btn>
                        </div>
                      </div>

                      {open ? (
                        <div
                          className="mt-4 overflow-hidden"
                          style={{
                            borderTop: "1px solid " + LINE,
                            animation: "panelIn 220ms ease-out",
                          }}
                        >
                          <dl className="grid grid-cols-1 gap-4 pt-4 sm:grid-cols-3">
                            <div>
                              <dt
                                className="text-[11px] font-semibold uppercase tracking-[0.12em]"
                                style={{ color: BODY }}
                              >
                                What this status means
                              </dt>
                              <dd className="mt-1 text-sm leading-relaxed" style={{ color: INK }}>
                                {STATUS_COPY[d.status].note}
                              </dd>
                            </div>
                            <div>
                              <dt
                                className="text-[11px] font-semibold uppercase tracking-[0.12em]"
                                style={{ color: BODY }}
                              >
                                Searchable passages
                              </dt>
                              <dd
                                className="mt-1 text-sm"
                                style={{ color: INK, fontVariantNumeric: "tabular-nums" }}
                              >
                                {d.status === "ready"
                                  ? d.chunks + " passages, each tagged with its page"
                                  : "None yet"}
                              </dd>
                            </div>
                            <div>
                              <dt
                                className="text-[11px] font-semibold uppercase tracking-[0.12em]"
                                style={{ color: BODY }}
                              >
                                Reference
                              </dt>
                              <dd
                                className="mt-1 break-all text-sm"
                                style={{ color: INK, fontVariantNumeric: "tabular-nums" }}
                              >
                                {d.id}
                              </dd>
                            </div>
                          </dl>
                          {d.status === "failed" ? (
                            <p className="pb-1 pt-4 text-sm" style={{ color: BODY }}>
                              Nothing from this file is searchable, and no answer can cite it.
                              Choosing <strong style={{ color: INK }}>Try again</strong> clears
                              the half-finished text and starts over from the file you uploaded.
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ---------------- privacy footnote ---------------- */}
        <footer
          className="mt-10 flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between"
          style={{ borderTop: "1px solid " + LINE }}
        >
          <p className="max-w-xl text-sm leading-relaxed" style={{ color: BODY }}>
            Only you can open these files. Signed-out visitors are sent to the log-in page, and
            answers never reach into another account’s documents.
          </p>
          <Btn
            type="button"
            onClick={() => navigate("getting-started")}
            className="fv inline-flex min-h-[40px] items-center gap-2 self-start px-3 py-2 text-sm font-semibold sm:self-auto"
            style={{
              backgroundColor: "transparent",
              color: PRIMARY_INK,
              border: "1px solid " + rgba(brand.primaryColor, 0.35),
              borderRadius: R,
            }}
          >
            Limits and supported files
          </Btn>
        </footer>
      </div>

      {/* ---------------- delete confirmation ---------------- */}
      {pendingDelete ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
          style={{ backgroundColor: rgba(shade(brand.neutralColor, -0.6), 0.55) }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeDialog();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
            aria-describedby="delete-body"
            className="w-full max-w-md p-6"
            style={{
              backgroundColor: SURFACE,
              borderRadius: "calc(" + R + " * 1.5)",
              border: "1px solid " + LINE,
              boxShadow: "0 18px 48px " + rgba(shade(brand.neutralColor, -0.5), 0.3),
              animation: "rowIn 180ms ease-out",
            }}
          >
            <h2
              id="delete-title"
              className="text-lg font-semibold tracking-tight"
              style={{ color: INK, fontFamily: brand.fontHeading }}
            >
              Delete “{pendingDelete.filename}”?
            </h2>
            <p
              id="delete-body"
              className="mt-3 text-sm leading-relaxed"
              style={{ color: BODY }}
            >
              This removes the file, the text we extracted from it and all of its embeddings.
              Past answers keep their wording, but nothing new can be quoted from it. This cannot
              be undone.
            </p>
            {pendingDelete.status === "queued" || pendingDelete.status === "processing" ? (
              <p
                className="mt-3 px-3 py-2 text-sm"
                style={{
                  backgroundColor: rgba(brand.primaryColor, 0.08),
                  color: PRIMARY_INK,
                  borderRadius: R,
                }}
              >
                It is still {STATUS_COPY[pendingDelete.status].label.toLowerCase()} — we will stop
                that job too.
              </p>
            ) : null}
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Btn
                ref={cancelRef}
                type="button"
                onClick={closeDialog}
                className="fv min-h-[44px] px-4 py-2.5 text-sm font-semibold"
                style={{
                  backgroundColor: "transparent",
                  color: shade(brand.neutralColor, -0.3),
                  border: "1px solid " + LINE,
                  borderRadius: R,
                }}
              >
                Keep this document
              </Btn>
              <Btn
                type="button"
                onClick={confirmDelete}
                className="fv min-h-[44px] px-4 py-2.5 text-sm font-semibold"
                style={{
                  backgroundColor: FAIL_BG,
                  color: shade(brand.backgroundColor, 0.9),
                  border: "1px solid " + FAIL_BG,
                  borderRadius: R,
                }}
              >
                Delete permanently
              </Btn>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
