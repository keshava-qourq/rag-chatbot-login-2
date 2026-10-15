import * as React from "react";
import { Link } from "react-router-dom";

import { ApiError } from "@/lib/api";
import { Icons } from "@/lib/icons";
import { toPath } from "@/lib/navigate";
import {
  type GeminiSettings,
  getGeminiSettings,
  removeGeminiKey,
  saveGeminiKey,
} from "@/lib/settings";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@/lib/ui";

const { AlertCircle, CheckCircle } = Icons;

type ScreenState = "loading" | "signed-out" | "error" | "ready";

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function actionErrorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

function KeyStatus({ settings }: { settings: GeminiSettings }) {
  if (!settings.configured) {
    return (
      <div className="flex flex-col gap-2">
        <Badge variant="danger" className="self-start">
          {"Not set"}
        </Badge>
        <p className="text-sm text-[var(--brand-fg-muted)]">
          {
            "No key is set yet. Uploads can't be processed and chat can't answer until one is added."
          }
        </p>
      </div>
    );
  }
  if (settings.source === "app") {
    const savedBy = settings.updated_by ? ` by ${settings.updated_by}` : "";
    const saved = settings.updated_at ? ` Saved ${formatDate(settings.updated_at)}${savedBy}.` : "";
    return (
      <div className="flex flex-col gap-2">
        <Badge variant="success" className="self-start">
          {"Saved in app"}
        </Badge>
        <p className="text-sm text-[var(--brand-fg-muted)]">
          {`Key ending in ${settings.key_hint}.${saved}`}
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <Badge className="self-start">{"From server environment"}</Badge>
      <p className="text-sm text-[var(--brand-fg-muted)]">
        {`Using the server's GEMINI_API_KEY (ending in ${settings.key_hint}). Save a key here to replace it.`}
      </p>
    </div>
  );
}

export default function Settings() {
  const [screenState, setScreenState] = React.useState<ScreenState>("loading");
  const [settings, setSettings] = React.useState<GeminiSettings | null>(null);
  const [apiKey, setApiKey] = React.useState("");
  const [showKey, setShowKey] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [removing, setRemoving] = React.useState(false);
  const [confirmingRemove, setConfirmingRemove] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    getGeminiSettings()
      .then((loaded) => {
        if (cancelled) return;
        setSettings(loaded);
        setScreenState("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setScreenState(err instanceof ApiError && err.status === 401 ? "signed-out" : "error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = apiKey.trim();
    if (!trimmed) return;
    setSaving(true);
    setNotice(null);
    setActionError(null);
    setConfirmingRemove(false);
    try {
      setSettings(await saveGeminiKey(trimmed));
      setApiKey("");
      setShowKey(false);
      setNotice("Key saved. Gemini accepted it.");
    } catch (err) {
      setActionError(actionErrorMessage(err, "Couldn't save the key. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setRemoving(true);
    setNotice(null);
    setActionError(null);
    try {
      setSettings(await removeGeminiKey());
      setNotice("Saved key removed.");
    } catch (err) {
      setActionError(actionErrorMessage(err, "Couldn't remove the key. Please try again."));
    } finally {
      setRemoving(false);
      setConfirmingRemove(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-8">
      <header className="mb-6">
        <h1
          className="text-2xl font-semibold text-[var(--brand-fg)]"
          style={{ fontFamily: "var(--brand-font-heading)" }}
        >
          {"Settings"}
        </h1>
        <p className="mt-1 text-sm text-[var(--brand-fg-muted)]">
          {"Settings here apply to everyone using this app."}
        </p>
      </header>

      {screenState === "loading" ? (
        <p className="text-sm text-[var(--brand-fg-muted)]">{"Loading settings…"}</p>
      ) : null}

      {screenState === "signed-out" ? (
        <div className="rounded-[var(--brand-radius)] border border-slate-200 bg-white p-4 text-sm">
          <p className="text-[var(--brand-fg)]">{"Log in to manage settings."}</p>
          <Link
            to={toPath("login")}
            className="mt-2 inline-block font-medium text-[var(--brand-primary)] underline"
          >
            {"Go to Log in"}
          </Link>
        </div>
      ) : null}

      {screenState === "error" ? (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-[var(--brand-radius)] border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          <AlertCircle size={16} />
          <p>{"Couldn't load settings. Please try refreshing the page."}</p>
        </div>
      ) : null}

      {screenState === "ready" && settings ? (
        <Card>
          <CardHeader>
            <CardTitle>{"Gemini API key"}</CardTitle>
            <CardDescription>
              {"One key, shared by every account, for document processing and chat."}
            </CardDescription>
          </CardHeader>

          <CardContent className="flex flex-col gap-5">
            <KeyStatus settings={settings} />

            {notice ? (
              <div
                role="status"
                className="flex items-start gap-2 rounded-[var(--brand-radius)] border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
              >
                <CheckCircle size={16} className="mt-0.5 shrink-0" />
                <p className="min-w-0 flex-1 break-words">{notice}</p>
              </div>
            ) : null}

            {actionError ? (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-[var(--brand-radius)] border border-red-200 bg-red-50 p-3 text-sm text-red-700"
              >
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <p className="min-w-0 flex-1 break-words">{actionError}</p>
              </div>
            ) : null}

            <form onSubmit={(event) => void handleSave(event)} className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="gemini-api-key">
                  {settings.configured ? "Replace with a new key" : "API key"}
                </Label>
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  aria-pressed={showKey}
                  className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--brand-primary)] underline underline-offset-2 lg:min-h-0"
                >
                  {showKey ? "Hide key" : "Show key"}
                </button>
              </div>
              <Input
                id="gemini-api-key"
                type={showKey ? "text" : "password"}
                autoComplete="off"
                spellCheck={false}
                placeholder="Paste a Gemini API key"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                disabled={saving}
              />
              <p className="text-xs text-[var(--brand-fg-muted)]">
                {
                  "Use a key from a Google Cloud project with billing enabled: on Google's free tier, submitted content may be used to improve Google's products. The key is checked with Gemini before it's saved, and only its last four characters are shown afterwards."
                }
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button type="submit" size="sm" disabled={saving || !apiKey.trim()}>
                  {saving ? "Checking key…" : "Save key"}
                </Button>
                {settings.source === "app" && !confirmingRemove ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setConfirmingRemove(true)}
                    disabled={saving || removing}
                  >
                    {"Remove saved key"}
                  </Button>
                ) : null}
              </div>
            </form>

            {confirmingRemove ? (
              <div className="rounded-[var(--brand-radius)] border border-red-200 bg-red-50 p-4 text-sm">
                <p className="text-red-800">
                  {
                    "Remove the saved key? Uploads and chat may stop working for everyone until a key is added again."
                  }
                </p>
                <div className="mt-3 flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setConfirmingRemove(false)}
                    disabled={removing}
                  >
                    {"Cancel"}
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() => void handleRemove()}
                    disabled={removing}
                  >
                    {removing ? "Removing…" : "Remove key"}
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>

          <CardFooter className="flex-wrap text-xs text-[var(--brand-fg-muted)]">
            <span>{`Chat model: ${settings.chat_model}`}</span>
            <span aria-hidden="true">{"·"}</span>
            <span>{`Embedding model: ${settings.embedding_model}`}</span>
          </CardFooter>
        </Card>
      ) : null}
    </div>
  );
}
