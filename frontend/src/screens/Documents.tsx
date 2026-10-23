import * as React from "react";
import { Link } from "react-router-dom";

import { ApiError } from "@/lib/api";
import {
  type Document,
  type DocumentStatus,
  deleteDocument,
  listDocuments,
  retryDocument,
  subscribeToDocumentEvents,
  uploadDocuments,
} from "@/lib/documents";
import { Icons } from "@/lib/icons";
import { toPath } from "@/lib/navigate";
import { Badge, Button, Empty } from "@/lib/ui";

const { Upload, FileText, AlertCircle, X } = Icons;

type ScreenState = "loading" | "error" | "ready";

const STATUS_LABEL: Record<DocumentStatus, string> = {
  queued: "Queued",
  processing: "Processing",
  ready: "Ready",
  failed: "Failed",
};

const STATUS_VARIANT: Record<DocumentStatus, string> = {
  queued: "default",
  processing: "warning",
  ready: "success",
  failed: "danger",
};

/**
 * AC-066/AC-067: shown in place of `failure_reason` whenever the field is
 * missing or not a usable string -- an unrecognized failure payload must
 * fall back to fixed, non-technical copy rather than render nothing (which
 * would hide that the document needs a retry) or risk a raw value slipping
 * through untyped.
 */
const DOCUMENT_FAILURE_FALLBACK = "This document failed to process. Please try again.";

