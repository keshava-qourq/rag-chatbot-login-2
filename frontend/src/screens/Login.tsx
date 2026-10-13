// @ts-nocheck -- generated from the approved design under its JS runtime contract; not hand-written TypeScript.
/* eslint-disable @typescript-eslint/no-unused-vars */
import React from "react";

import * as UI from "@/lib/ui";
import { Icons } from "@/lib/icons";
import { brand } from "@/lib/brand";
import { useNavigate } from "@/lib/navigate";

const { Button, Input, Label, Checkbox, Separator } = UI;
const { Check, X, ChevronDown, FileText, Clock, ArrowRight, AlertCircle, CheckCircle } = Icons;

const RECENT_SESSION = {
  email: "rowan.hale@meridianlaw.co.uk",
  lastSignIn: "11 Oct 2026, 08:46",
};

const REDIRECT_TARGET = { label: "Document library", route: "documents" };

const MAX_ATTEMPTS = 5;

const CHECK_TIMES = ["14:02", "14:09", "14:16", "14:23", "14:31"];

const ASSURANCES = [
  {
    title: "Private to this account",
    body:
      "Your files, the text pulled out of them and every saved chat are scoped to your account alone. Nobody else can open them, and neither can an unauthenticated link.",
  },
  {
    title: "Answers only from your documents",
    body:
      "The assistant reads your uploaded material and nothing else. When an answer isn’t in there, it says so rather than guessing from general knowledge.",
  },
  {
    title: "A session you can end",
    body:
      "Signing in sets a secure, HTTP-only cookie. Choosing log out invalidates it on the server straight away, on every device using it.",
  },
];

const SUPPORT_EMAIL = "support@ragdesk.app";

