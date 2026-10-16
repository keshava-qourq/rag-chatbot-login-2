import * as React from "react";
import { Link } from "react-router-dom";

import { Card, CardContent, CardHeader, CardTitle } from "@/lib/ui";
import { toPath } from "@/lib/navigate";

type StatusMeaning = {
  status: string;
  meaning: string;
};

const STATUS_MEANINGS: StatusMeaning[] = [
  {
    status: "Queued",
    meaning: "The document has been uploaded and is waiting for processing to start.",
  },
  {
    status: "Processing",
    meaning: "The document is being extracted, split into chunks, and embedded for search.",
  },
  {
    status: "Ready",
    meaning: "The document has finished processing and can now be used to answer questions.",
  },
  {
    status: "Failed",
    meaning:
      "Something went wrong while processing the document. You can retry it from the document library.",
  },
];

export default function GettingStarted() {
  return (
    <div className="mx-auto max-w-3xl p-8">
      <header className="mb-6">
        <h1
          className="text-2xl font-semibold text-[var(--brand-fg)]"
          style={{ fontFamily: "var(--brand-font-heading)" }}
        >
          {"Getting started"}
        </h1>
        <p className="mt-1 text-sm text-[var(--brand-fg-muted)]">
          {"A short walkthrough of uploading documents and asking your first question."}
        </p>
      </header>

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{"1. Upload a document"}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-[var(--brand-fg-muted)]">
              {"Go to the "}
              <Link
                to={toPath("documents")}
                className="font-medium text-[var(--brand-primary)] underline"
              >
                {"Document library"}
              </Link>
              {" and upload a file. Supported file types are PDF, Word (.docx), Markdown " +
                "(.md), and plain text (.txt)."}
            </p>
            <ul className="list-disc pl-5 text-sm text-[var(--brand-fg-muted)]">
              <li>{"Maximum size per file: 25 MB."}</li>
              <li>{"Maximum length per file: 500 pages."}</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{"2. Understand processing status"}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-[var(--brand-fg-muted)]">
              {"After upload, a document moves through these statuses:"}
            </p>
            <dl className="flex flex-col gap-2">
              {STATUS_MEANINGS.map((item) => (
                <div key={item.status}>
                  <dt className="text-sm font-semibold text-[var(--brand-fg)]">{item.status}</dt>
                  <dd className="text-sm text-[var(--brand-fg-muted)]">{item.meaning}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{"3. Ask your first question"}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-[var(--brand-fg-muted)]">
              {"Once a document is "}
              <strong>{"Ready"}</strong>
              {", go to "}
              <Link
                to={toPath("chat")}
                className="font-medium text-[var(--brand-primary)] underline"
              >
                {"Chat"}
              </Link>
              {" and ask a question in plain language. The assistant answers using only your " +
                "own uploaded documents -- it will say so plainly when the answer isn't in " +
                "your documents, rather than guessing or using outside knowledge."}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{"4. Read and check citations"}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-[var(--brand-fg-muted)]">
              {"Every answer includes numbered citations, like [[1]], pointing back to the " +
                "exact document, page, and quoted passage it was drawn from. Open a citation " +
                "to check the quoted passage yourself and confirm the answer is supported " +
                "by your documents."}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
