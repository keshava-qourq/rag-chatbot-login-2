import * as React from "react";
import { Link } from "react-router-dom";

import { ApiError } from "@/lib/api";
import {
  type Document,
  type DocumentStatus,
  listDocuments,
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

export default function Documents() {
  const [screenState, setScreenState] = React.useState<ScreenState>("loading");
  const [documents, setDocuments] = React.useState<Document[]>([]);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [isDragging, setIsDragging] = React.useState(false);
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
          doc.id === event.id ? { ...doc, status: event.status, filename: event.filename } : doc,
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

  return (
    <div className="mx-auto max-w-3xl p-8">
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
        className="mb-6 flex flex-col items-center gap-3 rounded-[var(--brand-radius)] border-2 border-dashed px-6 py-8 text-center transition-colors"
        style={{
          borderColor: isDragging ? "var(--brand-primary)" : "var(--brand-border)",
          backgroundColor: isDragging ? "var(--brand-hover)" : "var(--brand-surface)",
        }}
      >
        <Upload size={24} />
        <p className="text-sm text-[var(--brand-fg-muted)]">
          {"Drag and drop files here, or"}{" "}
          <label
            htmlFor="document-upload-input"
            className="cursor-pointer font-medium text-[var(--brand-primary)] underline"
          >
            {"choose documents to upload"}
          </label>
        </p>
        <input
          ref={fileInputRef}
          id="document-upload-input"
          type="file"
          multiple
          className="sr-only"
          aria-label="Choose documents to upload"
          onChange={handleInputChange}
        />
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
          <p className="flex-1">{uploadError}</p>
          <button
            type="button"
            aria-label="Dismiss error"
            onClick={() => setUploadError(null)}
            className="shrink-0 text-red-700 hover:text-red-900"
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
            <li key={doc.id} className="flex items-center justify-between gap-4 p-4">
              <div className="flex min-w-0 items-start gap-3">
                <FileText size={18} className="mt-0.5 shrink-0 text-[var(--brand-fg-muted)]" />
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-medium text-[var(--brand-fg)]">
                    {doc.filename}
                  </h3>
                  <p className="text-xs text-[var(--brand-fg-muted)]">
                    {formatDate(doc.created_at)} · {formatSize(doc.size_bytes)}
                  </p>
                </div>
              </div>
              <StatusBadge status={doc.status} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
