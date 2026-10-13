// @ts-nocheck -- generated from the approved design under its JS runtime contract; not hand-written TypeScript.
/* eslint-disable @typescript-eslint/no-unused-vars */
import React from "react";

import * as UI from "@/lib/ui";
import { Icons } from "@/lib/icons";
import { brand } from "@/lib/brand";
import { useNavigate } from "@/lib/navigate";

const { Button, Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, Input, Label, Checkbox, Separator } = UI;
const { Check, X, ChevronRight, FileText, Upload, ArrowRight, AlertCircle, CheckCircle } = Icons;

// --- Sample/reference data for the prototype -------------------------------
// Emails that already have an account (drives the AC-002 "already registered" path)
const EXISTING_ACCOUNTS = [
  "dana.whitfield@northgate.co.uk",
  "m.okafor@lamberthealth.org",
  "priya.raman@kestrel.io",
];

// Semantic status token set (the brand palette carries no danger role)
const TOKENS = {
  danger: "#B42318",
  dangerSurface: "#FEF4F2",
};

const UPLOAD_LIMITS = [
  { label: "File types", value: "PDF, Word, Markdown, TXT" },
  { label: "Largest file", value: "25 MB" },
  { label: "Pages per file", value: "300" },
];

const NEXT_STEPS = [
  {
    title: "Create your account",
    body: "Email and password. Your library starts empty and private to you.",
  },
  {
    title: "Upload your documents",
    body: "They move through queued, processing, then ready. You can keep working while they process.",
  },
  {
    title: "Ask, and check the citation",
    body: "Every answer points back to the document and page it came from.",
  },
];

const SIMULATIONS = [
  { id: "ok", label: "Account created" },
  { id: "taken", label: "Email already registered" },
  { id: "down", label: "Sign-up service down" },
];

