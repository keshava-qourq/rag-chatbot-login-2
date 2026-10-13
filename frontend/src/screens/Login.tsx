import * as React from "react";

import * as UI from "@/lib/ui";
import { Icons } from "@/lib/icons";
import { brand } from "@/lib/brand";
import { useNavigate } from "@/lib/navigate";
import { login, parseAuthError, useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";

const { Button, Label, Checkbox, Separator } = UI;

// `Input` in the shared kit is a plain function component, not a
// `forwardRef`-wrapped one, so its exported type does not list `ref` in its
// props. React 19 forwards the ref at runtime regardless; this cast only
// tells the type checker what already works, so focus management can be
// typed rather than `any`.
const Input = UI.Input as unknown as React.ForwardRefExoticComponent<
  React.InputHTMLAttributes<HTMLInputElement> & React.RefAttributes<HTMLInputElement>
>;

const REDIRECT_TARGET = { label: "Document library", route: "documents" };

const ASSURANCES = [
  {
    title: "Private to this account",
    body: "Your files, the text pulled out of them and every saved chat are scoped to your account alone. Nobody else can open them, and neither can an unauthenticated link.",
  },
  {
    title: "Answers only from your documents",
    body: "The assistant reads your uploaded material and nothing else. When an answer isn’t in there, it says so rather than guessing from general knowledge.",
  },
  {
    title: "A session you can end",
    body: "Signing in sets a secure, HTTP-only cookie. Choosing log out invalidates it on the server straight away, on every device using it.",
  },
];

const SUPPORT_EMAIL = "support@ragdesk.app";

const hexToRgba = (hex: string, alpha: number) => {
  const clean = String(hex || "").replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return `rgba(0,0,0,${alpha})`;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

type FieldErrors = { email?: string; password?: string };
type Banner = { kind: "credentials" | "service"; message: string } | null;

export default function Screen() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [remember, setRemember] = React.useState(true);
  const [capsLock, setCapsLock] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const [banner, setBanner] = React.useState<Banner>(null);
  const [status, setStatus] = React.useState<"idle" | "submitting" | "success">("idle");
  const [helpOpen, setHelpOpen] = React.useState(false);
  const [noticeOpen, setNoticeOpen] = React.useState(true);

  const busy = React.useRef(false);
  const emailRef = React.useRef<HTMLInputElement>(null);
  const passwordRef = React.useRef<HTMLInputElement>(null);

  const line = hexToRgba(brand.neutralColor, 0.18);
  const lineStrong = hexToRgba(brand.neutralColor, 0.3);
  const muted = hexToRgba(brand.neutralColor, 0.95);
  const heading = { fontFamily: brand.fontHeading };
  const panel = {
    borderColor: line,
    borderRadius: brand.radius,
  };

  const busyNow = status === "submitting";
  const done = status === "success";
  const disabled = busyNow || done;

  const submit = async (event?: React.FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (busy.current || disabled) return;

    const trimmed = email.trim();
    const errors: FieldErrors = {};
    if (!trimmed) {
      errors.email = "Enter the email address you signed up with.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      errors.email = "That isn’t a complete email address — check the @ and the part after it.";
    }
    if (!password) errors.password = "Enter your password to continue.";

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setBanner(null);
      if (errors.email) emailRef.current?.focus();
      else if (errors.password) passwordRef.current?.focus();
      return;
    }

    busy.current = true;
    setBanner(null);
    setStatus("submitting");

    try {
      const user = await login(trimmed, password);
      busy.current = false;
      setUser(user);
      setStatus("success");
      // No simulated delay: navigate as soon as the session is established.
      navigate(REDIRECT_TARGET.route);
    } catch (err) {
      busy.current = false;
      setStatus("idle");
      if (err instanceof ApiError && err.status === 401) {
        const { message } = parseAuthError(err);
        setBanner({ kind: "credentials", message });
      } else {
        setBanner({
          kind: "service",
          message:
            "This isn’t your details — the session service didn’t answer in time. What you typed is still here, so nothing needs retyping.",
        });
      }
    }
  };

  const emailDescribedBy = fieldErrors.email ? "email-error" : undefined;
  const passwordDescribedBy = [
    capsLock ? "caps-note" : null,
    fieldErrors.password ? "password-error" : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className="w-full min-h-full"
      style={{
        backgroundColor: brand.backgroundColor,
        fontFamily: brand.fontBody,
        color: brand.neutralColor,
      }}
    >
      <style>{`
        @keyframes lgRise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        @keyframes lgSweep { 0% { transform: translateX(-100%); } 100% { transform: translateX(320%); } }
        @keyframes lgPop { from { opacity: 0; transform: scale(.94); } to { opacity: 1; transform: none; } }
        .lg-rise { animation: lgRise .3s ease-out both; }
        .lg-pop { animation: lgPop .25s ease-out both; }
        .lg-sweep { animation: lgSweep 1.1s linear infinite; }
        .lg-chev { transition: transform .2s ease; }
        .lg-soft { transition: background-color .18s ease, border-color .18s ease, color .18s ease, opacity .18s ease; }
        @media (prefers-reduced-motion: reduce) {
          .lg-rise, .lg-pop, .lg-sweep, .lg-chev, .lg-soft { animation: none !important; transition: none !important; }
        }
      `}</style>

      <div className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
        <header className="max-w-2xl">
          <p
            className="text-xs font-semibold uppercase tracking-[0.14em]"
            style={{ color: hexToRgba(brand.neutralColor, 0.75) }}
          >
            Account access
          </p>
          <h1
            className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight"
            style={{ ...heading, color: "#121926" }}
          >
            Log in
          </h1>
          <p className="mt-3 text-base leading-relaxed" style={{ color: muted }}>
            Your documents and saved chats open only for this account. Sign in to pick up where you
            left off.
          </p>
        </header>

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-8 items-start">
          {/* ---------- Primary: the sign-in form ---------- */}
          <main>
            {noticeOpen && !done ? (
              <div
                className="lg-rise mb-5 flex items-start gap-3 border px-4 py-3.5 sm:px-5"
                style={{
                  ...panel,
                  borderColor: hexToRgba(brand.primaryColor, 0.28),
                  backgroundColor: hexToRgba(brand.primaryColor, 0.07),
                }}
              >
                <Icons.Clock
                  className="mt-0.5 h-4 w-4 shrink-0"
                  aria-hidden="true"
                  style={{ color: brand.primaryColor }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold" style={{ color: "#1A2433" }}>
                    Your session expired, so we stopped at the door
                  </p>
                  <p className="mt-1 text-sm leading-relaxed" style={{ color: muted }}>
                    You were heading to the {REDIRECT_TARGET.label}. Log in and we’ll take you
                    straight there — nothing was lost.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setNoticeOpen(false)}
                  aria-label="Dismiss session expiry notice"
                  className="lg-soft -mr-1 -mt-1 rounded p-1.5 hover:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{ color: brand.neutralColor, outlineColor: brand.primaryColor }}
                >
                  <Icons.X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ) : null}

            <section
              className="relative overflow-hidden border bg-white shadow-sm"
              style={panel}
              aria-labelledby="signin-heading"
            >
              {busyNow ? (
                <div
                  className="absolute inset-x-0 top-0 h-[3px] overflow-hidden"
                  style={{ backgroundColor: hexToRgba(brand.primaryColor, 0.14) }}
                  aria-hidden="true"
                >
                  <div
                    className="lg-sweep h-full w-1/3"
                    style={{ backgroundColor: brand.primaryColor }}
                  />
                </div>
              ) : null}

              <div className="p-6 sm:p-8">
                <h2
                  id="signin-heading"
                  className="text-lg font-semibold"
                  style={{ ...heading, color: "#121926" }}
                >
                  Email and password
                </h2>
                <p className="mt-1.5 text-sm" style={{ color: muted }}>
                  Step 1 of 1. There is no code to enter and no app to install.
                </p>

                <div aria-live="polite">
                  {done ? (
                    <div
                      className="lg-rise mt-5 flex items-start gap-3 border px-4 py-3.5"
                      style={{
                        ...panel,
                        borderColor: hexToRgba(brand.accentColor, 0.35),
                        backgroundColor: hexToRgba(brand.accentColor, 0.1),
                      }}
                    >
                      <Icons.CheckCircle
                        className="mt-0.5 h-4 w-4 shrink-0"
                        aria-hidden="true"
                        style={{ color: "#0A6B4A" }}
                      />
                      <div>
                        <p className="text-sm font-semibold" style={{ color: "#0A5238" }}>
                          Signed in — opening your {REDIRECT_TARGET.label.toLowerCase()}
                        </p>
                        <p className="mt-1 text-sm" style={{ color: muted }}>
                          Welcome back, {email.trim()}. Your session cookie is set{" "}
                          {remember
                            ? "for 30 days on this browser."
                            : "until you close this browser."}
                        </p>
                      </div>
                    </div>
                  ) : null}

                  {banner && banner.kind === "credentials" ? (
                    <div
                      role="alert"
                      className="lg-rise mt-5 border px-4 py-3.5"
                      style={{
                        ...panel,
                        borderColor: lineStrong,
                        backgroundColor: hexToRgba(brand.neutralColor, 0.06),
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <Icons.AlertCircle
                          className="mt-0.5 h-4 w-4 shrink-0"
                          aria-hidden="true"
                          style={{ color: "#1A2433" }}
                        />
                        <div>
                          <p className="text-sm font-semibold" style={{ color: "#1A2433" }}>
                            {banner.message}
                          </p>
                          <p className="mt-1 text-sm leading-relaxed" style={{ color: muted }}>
                            We don’t say which of the two it was — that’s deliberate, so nobody can
                            use this page to find out whether an account exists. Check for Caps Lock
                            or a stray space, then try again.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {banner && banner.kind === "service" ? (
                    <div
                      role="alert"
                      className="lg-rise mt-5 border px-4 py-3.5"
                      style={{
                        ...panel,
                        borderColor: lineStrong,
                        backgroundColor: hexToRgba(brand.neutralColor, 0.06),
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <Icons.AlertCircle
                          className="mt-0.5 h-4 w-4 shrink-0"
                          aria-hidden="true"
                          style={{ color: "#1A2433" }}
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold" style={{ color: "#1A2433" }}>
                            We couldn’t reach the sign-in service
                          </p>
                          <p className="mt-1 text-sm leading-relaxed" style={{ color: muted }}>
                            {banner.message}
                          </p>
                          <button
                            type="button"
                            onClick={() => submit()}
                            className="lg-soft mt-3 inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-sm font-medium hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                            style={{
                              borderColor: lineStrong,
                              borderRadius: brand.radius,
                              color: brand.primaryColor,
                              outlineColor: brand.primaryColor,
                              backgroundColor: "transparent",
                            }}
                          >
                            Try signing in again
                            <Icons.ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>

                <form onSubmit={submit} noValidate className="mt-6 space-y-6">
                  <div>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <Label htmlFor="login-email">Email address</Label>
                      {email ? (
                        <button
                          type="button"
                          onClick={() => {
                            setEmail("");
                            setFieldErrors({});
                            setBanner(null);
                            emailRef.current?.focus();
                          }}
                          className="lg-soft rounded text-sm font-medium underline underline-offset-2 hover:opacity-75 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                          style={{ color: brand.primaryColor, outlineColor: brand.primaryColor }}
                        >
                          Not you? Use another email
                        </button>
                      ) : null}
                    </div>
                    <div className="mt-2">
                      <Input
                        id="login-email"
                        ref={emailRef}
                        type="email"
                        name="email"
                        autoComplete="email"
                        inputMode="email"
                        value={email}
                        disabled={disabled}
                        aria-invalid={fieldErrors.email ? "true" : undefined}
                        aria-describedby={emailDescribedBy}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (fieldErrors.email)
                            setFieldErrors((f) => ({ ...f, email: undefined }));
                        }}
                        placeholder="you@company.com"
                        className="w-full"
                      />
                    </div>
                    {fieldErrors.email ? (
                      <p
                        id="email-error"
                        role="alert"
                        className="lg-rise mt-2 flex items-start gap-1.5 text-sm font-medium"
                        style={{ color: "#1A2433" }}
                      >
                        <Icons.AlertCircle
                          className="mt-0.5 h-3.5 w-3.5 shrink-0"
                          aria-hidden="true"
                        />
                        <span>{fieldErrors.email}</span>
                      </p>
                    ) : null}
                  </div>

                  <div>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <Label htmlFor="login-password">Password</Label>
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-pressed={showPassword}
                        className="lg-soft rounded text-sm font-medium underline underline-offset-2 hover:opacity-75 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                        style={{ color: brand.primaryColor, outlineColor: brand.primaryColor }}
                      >
                        {showPassword ? "Hide password" : "Show password"}
                      </button>
                    </div>
                    <div className="mt-2">
                      <Input
                        id="login-password"
                        ref={passwordRef}
                        type={showPassword ? "text" : "password"}
                        name="password"
                        autoComplete="current-password"
                        value={password}
                        disabled={disabled}
                        aria-invalid={fieldErrors.password ? "true" : undefined}
                        aria-describedby={passwordDescribedBy || undefined}
                        onKeyUp={(e) => {
                          if (typeof e.getModifierState === "function") {
                            setCapsLock(e.getModifierState("CapsLock"));
                          }
                        }}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          if (fieldErrors.password)
                            setFieldErrors((f) => ({ ...f, password: undefined }));
                        }}
                        placeholder="At least 8 characters"
                        className="w-full"
                      />
                    </div>
                    {capsLock ? (
                      <p
                        id="caps-note"
                        className="lg-rise mt-2 text-xs font-medium"
                        style={{ color: "#1A2433" }}
                      >
                        Caps Lock is on.
                      </p>
                    ) : null}
                    {fieldErrors.password ? (
                      <p
                        id="password-error"
                        role="alert"
                        className="lg-rise mt-2 flex items-start gap-1.5 text-sm font-medium"
                        style={{ color: "#1A2433" }}
                      >
                        <Icons.AlertCircle
                          className="mt-0.5 h-3.5 w-3.5 shrink-0"
                          aria-hidden="true"
                        />
                        <span>{fieldErrors.password}</span>
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-2.5">
                      <Checkbox
                        id="login-remember"
                        checked={remember}
                        disabled={disabled}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                          setRemember(e.target.checked);
                        }}
                      />
                      <Label htmlFor="login-remember" className="text-sm font-normal">
                        Keep me signed in on this browser for 30 days
                      </Label>
                    </div>
                  </div>

                  <div className="pt-1">
                    <Button
                      type="submit"
                      disabled={disabled}
                      className="lg-soft w-full justify-center py-3 text-base font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                      style={{
                        backgroundColor: brand.primaryColor,
                        color: "white",
                        borderRadius: brand.radius,
                        opacity: busyNow ? 0.85 : 1,
                        outlineColor: brand.primaryColor,
                        cursor: disabled ? "not-allowed" : "pointer",
                      }}
                    >
                      {done ? "Signed in" : busyNow ? "Checking your details…" : "Log in"}
                    </Button>
                    <p
                      className="mt-3 text-center text-xs"
                      style={{ color: hexToRgba(brand.neutralColor, 0.85) }}
                    >
                      Passwords are stored only as a salted hash — we never see yours.
                    </p>
                  </div>
                </form>

                <div className="mt-7">
                  <Separator />
                </div>

                <div className="mt-5">
                  <button
                    type="button"
                    onClick={() => setHelpOpen((v) => !v)}
                    aria-expanded={helpOpen}
                    aria-controls="forgot-panel"
                    className="lg-soft flex w-full items-center justify-between gap-3 rounded px-1 py-2 text-left hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                    style={{ outlineColor: brand.primaryColor }}
                  >
                    <span className="text-sm font-semibold" style={{ color: "#1A2433" }}>
                      Forgotten your password?
                    </span>
                    <Icons.ChevronDown
                      className="lg-chev h-4 w-4 shrink-0"
                      aria-hidden="true"
                      style={{
                        color: brand.primaryColor,
                        transform: helpOpen ? "rotate(180deg)" : "none",
                      }}
                    />
                  </button>
                  {helpOpen ? (
                    <div
                      id="forgot-panel"
                      className="lg-rise mt-2 border px-4 py-3.5"
                      style={{
                        ...panel,
                        backgroundColor: hexToRgba(brand.neutralColor, 0.05),
                      }}
                    >
                      <p className="text-sm leading-relaxed" style={{ color: muted }}>
                        Self-serve reset isn’t built yet — we’d rather tell you than show a link
                        that quietly does nothing. Email{" "}
                        <span className="font-semibold" style={{ color: "#1A2433" }}>
                          {SUPPORT_EMAIL}
                        </span>{" "}
                        from the address on the account and a person will verify you and set a new
                        password.
                      </p>
                      <p
                        className="mt-2 text-sm"
                        style={{ color: hexToRgba(brand.neutralColor, 0.9) }}
                      >
                        Answered Mon–Fri, 09:00–17:30 UK, usually within one working day.
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>

              <div
                className="border-t px-6 py-5 sm:px-8"
                style={{ borderColor: line, backgroundColor: hexToRgba(brand.neutralColor, 0.035) }}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm" style={{ color: muted }}>
                    No account yet?
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate("sign-up")}
                    className="lg-soft inline-flex items-center gap-1.5 border bg-white px-4 py-2 text-sm font-semibold hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                    style={{
                      borderColor: hexToRgba(brand.primaryColor, 0.4),
                      borderRadius: brand.radius,
                      color: brand.primaryColor,
                      outlineColor: brand.primaryColor,
                    }}
                  >
                    Create an account
                    <Icons.ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </section>
          </main>

          {/* ---------- Secondary: reassurance ---------- */}
          <aside className="space-y-5">
            <section
              className="border bg-white p-5 sm:p-6"
              style={panel}
              aria-labelledby="assurance-heading"
            >
              <h2
                id="assurance-heading"
                className="text-sm font-semibold"
                style={{ ...heading, color: "#121926" }}
              >
                What’s behind the login
              </h2>
              <ul className="mt-4 space-y-4">
                {ASSURANCES.map((item) => (
                  <li key={item.title} className="flex gap-3">
                    <span
                      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                      style={{ backgroundColor: hexToRgba(brand.accentColor, 0.14) }}
                    >
                      <Icons.Check
                        className="h-3 w-3"
                        aria-hidden="true"
                        style={{ color: "#0A6B4A" }}
                      />
                    </span>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: "#1A2433" }}>
                        {item.title}
                      </p>
                      <p className="mt-1 text-sm leading-relaxed" style={{ color: muted }}>
                        {item.body}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-5">
                <button
                  type="button"
                  onClick={() => navigate("getting-started")}
                  className="lg-soft inline-flex items-center gap-1.5 rounded text-sm font-semibold underline underline-offset-4 hover:opacity-75 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{ color: brand.primaryColor, outlineColor: brand.primaryColor }}
                >
                  <Icons.FileText className="h-4 w-4" aria-hidden="true" />
                  Read the getting-started guide
                </button>
              </div>
            </section>
          </aside>
        </div>

        <p
          className="mt-10 max-w-2xl text-xs leading-relaxed"
          style={{ color: hexToRgba(brand.neutralColor, 0.8) }}
        >
          Answers are generated by Google Gemini on a paid API tier, so your documents and questions
          are not used to train models. Content you delete is removed along with its text,
          embeddings and stored file.
        </p>
      </div>
    </div>
  );
}