// Below the `lg` (1024px) breakpoint, floors a control's box to a 44x44 tap
// target (`min-h-11 lg:min-h-0`, `min-w-11 lg:min-w-0`), the same
// floor-and-release pattern used in `lib/ui.tsx`: at `lg` and above the
// floor lifts and the icon-sized box returns, so desktop is unchanged.
const ICON_BUTTON_TAP_TARGET =
  "inline-flex min-h-11 min-w-11 items-center justify-center lg:min-h-0 lg:min-w-0";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function StatusBadge({ status }: { status: DocumentStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>;
}

function failureReasonText(reason: string | null | undefined): string {
  return typeof reason === "string" && reason.trim() ? reason : DOCUMENT_FAILURE_FALLBACK;
}

function actionErrorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

export default function Documents() {
  const [screenState, setScreenState] = React.useState<ScreenState>("loading");
  const [documents, setDocuments] = React.useState<Document[]>([]);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [isDragging, setIsDragging] = React.useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    let cancelled = false;
    listDocuments()
      .then((docs) => {
        if (cancelled) return;
        setDocuments(Array.isArray(docs) ? docs : []);
        setScreenState("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setScreenState("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    const unsubscribe = subscribeToDocumentEvents((event) => {
      setDocuments((prev) =>
        prev.map((doc) =>
          doc.id === event.id
            ? {
                ...doc,
                status: event.status,
                filename: event.filename,
                failure_reason:
                  event.failure_reason !== undefined ? event.failure_reason : doc.failure_reason,
              }
            : doc,
        ),
      );
    });
    return unsubscribe;
  }, []);

  const handleFiles = React.useCallback(async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;
    setUploading(true);
    setUploadError(null);
    try {
      const uploaded = await uploadDocuments(files);
      setDocuments((prev) => [...uploaded, ...prev]);
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }, []);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      void handleFiles(files);
    }
    event.target.value = "";
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const files = event.dataTransfer.files;
    if (files && files.length > 0) {
      void handleFiles(files);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const handleConfirmDelete = React.useCallback(async () => {
    const id = confirmDeleteId;
    if (!id) return;
    setConfirmDeleteId(null);
    try {
      await deleteDocument(id);
      setDocuments((prev) => prev.filter((doc) => doc.id !== id));
    } catch (err) {
      setActionError(actionErrorMessage(err, "Failed to delete document. Please try again."));
    }
  }, [confirmDeleteId]);

  const handleRetry = React.useCallback(async (id: string) => {
    try {
      const updated = await retryDocument(id);
      setDocuments((prev) =>
        prev.map((doc) =>
          doc.id === id
            ? { ...doc, status: updated.status, failure_reason: updated.failure_reason ?? null }
            : doc,
        ),
      );
    } catch (err) {
      setActionError(actionErrorMessage(err, "Failed to retry document. Please try again."));
    }
  }, []);

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-8">
      <header className="mb-6">
        <h1
          className="text-2xl font-semibold text-[var(--brand-fg)]"
          style={{ fontFamily: "var(--brand-font-heading)" }}
        >
          {"Document library"}
        </h1>
        <p className="mt-1 text-sm text-[var(--brand-fg-muted)]">
          {"Upload documents and watch them move from queued to ready."}
        </p>
      </header>

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className="mb-6 flex flex-col items-center gap-3 rounded-[var(--brand-radius)] border-2 border-dashed px-4 py-8 text-center transition-colors sm:px-6"
        style={{
          borderColor: isDragging ? "var(--brand-primary)" : "var(--brand-border)",
          backgroundColor: isDragging ? "var(--brand-hover)" : "var(--brand-surface)",
        }}
      >
        <Upload size={24} />
        <p className="text-sm text-[var(--brand-fg-muted)]">
          {"Drag and drop files here, or"}{" "}
          {/* The visible, styled trigger is this <label>; the <input> it is
              paired with is kept in the accessibility tree (reachable via
              its own `aria-label`) but made invisible with `opacity-0`
              rather than clipped to 1x1px (the usual `sr-only` treatment)
              -- clipping it would leave the control itself, which is what
              a `getByLabel`-style query resolves to, smaller than the
              44x44px minimum tap target every interactive control needs on
              narrow viewports. The wrapping span carries that same floor
              (`min-h-11`, released at `lg`) so the invisible input sized to
              `inset-0` always matches it. */}
          <span className="relative inline-flex min-h-11 items-center lg:min-h-0">
            <label
              htmlFor="document-upload-input"
              className="cursor-pointer font-medium text-[var(--brand-primary)] underline"
            >
              {"choose documents to upload"}
            </label>
            <input
              ref={fileInputRef}
              id="document-upload-input"
              type="file"
              multiple
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              aria-label="Choose documents to upload"
              onChange={handleInputChange}
            />
          </span>
        </p>
        <Button
          type="button"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? "Uploading…" : "Upload documents"}
        </Button>
      </div>

      {uploadError ? (
        <div
          role="alert"
          className="mb-6 flex items-start gap-2 rounded-[var(--brand-radius)] border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <p className="min-w-0 flex-1 break-words">{uploadError}</p>
          <button
            type="button"
            aria-label="Dismiss error"
            onClick={() => setUploadError(null)}
            className={`shrink-0 text-red-700 hover:text-red-900 ${ICON_BUTTON_TAP_TARGET}`}
          >
            <X size={16} />
          </button>
        </div>
      ) : null}

      {actionError ? (
        <div
          role="alert"
          className="mb-6 flex items-start gap-2 rounded-[var(--brand-radius)] border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <p className="min-w-0 flex-1 break-words">{actionError}</p>
          <button
            type="button"
            aria-label="Dismiss action error"
            onClick={() => setActionError(null)}
            className={`shrink-0 text-red-700 hover:text-red-900 ${ICON_BUTTON_TAP_TARGET}`}
          >
            <X size={16} />
          </button>
        </div>
      ) : null}

      {screenState === "loading" ? (
        <p className="text-sm text-[var(--brand-fg-muted)]">{"Loading your documents…"}</p>
      ) : null}

      {screenState === "error" ? (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-[var(--brand-radius)] border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          <AlertCircle size={16} />
          <p>{"Couldn't load your documents. Please try refreshing the page."}</p>
        </div>
      ) : null}

      {screenState === "ready" && documents.length === 0 ? (
        <Empty
          title="No documents yet"
          description="Upload your first document above, or visit Getting started for a walkthrough."
          action={
            <Link
              to={toPath("getting-started")}
              className="text-sm font-medium text-[var(--brand-primary)] underline"
            >
              {"Go to Getting started"}
            </Link>
          }
        />
      ) : null}

      {screenState === "ready" && documents.length > 0 ? (
        <ul className="divide-y divide-slate-100 rounded-[var(--brand-radius)] border border-slate-200 bg-white">
          {documents.map((doc) => (
            <li
              key={doc.id}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-start gap-3">
                <FileText size={18} className="mt-0.5 shrink-0 text-[var(--brand-fg-muted)]" />
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-medium text-[var(--brand-fg)]">
                    {doc.filename}
                  </h3>
                  <p className="text-xs text-[var(--brand-fg-muted)]">
                    {formatDate(doc.created_at)} · {formatSize(doc.size_bytes)}
                  </p>
                  {doc.status === "failed" ? (
                    <p className="mt-1 text-xs text-red-700">
                      {failureReasonText(doc.failure_reason)}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <StatusBadge status={doc.status} />
                {doc.status === "failed" ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => void handleRetry(doc.id)}
                  >
                    {"Retry"}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  aria-label={`Delete ${doc.filename}`}
                  onClick={() => setConfirmDeleteId(doc.id)}
                >
                  {"Delete"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {confirmDeleteId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-document-dialog-title"
            className="w-full max-w-sm rounded-[var(--brand-radius)] border border-slate-200 bg-white p-6 shadow-lg"
          >
            <h2
              id="delete-document-dialog-title"
              className="text-base font-semibold text-slate-900"
            >
              {"Delete this document?"}
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              {"This action is irreversible. The document and its contents cannot be recovered."}
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setConfirmDeleteId(null)}
              >
                {"Cancel"}
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={() => void handleConfirmDelete()}
              >
                {"Delete"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
