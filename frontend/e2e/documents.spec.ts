import { expect, request as apiRequest, test, type APIRequestContext } from "@playwright/test";

// Drives the real POST/GET /documents contract directly against the running
// backend -- status codes, response shapes and the error cases a person
// never reads themselves but a client depends on (US-004, AC-010..013).
//
// Note on the response shape: the approved api_spec documents the upload
// response as `[{document_id, filename, status}]`, but the shipped contract
// (see backend/app/schemas.py `DocumentResponse`) names the id field `id`.
// These tests assert the contract as implemented, not as drafted; see the
// delivery notes for this ticket.
const API_URL = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:8000";
const DEFAULT_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

// There is no login: every request acts as the one shared workspace, so a
// plain context is all a test needs -- and other tests' uploads may be in the
// same list, so assertions look only at this test's own documents.
async function newContext(): Promise<APIRequestContext> {
  return apiRequest.newContext({ baseURL: API_URL });
}

async function listedFilenames(ctx: APIRequestContext): Promise<string[]> {
  const list = await ctx.get("/documents");
  expect(list.status()).toBe(200);
  return ((await list.json()) as Array<{ filename: string }>).map((doc) => doc.filename);
}

test.describe("POST /documents and GET /documents -- upload contract", () => {
  test("AC-010: an accepted upload is stored, queued, and listed first", async () => {
    const owner = await newContext();
    try {
      const firstUpload = await owner.post("/documents", {
        multipart: {
          files: {
            name: "first-notes.txt",
            mimeType: "text/plain",
            buffer: Buffer.from("hello world"),
          },
        },
      });

      expect(firstUpload.status()).toBe(201);
      const firstBody = await firstUpload.json();
      expect(firstBody).toHaveLength(1);
      expect(firstBody[0]).toMatchObject({ filename: "first-notes.txt", status: "queued" });
      expect(typeof firstBody[0].id).toBe("string");

      const secondUpload = await owner.post("/documents", {
        multipart: {
          files: {
            name: "second-notes.txt",
            mimeType: "text/plain",
            buffer: Buffer.from("more content"),
          },
        },
      });
      expect(secondUpload.status()).toBe(201);
      const secondId = (await secondUpload.json())[0].id;

      const list = await owner.get("/documents");
      expect(list.status()).toBe(200);
      const ids = ((await list.json()) as Array<{ id: string }>).map((doc) => doc.id);
      // Newest first: the second upload is listed ahead of the first.
      expect(ids).toContain(firstBody[0].id);
      expect(ids.indexOf(secondId)).toBeLessThan(ids.indexOf(firstBody[0].id));
    } finally {
      await owner.dispose();
    }
  });

  test("POST and GET /documents work without any login or session cookie", async () => {
    const visitor = await newContext();
    try {
      const uploadResponse = await visitor.post("/documents", {
        multipart: {
          files: { name: "no-login.txt", mimeType: "text/plain", buffer: Buffer.from("hi") },
        },
      });
      expect(uploadResponse.status()).toBe(201);

      expect(await listedFilenames(visitor)).toContain("no-login.txt");
    } finally {
      await visitor.dispose();
    }
  });

  test("AC-011: a file over the size ceiling is rejected before processing, naming the limit and the actual size", async () => {
    const owner = await newContext();
    try {
      const oversizedBuffer = Buffer.alloc(DEFAULT_MAX_UPLOAD_BYTES + 1024, "a");
      const response = await owner.post("/documents", {
        multipart: {
          files: { name: "oversized.txt", mimeType: "text/plain", buffer: oversizedBuffer },
        },
      });

      expect(response.status()).toBe(413);
      const body = await response.json();
      expect(body.detail).toContain(String(DEFAULT_MAX_UPLOAD_BYTES));
      expect(body.detail).toContain(String(oversizedBuffer.length));

      // Rejected before processing started: no record was created for it.
      expect(await listedFilenames(owner)).not.toContain("oversized.txt");
    } finally {
      await owner.dispose();
    }
  });

  test("AC-012: a file of an unsupported type is rejected, listing every supported type", async () => {
    const owner = await newContext();
    try {
      const response = await owner.post("/documents", {
        multipart: {
          files: {
            name: "spreadsheet.xlsx",
            mimeType: "application/vnd.ms-excel",
            buffer: Buffer.from("binary"),
          },
        },
      });

      expect(response.status()).toBe(422);
      const body = await response.json();
      expect(body.detail).toContain("PDF");
      expect(body.detail).toContain("Word");
      expect(body.detail).toContain("Markdown");
      expect(body.detail).toContain("plain text");

      expect(await listedFilenames(owner)).not.toContain("spreadsheet.xlsx");
    } finally {
      await owner.dispose();
    }
  });

  test("AC-013: selecting several supported files in one upload returns one independent record per file", async () => {
    const owner = await newContext();
    try {
      const response = await owner.post("/documents", {
        multipart: {
          files: [
            { name: "alpha.txt", mimeType: "text/plain", buffer: Buffer.from("alpha content") },
            { name: "beta.md", mimeType: "text/markdown", buffer: Buffer.from("# beta") },
          ],
        },
      });

      expect(response.status()).toBe(201);
      const body: Array<{ id: string; filename: string; status: string }> = await response.json();
      expect(body).toHaveLength(2);

      const ids = new Set(body.map((doc) => doc.id));
      expect(ids.size).toBe(2);
      expect(body.every((doc) => doc.status === "queued")).toBe(true);
      expect(new Set(body.map((doc) => doc.filename))).toEqual(new Set(["alpha.txt", "beta.md"]));
    } finally {
      await owner.dispose();
    }
  });
});

test.describe("Document library screen (browser)", () => {
  // SKIPPED -- AC-010 through AC-013 as experienced on screen (select or
  // drag a file into the Document library and see it appear, queued, at the
  // top of the real list) cannot be driven through the browser yet:
  // frontend/src/screens/Documents.tsx is a static design mock seeded from
  // a hard-coded local list (`INITIAL_DOCS`) and never calls POST or GET
  // /documents -- selecting a file only ever updates local component state,
  // not the account's real documents. The API-level specs above prove the
  // backend half of this ticket; wiring the screen to the live endpoint is
  // unimplemented and belongs to a follow-up frontend ticket.
  test.skip("AC-010: a file selected on the Documents screen is stored and listed via the real backend -- skipped: Documents.tsx is a static mock with no network call to POST or GET /documents", async () => {});
});