const PASSWORD_RULES = [
  { id: "len", label: "At least 10 characters", test: (v) => v.length >= 10 },
  { id: "num", label: "Contains a number", test: (v) => /\d/.test(v) },
  { id: "letter", label: "Contains a letter", test: (v) => /[a-zA-Z]/.test(v) },
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function Screen() {
  const navigate = useNavigate();
  const [form, setForm] = React.useState({
    email: "",
    password: "",
    confirm: "",
    agree: false,
  });
  const [errors, setErrors] = React.useState({});
  const [status, setStatus] = React.useState("idle"); // idle | submitting | error | done
  const [serviceError, setServiceError] = React.useState(null);
  const [showPassword, setShowPassword] = React.useState(false);
  const [simulation, setSimulation] = React.useState("ok");

  const emailRef = React.useRef(null);
  const passwordRef = React.useRef(null);
  const confirmRef = React.useRef(null);
  const agreeRef = React.useRef(null);
  const timerRef = React.useRef(null);

  React.useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const metRules = PASSWORD_RULES.filter((r) => r.test(form.password));
  const metCount = metRules.length;

  const update = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const validate = () => {
    const next = {};
    const email = form.email.trim().toLowerCase();
    if (!email) next.email = "Enter the email address you want to sign in with.";
    else if (!EMAIL_PATTERN.test(email))
      next.email = "That does not look like an email address. Check for a missing @ or domain.";
    else if (EXISTING_ACCOUNTS.includes(email))
      next.email = "An account already exists for this email address. Log in instead, or use another address.";

    if (!form.password) next.password = "Choose a password for your account.";
    else if (PASSWORD_RULES.some((r) => !r.test(form.password)))
      next.password = "Your password does not meet all three rules below yet.";

    if (!form.confirm) next.confirm = "Type your password a second time so we know it is right.";
    else if (form.confirm !== form.password)
      next.confirm = "The two passwords do not match.";

    if (!form.agree)
      next.agree = "Confirm you understand how answers are grounded before continuing.";

    return next;
  };

  const focusFirstError = (errs) => {
    const order = [
      ["email", emailRef],
      ["password", passwordRef],
      ["confirm", confirmRef],
      ["agree", agreeRef],
    ];
    const hit = order.find(([key]) => errs[key]);
    if (hit && hit[1].current && hit[1].current.focus) hit[1].current.focus();
  };

  const runSubmit = () => {
    setServiceError(null);
    setStatus("submitting");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (simulation === "taken") {
        setStatus("idle");
        setErrors({
          email:
            "An account already exists for this email address. Log in instead, or use another address.",
        });
        if (emailRef.current && emailRef.current.focus) emailRef.current.focus();
      } else if (simulation === "down") {
        setStatus("error");
        setServiceError(
          "We could not reach the sign-up service just now. Nothing was created and your details are still here — try again in a moment."
        );
      } else {
        setStatus("done");
      }
    }, 1100);
  };

  const handleSubmit = (event) => {
    if (event && event.preventDefault) event.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      setServiceError(null);
      focusFirstError(errs);
      return;
    }
    setErrors({});
    runSubmit();
  };

  const checkboxHandler = (value) => {
    const resolved =
      typeof value === "boolean"
        ? value
        : value && value.target
        ? !!value.target.checked
        : !form.agree;
    update("agree", resolved);
  };

  const errorList = Object.keys(errors);
  const submitting = status === "submitting";
  const fieldStyle = { borderRadius: brand.radius };
  const mutedText = { color: brand.neutralColor };

  const inputClass =
    "w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";

  return (
    <div
      className="min-h-full w-full"
      style={{
        backgroundColor: brand.backgroundColor,
        fontFamily: brand.fontBody,
        ["--tw-ring-color"]: brand.primaryColor,
      }}
    >
      <style>{`
        @keyframes pg-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pg-pulse { 0%, 100% { opacity: 0.35; } 50% { opacity: 1; } }
        .pg-rise { animation: pg-rise 240ms ease-out both; }
        .pg-dot { animation: pg-pulse 1s ease-in-out infinite; }
        .pg-dot:nth-child(2) { animation-delay: 160ms; }
        .pg-dot:nth-child(3) { animation-delay: 320ms; }
        @media (prefers-reduced-motion: reduce) {
          .pg-rise, .pg-dot { animation: none !important; }
        }
      `}</style>

      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 py-8 sm:py-12">
        {/* Screen heading */}
        <header className="max-w-2xl">
          <span
            className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide"
            style={{ color: brand.primaryColor }}
          >
            <span style={{ fontVariantNumeric: "tabular-nums" }}>Step 1 of 3</span>
            <span aria-hidden="true" style={mutedText}>
              ·
            </span>
            <span style={mutedText}>Create account</span>
          </span>
          <h1
            className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight"
            style={{ fontFamily: brand.fontHeading, color: "#111827" }}
          >
            Create your account
          </h1>
          <p className="mt-3 text-base leading-relaxed" style={mutedText}>
            Your documents, their extracted text and every conversation stay inside your own
            account. Answers are built only from what you upload — and when something is not in
            your documents, the assistant says so.
          </p>
        </header>

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_19rem] gap-6 lg:gap-8 items-start">
          {/* ---------------- Focal column: the form (or its success state) -------- */}
          <div>
            {status === "done" ? (
              <Card
                className="pg-rise bg-white border shadow-sm"
                style={{ borderRadius: brand.radius, borderColor: "#E3E8F0" }}
              >
                <CardHeader>
                  <div className="flex items-start gap-3">
                    <span
                      className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center"
                      style={{
                        backgroundColor: brand.accentColor,
                        borderRadius: brand.radius,
                        color: "#FFFFFF",
                      }}
                    >
                      <Icons.CheckCircle className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div>
                      <CardTitle style={{ fontFamily: brand.fontHeading }}>
                        Account created — you are signed in
                      </CardTitle>
                      <CardDescription>
                        We created an account for{" "}
                        <span className="font-medium" style={{ color: "#111827" }}>
                          {form.email.trim().toLowerCase()}
                        </span>
                        . Your password is stored only as a salted hash.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div
                    className="p-4 sm:p-5"
                    style={{ backgroundColor: brand.backgroundColor, borderRadius: brand.radius }}
                  >
                    <h2
                      className="text-sm font-semibold"
                      style={{ fontFamily: brand.fontHeading, color: "#111827" }}
                    >
                      Your document library is empty
                    </h2>
                    <p className="mt-1.5 text-sm leading-relaxed" style={mutedText}>
                      That is expected on day one. Upload a PDF, Word file, Markdown or plain text
                      file and it will move through queued → processing → ready. Once a document is
                      ready, you can ask questions about it.
                    </p>
                  </div>
                </CardContent>
                <CardFooter className="flex flex-col sm:flex-row gap-3">
                  <Button
                    onClick={() => navigate("documents")}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 text-white font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                    style={{ backgroundColor: brand.primaryColor, borderRadius: brand.radius }}
                  >
                    <Icons.Upload className="h-4 w-4" aria-hidden="true" />
                    Open my document library
                  </Button>
                  <Button
                    onClick={() => navigate("getting-started")}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white border font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                    style={{
                      borderColor: "#D7DEE9",
                      color: brand.primaryColor,
                      borderRadius: brand.radius,
                    }}
                  >
                    Read getting started
                    <Icons.ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </CardFooter>
              </Card>
            ) : (
              <Card
                className="bg-white border shadow-sm"
                style={{ borderRadius: brand.radius, borderColor: "#E3E8F0" }}
              >
                <CardHeader>
                  <CardTitle style={{ fontFamily: brand.fontHeading }}>
                    Your details
                  </CardTitle>
                  <CardDescription>
                    Email and password only. No card details, and nothing is shared with other
                    accounts.
                  </CardDescription>
                </CardHeader>

                <CardContent>
                  {/* Service error — keeps the user's input */}
                  {status === "error" && serviceError ? (
                    <div
                      className="pg-rise mb-6 flex items-start gap-3 p-4"
                      role="alert"
                      style={{
                        backgroundColor: TOKENS.dangerSurface,
                        borderRadius: brand.radius,
                        borderLeft: `3px solid ${TOKENS.danger}`,
                      }}
                    >
                      <Icons.AlertCircle
                        className="h-5 w-5 mt-0.5 shrink-0"
                        aria-hidden="true"
                        style={{ color: TOKENS.danger }}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold" style={{ color: TOKENS.danger }}>
                          Sign-up service unavailable
                        </p>
                        <p className="mt-1 text-sm leading-relaxed" style={{ color: "#111827" }}>
                          {serviceError}
                        </p>
                        <Button
                          onClick={runSubmit}
                          className="mt-3 inline-flex items-center gap-2 bg-white border text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                          style={{
                            borderColor: "#E4C8C3",
                            color: TOKENS.danger,
                            borderRadius: brand.radius,
                          }}
                        >
                          Try creating my account again
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {/* Validation summary */}
                  {errorList.length > 0 ? (
                    <div
                      className="pg-rise mb-6 p-4"
                      role="alert"
                      style={{
                        backgroundColor: TOKENS.dangerSurface,
                        borderRadius: brand.radius,
                        borderLeft: `3px solid ${TOKENS.danger}`,
                      }}
                    >
                      <p className="text-sm font-semibold" style={{ color: TOKENS.danger }}>
                        {errorList.length === 1
                          ? "One thing needs fixing"
                          : `${errorList.length} things need fixing`}
                      </p>
                      <ul className="mt-2 space-y-1 text-sm" style={{ color: "#111827" }}>
                        {errorList.map((key) => (
                          <li key={key} className="leading-relaxed">
                            {errors[key]}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <form onSubmit={handleSubmit} noValidate className="space-y-6">
                    {/* Email */}
                    <div>
                      <Label htmlFor="signup-email" className="text-sm font-medium">
                        Email address
                      </Label>
                      <Input
                        id="signup-email"
                        ref={emailRef}
                        type="email"
                        name="email"
                        autoComplete="email"
                        inputMode="email"
                        value={form.email}
                        onChange={(e) => update("email", e.target.value)}
                        aria-invalid={errors.email ? "true" : "false"}
                        aria-describedby={errors.email ? "signup-email-error" : "signup-email-help"}
                        className={`mt-2 ${inputClass}`}
                        style={{
                          ...fieldStyle,
                          borderColor: errors.email ? TOKENS.danger : undefined,
                        }}
                      />
                      {errors.email ? (
                        <p
                          id="signup-email-error"
                          className="mt-2 flex items-start gap-1.5 text-sm"
                          style={{ color: TOKENS.danger }}
                        >
                          <Icons.AlertCircle
                            className="h-4 w-4 mt-0.5 shrink-0"
                            aria-hidden="true"
                          />
                          <span>{errors.email}</span>
                        </p>
                      ) : (
                        <p id="signup-email-help" className="mt-2 text-sm" style={mutedText}>
                          You will use this to log in. We only email you about your account.
                        </p>
                      )}
                    </div>

                    <Separator />

                    {/* Password */}
                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <Label htmlFor="signup-password" className="text-sm font-medium">
                          Password
                        </Label>
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          aria-pressed={showPassword}
                          className="text-sm font-medium underline underline-offset-2 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                          style={{ color: brand.primaryColor }}
                        >
                          {showPassword ? "Hide password" : "Show password"}
                        </button>
                      </div>
                      <Input
                        id="signup-password"
                        ref={passwordRef}
                        type={showPassword ? "text" : "password"}
                        name="new-password"
                        autoComplete="new-password"
                        value={form.password}
                        onChange={(e) => update("password", e.target.value)}
                        aria-invalid={errors.password ? "true" : "false"}
                        aria-describedby="signup-password-rules"
                        className={`mt-2 ${inputClass}`}
                        style={{
                          ...fieldStyle,
                          borderColor: errors.password ? TOKENS.danger : undefined,
                        }}
                      />

                      <div
                        id="signup-password-rules"
                        className="mt-3 p-3 sm:p-4"
                        style={{
                          backgroundColor: brand.backgroundColor,
                          borderRadius: brand.radius,
                        }}
                      >
                        <div className="flex items-baseline justify-between gap-3">
                          <h3
                            className="text-xs font-semibold uppercase tracking-wide"
                            style={{ color: brand.neutralColor, fontFamily: brand.fontHeading }}
                          >
                            Password rules
                          </h3>
                          <span
                            className="text-xs font-semibold"
                            style={{
                              color: metCount === 3 ? brand.accentColor : brand.neutralColor,
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {metCount} of 3 met
                          </span>
                        </div>
                        <ul className="mt-2.5 space-y-2">
                          {PASSWORD_RULES.map((rule) => {
                            const ok = rule.test(form.password);
                            return (
                              <li key={rule.id} className="flex items-center gap-2 text-sm">
                                {ok ? (
                                  <Icons.Check
                                    className="h-4 w-4 shrink-0"
                                    aria-hidden="true"
                                    style={{ color: brand.accentColor }}
                                  />
                                ) : (
                                  <Icons.X
                                    className="h-4 w-4 shrink-0"
                                    aria-hidden="true"
                                    style={{ color: brand.neutralColor }}
                                  />
                                )}
                                <span style={{ color: ok ? "#111827" : brand.neutralColor }}>
                                  {rule.label}
                                </span>
                                <span className="sr-only">{ok ? "— met" : "— not met yet"}</span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>

                      {errors.password ? (
                        <p
                          className="mt-2 flex items-start gap-1.5 text-sm"
                          style={{ color: TOKENS.danger }}
                        >
                          <Icons.AlertCircle
                            className="h-4 w-4 mt-0.5 shrink-0"
                            aria-hidden="true"
                          />
                          <span>{errors.password}</span>
                        </p>
                      ) : null}
                    </div>

                    {/* Confirm */}
                    <div>
                      <Label htmlFor="signup-confirm" className="text-sm font-medium">
                        Confirm password
                      </Label>
                      <Input
                        id="signup-confirm"
                        ref={confirmRef}
                        type={showPassword ? "text" : "password"}
                        name="confirm-password"
                        autoComplete="new-password"
                        value={form.confirm}
                        onChange={(e) => update("confirm", e.target.value)}
                        aria-invalid={errors.confirm ? "true" : "false"}
                        aria-describedby={errors.confirm ? "signup-confirm-error" : undefined}
                        className={`mt-2 ${inputClass}`}
                        style={{
                          ...fieldStyle,
                          borderColor: errors.confirm ? TOKENS.danger : undefined,
                        }}
                      />
                      {errors.confirm ? (
                        <p
                          id="signup-confirm-error"
                          className="mt-2 flex items-start gap-1.5 text-sm"
                          style={{ color: TOKENS.danger }}
                        >
                          <Icons.AlertCircle
                            className="h-4 w-4 mt-0.5 shrink-0"
                            aria-hidden="true"
                          />
                          <span>{errors.confirm}</span>
                        </p>
                      ) : null}
                    </div>

                    <Separator />

                    {/* Understanding checkbox */}
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id="signup-agree"
                        ref={agreeRef}
                        checked={form.agree}
                        onChange={checkboxHandler}
                        onCheckedChange={checkboxHandler}
                        aria-invalid={errors.agree ? "true" : "false"}
                        aria-describedby={errors.agree ? "signup-agree-error" : undefined}
                        className="mt-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                      />
                      <div className="min-w-0">
                        <Label htmlFor="signup-agree" className="text-sm font-normal leading-relaxed">
                          I understand that answers come only from documents I upload, and that the
                          assistant will say when something is not in them.
                        </Label>
                        {errors.agree ? (
                          <p
                            id="signup-agree-error"
                            className="mt-2 flex items-start gap-1.5 text-sm"
                            style={{ color: TOKENS.danger }}
                          >
                            <Icons.AlertCircle
                              className="h-4 w-4 mt-0.5 shrink-0"
                              aria-hidden="true"
                            />
                            <span>{errors.agree}</span>
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div>
                      <Button
                        type="submit"
                        disabled={submitting}
                        className="w-full inline-flex items-center justify-center gap-2 text-white text-base font-semibold py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                        style={{
                          backgroundColor: brand.primaryColor,
                          borderRadius: brand.radius,
                          opacity: submitting ? 0.72 : 1,
                          transition: "opacity 160ms ease-out",
                        }}
                      >
                        {submitting ? (
                          <React.Fragment>
                            <span>Creating your account</span>
                            <span aria-hidden="true" className="inline-flex gap-1">
                              <span className="pg-dot inline-block h-1.5 w-1.5 rounded-full bg-white" />
                              <span className="pg-dot inline-block h-1.5 w-1.5 rounded-full bg-white" />
                              <span className="pg-dot inline-block h-1.5 w-1.5 rounded-full bg-white" />
                            </span>
                          </React.Fragment>
                        ) : (
                          <React.Fragment>
                            Create account
                            <Icons.ArrowRight className="h-4 w-4" aria-hidden="true" />
                          </React.Fragment>
                        )}
                      </Button>
                      <p className="sr-only" role="status" aria-live="polite">
                        {submitting ? "Creating your account, please wait." : ""}
                      </p>
                      <p className="mt-3 text-center text-sm" style={mutedText}>
                        Already have an account?{" "}
                        <button
                          type="button"
                          onClick={() => navigate("login")}
                          className="font-medium underline underline-offset-2 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                          style={{ color: brand.primaryColor }}
                        >
                          Log in
                        </button>
                      </p>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}
          </div>

          {/* ---------------- Supporting column -------------------------------- */}
          <aside className="space-y-6">
            <Card
              className="bg-white border shadow-sm"
              style={{ borderRadius: brand.radius, borderColor: "#E3E8F0" }}
            >
              <CardHeader>
                <CardTitle className="text-base" style={{ fontFamily: brand.fontHeading }}>
                  What happens next
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-5">
                  {NEXT_STEPS.map((step, index) => {
                    const isCurrent = index === 0 && status !== "done";
                    const isDone = index === 0 && status === "done";
                    return (
                      <li key={step.title} className="flex gap-3">
                        <span
                          aria-hidden="true"
                          className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                          style={{
                            backgroundColor: isDone
                              ? brand.accentColor
                              : isCurrent
                              ? brand.primaryColor
                              : "#EDF1F7",
                            color: isDone || isCurrent ? "#FFFFFF" : brand.neutralColor,
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {isDone ? "✓" : index + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold" style={{ color: "#111827" }}>
                            {step.title}
                            {isCurrent ? (
                              <span
                                className="ml-2 text-xs font-medium"
                                style={{ color: brand.primaryColor }}
                              >
                                You are here
                              </span>
                            ) : null}
                            {isDone ? (
                              <span
                                className="ml-2 text-xs font-medium"
                                style={{ color: brand.accentColor }}
                              >
                                Done
                              </span>
                            ) : null}
                          </p>
                          <p className="mt-1 text-sm leading-relaxed" style={mutedText}>
                            {step.body}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </CardContent>
            </Card>

            <Card
              className="bg-white border shadow-sm"
              style={{ borderRadius: brand.radius, borderColor: "#E3E8F0" }}
            >
              <CardHeader>
                <CardTitle className="text-base" style={{ fontFamily: brand.fontHeading }}>
                  What you can upload
                </CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-3" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {UPLOAD_LIMITS.map((limit) => (
                    <div key={limit.label} className="flex items-baseline justify-between gap-4">
                      <dt className="text-sm" style={mutedText}>
                        {limit.label}
                      </dt>
                      <dd className="text-sm font-medium text-right" style={{ color: "#111827" }}>
                        {limit.value}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-4 text-sm leading-relaxed" style={mutedText}>
                  Scanned pages, spreadsheets, audio and video are not supported yet.
                </p>
              </CardContent>
              <CardFooter>
                <Button
                  onClick={() => navigate("getting-started")}
                  className="w-full inline-flex items-center justify-center gap-2 bg-white border text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                  style={{
                    borderColor: "#D7DEE9",
                    color: brand.primaryColor,
                    borderRadius: brand.radius,
                  }}
                >
                  <Icons.FileText className="h-4 w-4" aria-hidden="true" />
                  Getting-started guide
                </Button>
              </CardFooter>
            </Card>

            {/* Prototype controls — clearly labelled, quiet styling */}
            <section
              aria-labelledby="sim-heading"
              className="p-4"
              style={{
                borderRadius: brand.radius,
                border: "1px dashed #CBD4E1",
                backgroundColor: "#FFFFFF",
              }}
            >
              <h2
                id="sim-heading"
                className="text-xs font-semibold uppercase tracking-wide"
                style={{ color: brand.neutralColor, fontFamily: brand.fontHeading }}
              >
                Prototype · simulate the response
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed" style={mutedText}>
                Pick what the sign-up service returns, then submit the form.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {SIMULATIONS.map((sim) => {
                  const active = simulation === sim.id;
                  return (
                    <button
                      key={sim.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        setSimulation(sim.id);
                        setServiceError(null);
                        if (status === "error") setStatus("idle");
                      }}
                      className="text-xs font-medium px-2.5 py-1.5 border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                      style={{
                        borderRadius: brand.radius,
                        borderColor: active ? brand.primaryColor : "#D7DEE9",
                        backgroundColor: active ? brand.primaryColor : "#FFFFFF",
                        color: active ? "#FFFFFF" : brand.neutralColor,
                        transition: "background-color 140ms ease-out, color 140ms ease-out",
                      }}
                    >
                      {sim.label}
                    </button>
                  );
                })}
              </div>
              {status === "done" ? (
                <Button
                  onClick={() => {
                    setStatus("idle");
                    setErrors({});
                    setServiceError(null);
                    setForm({ email: "", password: "", confirm: "", agree: false });
                  }}
                  className="mt-3 w-full bg-white border text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                  style={{
                    borderColor: "#D7DEE9",
                    color: brand.neutralColor,
                    borderRadius: brand.radius,
                  }}
                >
                  Reset the form
                </Button>
              ) : null}
            </section>

            <p className="text-xs leading-relaxed px-1" style={mutedText}>
              Passwords are stored as salted hashes. Sessions use secure, HTTP-only cookies. Locked
              out? Email support — self-serve password reset is not available yet.
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}