const hexToRgba = (hex, alpha) => {
  const clean = String(hex || "").replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return `rgba(0,0,0,${alpha})`;
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export default function Screen() {
  const navigate = useNavigate();
  const [email, setEmail] = React.useState(RECENT_SESSION.email);
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [remember, setRemember] = React.useState(true);
  const [capsLock, setCapsLock] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState({});
  const [banner, setBanner] = React.useState(null);
  const [status, setStatus] = React.useState("idle");
  const [attempts, setAttempts] = React.useState(0);
  const [locked, setLocked] = React.useState(false);
  const [helpOpen, setHelpOpen] = React.useState(false);
  const [noticeOpen, setNoticeOpen] = React.useState(true);
  const [service, setService] = React.useState("operational");
  const [checkCount, setCheckCount] = React.useState(0);

  const timers = React.useRef([]);
  const busy = React.useRef(false);
  const emailRef = React.useRef(null);
  const passwordRef = React.useRef(null);

  React.useEffect(() => {
    return () => {
      timers.current.forEach((t) => clearTimeout(t));
      timers.current = [];
    };
  }, []);

  const later = (fn, ms) => {
    const id = setTimeout(fn, ms);
    timers.current.push(id);
    return id;
  };

  const line = hexToRgba(brand.neutralColor, 0.18);
  const lineStrong = hexToRgba(brand.neutralColor, 0.3);
  const muted = hexToRgba(brand.neutralColor, 0.95);
  const heading = { fontFamily: brand.fontHeading };
  const num = { fontVariantNumeric: "tabular-nums" };
  const panel = {
    borderColor: line,
    borderRadius: brand.radius,
  };

  const busyNow = status === "submitting";
  const done = status === "success";
  const disabled = busyNow || done || locked;

  const submit = (event) => {
    if (event && typeof event.preventDefault === "function") event.preventDefault();
    if (busy.current || disabled) return;

    const trimmed = email.trim();
    const errors = {};
    if (!trimmed) {
      errors.email = "Enter the email address you signed up with.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      errors.email = "That isn’t a complete email address — check the @ and the part after it.";
    }
    if (!password) errors.password = "Enter your password to continue.";

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setBanner(null);
      later(() => {
        if (errors.email && emailRef.current) emailRef.current.focus();
        else if (errors.password && passwordRef.current) passwordRef.current.focus();
      }, 0);
      return;
    }

    busy.current = true;
    setBanner(null);
    setStatus("submitting");

    later(() => {
      busy.current = false;

      if (service === "degraded") {
        setStatus("idle");
        setBanner({ kind: "service" });
        return;
      }

      if (password.length < 8) {
        const next = attempts + 1;
        setAttempts(next);
        setStatus("idle");
        if (next >= MAX_ATTEMPTS) {
          setLocked(true);
          setHelpOpen(true);
          setBanner({ kind: "locked" });
        } else {
          setBanner({ kind: "credentials", count: next });
        }
        return;
      }

      setAttempts(0);
      setStatus("success");
      later(() => navigate(REDIRECT_TARGET.route), 1150);
    }, 950);
  };

  const recheckService = () => {
    if (service === "checking") return;
    setService("checking");
    later(() => {
      setService(checkCount % 2 === 0 ? "degraded" : "operational");
      setCheckCount((c) => c + 1);
    }, 800);
  };

  const retryAfterOutage = () => {
    setService("operational");
    setBanner(null);
    later(() => submit(), 60);
  };

  const emailDescribedBy = [
    "email-hint",
    fieldErrors.email ? "email-error" : null,
  ]
    .filter(Boolean)
    .join(" ");

  const passwordDescribedBy = [
    capsLock ? "caps-note" : null,
    fieldErrors.password ? "password-error" : null,
  ]
    .filter(Boolean)
    .join(" ");

  const serviceLabel =
    service === "checking"
      ? "Checking"
      : service === "degraded"
      ? "Slower than usual"
      : "Operational";

  const serviceTint =
    service === "degraded"
      ? hexToRgba(brand.neutralColor, 0.1)
      : hexToRgba(brand.accentColor, 0.12);

  const serviceInk = service === "degraded" ? brand.neutralColor : "#0A6B4A";

  return (
    <div
      className="w-full min-h-full"
      style={{ backgroundColor: brand.backgroundColor, fontFamily: brand.fontBody, color: brand.neutralColor }}
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
            Your documents and saved chats open only for this account. Sign in to pick up where you left off.
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
                    You were heading to the {REDIRECT_TARGET.label}. Log in and we’ll take you straight there — nothing
                    was lost.
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
                <h2 id="signin-heading" className="text-lg font-semibold" style={{ ...heading, color: "#121926" }}>
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
                          {remember ? "for 30 days on this browser." : "until you close this browser."}
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
                            That email or password is incorrect
                          </p>
                          <p className="mt-1 text-sm leading-relaxed" style={{ color: muted }}>
                            We don’t say which of the two it was — that’s deliberate, so nobody can use this page to
                            find out whether an account exists. Check for Caps Lock or a stray space, then try again.
                          </p>
                          <p className="mt-2 text-sm font-medium" style={{ ...num, color: "#1A2433" }}>
                            Attempt {banner.count} of {MAX_ATTEMPTS} before this account locks.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {banner && banner.kind === "locked" ? (
                    <div
                      role="alert"
                      className="lg-rise mt-5 border px-4 py-3.5"
                      style={{
                        ...panel,
                        borderColor: lineStrong,
                        backgroundColor: hexToRgba(brand.neutralColor, 0.08),
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
                            Locked after {MAX_ATTEMPTS} failed attempts
                          </p>
                          <p className="mt-1 text-sm leading-relaxed" style={{ color: muted }}>
                            Sign-in for {email.trim()} is paused to protect the documents behind it. Only an operator
                            can lift it: email{" "}
                            <span className="font-medium" style={{ color: "#1A2433" }}>
                              {SUPPORT_EMAIL}
                            </span>{" "}
                            from this address and we’ll verify you and unlock it. Your password box is untouched below.
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
                            This isn’t your details — the session service didn’t answer in time. What you typed is
                            still here, so nothing needs retyping.
                          </p>
                          <button
                            type="button"
                            onClick={retryAfterOutage}
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
                            if (emailRef.current) emailRef.current.focus();
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
                        aria-describedby={emailDescribedBy || undefined}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (fieldErrors.email) setFieldErrors((f) => ({ ...f, email: undefined }));
                        }}
                        placeholder="you@company.com"
                        className="w-full"
                      />
                    </div>
                    <p id="email-hint" className="mt-2 text-xs" style={{ ...num, color: hexToRgba(brand.neutralColor, 0.85) }}>
                      Last signed in from this browser on {RECENT_SESSION.lastSignIn}.
                    </p>
                    {fieldErrors.email ? (
                      <p
                        id="email-error"
                        role="alert"
                        className="lg-rise mt-2 flex items-start gap-1.5 text-sm font-medium"
                        style={{ color: "#1A2433" }}
                      >
                        <Icons.AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
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
                          if (e && typeof e.getModifierState === "function") {
                            setCapsLock(e.getModifierState("CapsLock"));
                          }
                        }}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          if (fieldErrors.password) setFieldErrors((f) => ({ ...f, password: undefined }));
                        }}
                        placeholder="At least 8 characters"
                        className="w-full"
                      />
                    </div>
                    {capsLock ? (
                      <p id="caps-note" className="lg-rise mt-2 text-xs font-medium" style={{ color: "#1A2433" }}>
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
                        <Icons.AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
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
                        onChange={(e) => {
                          const next =
                            typeof e === "boolean"
                              ? e
                              : e && e.target
                              ? e.target.checked
                              : !remember;
                          setRemember(next);
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
                      onClick={submit}
                      disabled={disabled}
                      className="lg-soft w-full justify-center py-3 text-base font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                      style={{
                        backgroundColor: locked ? hexToRgba(brand.neutralColor, 0.35) : brand.primaryColor,
                        color: "white",
                        borderRadius: brand.radius,
                        opacity: busyNow ? 0.85 : 1,
                        outlineColor: brand.primaryColor,
                        cursor: disabled ? "not-allowed" : "pointer",
                      }}
                    >
                      {locked
                        ? "Sign-in locked"
                        : done
                        ? "Signed in"
                        : busyNow
                        ? "Checking your details…"
                        : "Log in"}
                    </Button>
                    <p className="mt-3 text-center text-xs" style={{ color: hexToRgba(brand.neutralColor, 0.85) }}>
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
                        Self-serve reset isn’t built yet — we’d rather tell you than show a link that quietly does
                        nothing. Email{" "}
                        <span className="font-semibold" style={{ color: "#1A2433" }}>
                          {SUPPORT_EMAIL}
                        </span>{" "}
                        from the address on the account and a person will verify you and set a new password.
                      </p>
                      <p className="mt-2 text-sm" style={{ ...num, color: hexToRgba(brand.neutralColor, 0.9) }}>
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

          {/* ---------- Secondary: reassurance and service status ---------- */}
          <aside className="space-y-5">
            <section className="border bg-white p-5 sm:p-6" style={panel} aria-labelledby="assurance-heading">
              <h2 id="assurance-heading" className="text-sm font-semibold" style={{ ...heading, color: "#121926" }}>
                What’s behind the login
              </h2>
              <ul className="mt-4 space-y-4">
                {ASSURANCES.map((item) => (
                  <li key={item.title} className="flex gap-3">
                    <span
                      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                      style={{ backgroundColor: hexToRgba(brand.accentColor, 0.14) }}
                    >
                      <Icons.Check className="h-3 w-3" aria-hidden="true" style={{ color: "#0A6B4A" }} />
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

            <section className="border bg-white p-5 sm:p-6" style={panel} aria-labelledby="service-heading">
              <div className="flex items-start justify-between gap-3">
                <h2 id="service-heading" className="text-sm font-semibold" style={{ ...heading, color: "#121926" }}>
                  Sign-in service
                </h2>
                <span
                  className="lg-pop inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold"
                  style={{
                    backgroundColor: serviceTint,
                    color: serviceInk,
                    borderRadius: brand.radius,
                  }}
                >
                  {service === "degraded" ? (
                    <Icons.AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : service === "checking" ? (
                    <Icons.Clock className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Icons.CheckCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {serviceLabel}
                </span>
              </div>

              <p className="mt-3 text-sm leading-relaxed" style={{ color: muted }}>
                {service === "degraded"
                  ? "Sessions are taking a few seconds longer to issue than usual. Password checks themselves are unaffected — a sign-in may need a second go."
                  : service === "checking"
                  ? "Asking the session service how it’s doing…"
                  : "Logins, uploads and chat are all running normally."}
              </p>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs" style={{ ...num, color: hexToRgba(brand.neutralColor, 0.85) }}>
                  Checked {CHECK_TIMES[Math.min(checkCount, CHECK_TIMES.length - 1)]} today
                </p>
                <button
                  type="button"
                  onClick={recheckService}
                  disabled={service === "checking"}
                  className="lg-soft rounded border px-3 py-1.5 text-xs font-semibold hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{
                    borderColor: lineStrong,
                    borderRadius: brand.radius,
                    color: brand.primaryColor,
                    outlineColor: brand.primaryColor,
                    opacity: service === "checking" ? 0.6 : 1,
                  }}
                >
                  {service === "checking" ? "Checking…" : "Check again"}
                </button>
              </div>
            </section>
          </aside>
        </div>

        <p className="mt-10 max-w-2xl text-xs leading-relaxed" style={{ color: hexToRgba(brand.neutralColor, 0.8) }}>
          Answers are generated by Google Gemini on a paid API tier, so your documents and questions are not used to
          train models. Content you delete is removed along with its text, embeddings and stored file.
        </p>
      </div>
    </div>
  );
}
