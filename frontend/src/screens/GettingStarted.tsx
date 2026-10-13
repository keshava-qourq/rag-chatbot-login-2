// @ts-nocheck -- generated from the approved design under its JS runtime contract; not hand-written TypeScript.
/* eslint-disable @typescript-eslint/no-unused-vars */
import React from "react";

import * as UI from "@/lib/ui";
import { Icons } from "@/lib/icons";
import { brand } from "@/lib/brand";
import { useNavigate } from "@/lib/navigate";

const { Select, Table, THead, TBody, TR, TH, TD } = UI;
const { Search, Check, X, ChevronRight, ChevronLeft, FileText, Clock, Trash, Upload, AlertCircle, CheckCircle } = Icons;

const UIX = (typeof UI !== 'undefined' && UI) ? UI : {};
const ICO = (typeof Icons !== 'undefined' && Icons) ? Icons : {};

/* ---- scaffold components, aliased under non-colliding names so the screen always renders ---- */
const GTable = UIX.Table || (({ className = '', style, children }) => <table className={className} style={style}>{children}</table>);
const GTHead = UIX.THead || (({ children }) => <thead>{children}</thead>);
const GTBody = UIX.TBody || (({ children }) => <tbody>{children}</tbody>);
const GTR = UIX.TR || (({ className = '', style, children }) => <tr className={className} style={style}>{children}</tr>);
const GTH = UIX.TH || (({ className = '', style, scope = 'col', children }) => <th scope={scope} className={className} style={style}>{children}</th>);
const GTD = UIX.TD || (({ className = '', style, children }) => <td className={className} style={style}>{children}</td>);

const IcoSearch = ICO.Search || (() => null);
const IcoCheck = ICO.Check || (() => null);
const IcoCheckCircle = ICO.CheckCircle || (() => null);
const IcoAlert = ICO.AlertCircle || (() => null);
const IcoClock = ICO.Clock || (() => null);
const IcoUpload = ICO.Upload || (() => null);
const IcoFile = ICO.FileText || (() => null);
const IcoRight = ICO.ChevronRight || (() => null);
const IcoLeft = ICO.ChevronLeft || (() => null);
const IcoX = ICO.X || (() => null);
const IcoTrash = ICO.Trash || (() => null);

/* ---- colour helpers, derived only from the brand roles ---- */
function rgb(hex) {
  const h = String(hex || '').replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function tint(hex, a) { const [r, g, b] = rgb(hex); return `rgba(${r}, ${g}, ${b}, ${a})`; }
function darken(hex, amount) {
  const [r, g, b] = rgb(hex);
  const f = (v) => Math.round(v * (1 - amount)).toString(16).padStart(2, '0');
  return `#${f(r)}${f(g)}${f(b)}`;
}

const INK = darken(brand.neutralColor, 0.62);
const ACCENT_INK = darken(brand.accentColor, 0.38);
const PRIMARY_INK = darken(brand.primaryColor, 0.1);
const LINE = tint(brand.neutralColor, 0.22);
const SOFT = tint(brand.neutralColor, 0.07);

/* ---- guide content ---- */
const SECTIONS = [
  {
    id: 'account',
    label: 'Create your account',
    minutes: '1 min',
    blurb: 'Email and password sign-up, what we store, and what to do if you are locked out.',
    keywords: 'sign up signup login log in password email account hash locked out reset session cookie logout'
  },
  {
    id: 'upload',
    label: 'Upload a document',
    minutes: '2 min',
    blurb: 'Supported file types, the 25 MB and page ceilings, and uploading several files at once.',
    keywords: 'upload pdf word docx markdown md txt text file size limit 25mb pages ceiling drag drop multiple library'
  },
  {
    id: 'statuses',
    label: 'What the statuses mean',
    minutes: '2 min',
    blurb: 'Queued, Processing, Ready and Failed — what each one means and what you should do.',
    keywords: 'status queued processing ready failed retry delete embeddings chunks reason no readable text'
  },
  {
    id: 'ask',
    label: 'Ask your first question',
    minutes: '3 min',
    blurb: 'How answers are built from your own documents, follow-ups, and chat titles.',
    keywords: 'ask question chat answer grounded not in your documents follow up streaming title rename delete conversation'
  },
  {
    id: 'citations',
    label: 'Read and check citations',
    minutes: '2 min',
    blurb: 'Every claim carries a marker. Open one to see the exact passage it came from.',
    keywords: 'citation citations passage page source document marker check verify quote'
  },
  {
    id: 'limits',
    label: 'Limits and what this will not do',
    minutes: '2 min',
    blurb: 'The honest list: no scanned PDFs, no spreadsheets, no sharing — and how your content is handled.',
    keywords: 'limits privacy gemini paid tier training ocr scan spreadsheet csv url audio video sharing export sso mfa'
  }
];

const FILE_TYPES = [
  { type: 'PDF', ext: '.pdf', note: 'Text-based PDFs. Pages are kept so citations can point at one.' },
  { type: 'Word', ext: '.docx', note: 'Modern Word files. Older .doc files are not read.' },
  { type: 'Markdown', ext: '.md', note: 'Headings become the section a citation points at.' },
  { type: 'Plain text', ext: '.txt', note: 'UTF-8 text. Sections are counted in blocks of text.' }
];

const SAMPLE_LIBRARY = [
  { filename: 'Q3-Board-Pack-2026.pdf', created_at: '12 Oct 2026, 09:14', size: '8.4 MB', pages: '112', status: 'ready' },
  { filename: 'Supplier-Agreement-Avesta.docx', created_at: '12 Oct 2026, 08:58', size: '1.2 MB', pages: '23', status: 'processing' },
  { filename: 'Field-Notes-Week-41.md', created_at: '11 Oct 2026, 17:02', size: '48 KB', pages: '—', status: 'queued' },
  { filename: 'Scanned-Invoices-Sept.pdf', created_at: '10 Oct 2026, 14:36', size: '19.7 MB', pages: '64', status: 'failed', failure_reason: 'No readable text found — this looks like a scan' }
];

const DEMO_CITATIONS = [
  {
    n: 1,
    filename: 'Employee-Handbook-2026.pdf',
    page: 14,
    quoted_passage: 'Employees who have completed two years of continuous service are required to give six weeks’ written notice. Notice must be given to the line manager and copied to People Operations.'
  },
  {
    n: 2,
    filename: 'Leave-Policy-v3.docx',
    page: 4,
    quoted_passage: 'Accrued but untaken annual leave is paid in the final salary run at the daily rate in force on the leaving date. Leave taken in excess of accrual is deducted at the same rate.'
  }
];

const CHECKLIST = [
  { id: 'c1', text: 'Created an account with my email and password' },
  { id: 'c2', text: 'Uploaded a PDF, Word, Markdown or text file' },
  { id: 'c3', text: 'Waited for the document to reach Ready' },
  { id: 'c4', text: 'Asked a first question in the chat' },
  { id: 'c5', text: 'Opened a citation and read the source passage' }
];

const STATUS_META = {
  queued: { label: 'Queued', Icon: IcoClock, meaning: 'Accepted and waiting for a worker. Nothing for you to do.' },
  processing: { label: 'Processing', Icon: IcoUpload, meaning: 'Text is being extracted, split and embedded. Usually under two minutes.' },
  ready: { label: 'Ready', Icon: IcoCheckCircle, meaning: 'Searchable. Questions can now be answered from this document.' },
  failed: { label: 'Failed', Icon: IcoAlert, meaning: 'Something stopped the job. The reason is shown next to the file, with a Retry button.' }
};

function StatusChip({ status, size = 'md' }) {
  const meta = STATUS_META[status];
  const Icon = meta.Icon;
  const pad = size === 'lg' ? 'px-4 py-2 text-base' : 'px-3 py-1.5 text-sm';
  const styles = {
    queued: { backgroundColor: tint(brand.neutralColor, 0.14), color: INK, border: `1px solid ${tint(brand.neutralColor, 0.3)}` },
    processing: { backgroundColor: tint(brand.primaryColor, 0.12), color: PRIMARY_INK, border: `1px solid ${tint(brand.primaryColor, 0.3)}` },
    ready: { backgroundColor: tint(brand.accentColor, 0.14), color: ACCENT_INK, border: `1px solid ${tint(brand.accentColor, 0.35)}` },
    failed: { backgroundColor: darken(brand.neutralColor, 0.45), color: '#FFFFFF', border: `1px solid ${darken(brand.neutralColor, 0.5)}` }
  }[status];
  return (
    <span
      className={`inline-flex items-center gap-2 font-semibold whitespace-nowrap ${pad}`}
      style={{ ...styles, borderRadius: brand.radius }}
    >
      <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
      {meta.label}
    </span>
  );
}

function GuideNote({ tone = 'neutral', title, children }) {
  const color = tone === 'accent' ? brand.accentColor : tone === 'primary' ? brand.primaryColor : brand.neutralColor;
  const ink = tone === 'accent' ? ACCENT_INK : tone === 'primary' ? PRIMARY_INK : INK;
  return (
    <div
      className="mt-6 p-5"
      style={{
        borderRadius: brand.radius,
        backgroundColor: tint(color, 0.07),
        borderLeft: `3px solid ${color}`
      }}
    >
      <p className="text-sm font-semibold" style={{ color: ink }}>{title}</p>
      <div className="mt-2 text-[15px] leading-relaxed" style={{ color: INK }}>{children}</div>
    </div>
  );
}

export default function Screen() {
  const navigate = useNavigate();
  const [activeId, setActiveId] = React.useState('account');
  const [query, setQuery] = React.useState('');
  const [done, setDone] = React.useState({ c1: true, c2: true });
  const [openCitation, setOpenCitation] = React.useState(null);
  const [sync, setSync] = React.useState('stale'); // stale | checking | current
  const [feedback, setFeedback] = React.useState('idle'); // idle | asking | sent
  const [feedbackText, setFeedbackText] = React.useState('');
  const [jump, setJump] = React.useState(0);
  const headingRef = React.useRef(null);

  React.useEffect(() => {
    if (jump > 0 && headingRef.current) headingRef.current.focus();
  }, [jump]);

  React.useEffect(() => {
    if (sync !== 'checking') return undefined;
    const t = setTimeout(() => setSync('current'), 900);
    return () => clearTimeout(t);
  }, [sync]);

  const q = query.trim().toLowerCase();
  const matches = q
    ? SECTIONS.filter((s) => (s.label + ' ' + s.blurb + ' ' + s.keywords).toLowerCase().includes(q))
    : SECTIONS;

  const activeIndex = SECTIONS.findIndex((s) => s.id === activeId);
  const active = SECTIONS[activeIndex];
  const completed = CHECKLIST.filter((c) => done[c.id]).length;
  const allDone = completed === CHECKLIST.length;

  function goTo(id) {
    setActiveId(id);
    setQuery('');
    setJump((j) => j + 1);
  }

  function PrimaryAction({ onClick, children }) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center justify-center gap-2 px-5 py-3 text-[15px] font-semibold text-white transition-transform duration-150 ease-out hover:-translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        style={{ backgroundColor: brand.primaryColor, borderRadius: brand.radius, boxShadow: `0 1px 2px ${tint(brand.primaryColor, 0.35)}` }}
      >
        {children}
      </button>
    );
  }

  function GhostAction({ onClick, children }) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center justify-center gap-2 px-5 py-3 text-[15px] font-semibold bg-white transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        style={{ color: PRIMARY_INK, border: `1px solid ${tint(brand.primaryColor, 0.35)}`, borderRadius: brand.radius }}
      >
        {children}
      </button>
    );
  }

  function CitationMarker({ c, open, onToggle }) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={`Citation ${c.n}: ${c.filename}, page ${c.page}. Show the source passage.`}
        className="mx-1 inline-flex items-baseline gap-1 px-2 py-0.5 align-baseline text-[13px] font-semibold transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
        style={{
          backgroundColor: open ? brand.primaryColor : tint(brand.primaryColor, 0.12),
          color: open ? '#FFFFFF' : PRIMARY_INK,
          borderRadius: brand.radius,
          fontVariantNumeric: 'tabular-nums'
        }}
      >
        {c.n}
      </button>
    );
  }

  /* ---------- section bodies ---------- */
  function Body({ id }) {
    if (id === 'account') {
      return (
        <div>
          <p className="text-[17px] leading-8" style={{ color: INK }}>
            An account is an email address and a password. There is no card to add and no team to join —
            everything you upload belongs to your account alone.
          </p>
          <h3 className="mt-8 text-lg font-semibold" style={{ color: INK, fontFamily: brand.fontHeading }}>Step by step</h3>
          <ol className="mt-4 space-y-4">
            {[
              'Open Sign up and enter the email address you want to use. One account per address.',
              'Choose a password of at least 10 characters with one letter and one number. If it is too short, the form tells you which field to fix and keeps everything else you typed.',
              'Submit. You are signed in straight away and landed on your document library, which will be empty.',
              'To finish a session, use Log out. Your session cookie is cancelled on the server, and any app page you open afterwards sends you back to the login screen.'
            ].map((t, i) => (
              <li key={i} className="flex gap-4">
                <span
                  className="shrink-0 w-7 h-7 inline-flex items-center justify-center text-sm font-bold tabular-nums"
                  style={{ backgroundColor: tint(brand.primaryColor, 0.12), color: PRIMARY_INK, borderRadius: '999px' }}
                >
                  {i + 1}
                </span>
                <span className="text-[15px] leading-7 pt-0.5" style={{ color: INK }}>{t}</span>
              </li>
            ))}
          </ol>
          <GuideNote tone="neutral" title="If you are locked out">
            Password reset by email is not built yet. Until it is, email <span className="font-semibold">help@groundedchat.app</span> from
            the address on the account and an operator will reset it by hand, usually the same working day.
            Your password is only ever stored as a salted hash — nobody here can read it back to you.
          </GuideNote>
          <div className="mt-8 flex flex-wrap gap-3">
            <PrimaryAction onClick={() => navigate('sign-up')}>
              Create your account <IcoRight className="w-4 h-4" aria-hidden="true" />
            </PrimaryAction>
            <GhostAction onClick={() => navigate('login')}>I already have an account</GhostAction>
          </div>
        </div>
      );
    }

    if (id === 'upload') {
      return (
        <div>
          <p className="text-[17px] leading-8" style={{ color: INK }}>
            Open your document library and drag files onto it, or use <span className="font-semibold">Add documents</span>.
            Each file becomes its own row the moment it is accepted — you do not have to wait on the page while it is prepared.
          </p>

          <h3 className="mt-8 text-lg font-semibold" style={{ color: INK, fontFamily: brand.fontHeading }}>Supported file types</h3>
          <div className="mt-4 overflow-hidden bg-white" style={{ border: `1px solid ${LINE}`, borderRadius: brand.radius }}>
            <GTable className="w-full text-left" style={{ fontVariantNumeric: 'tabular-nums' }}>
              <GTHead>
                <GTR>
                  <GTH className="px-5 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: brand.neutralColor, backgroundColor: SOFT }}>Type</GTH>
                  <GTH className="px-5 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: brand.neutralColor, backgroundColor: SOFT }}>Extension</GTH>
                  <GTH className="px-5 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: brand.neutralColor, backgroundColor: SOFT }}>What to expect</GTH>
                </GTR>
              </GTHead>
              <GTBody>
                {FILE_TYPES.map((f) => (
                  <GTR key={f.ext} style={{ borderTop: `1px solid ${LINE}` }}>
                    <GTD className="px-5 py-4 text-[15px] font-semibold" style={{ color: INK }}>{f.type}</GTD>
                    <GTD className="px-5 py-4 text-[15px] font-mono" style={{ color: PRIMARY_INK }}>{f.ext}</GTD>
                    <GTD className="px-5 py-4 text-[15px] leading-6" style={{ color: INK }}>{f.note}</GTD>
                  </GTR>
                ))}
              </GTBody>
            </GTable>
          </div>

          <h3 className="mt-8 text-lg font-semibold" style={{ color: INK, fontFamily: brand.fontHeading }}>The ceilings</h3>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            {[
              { k: 'Per file size', v: '25 MB', d: 'A file over this is refused before any processing starts, and the message states your file’s actual size.' },
              { k: 'Per file length', v: '400 pages', d: 'Longer documents are better split into parts before uploading.' }
            ].map((m) => (
              <div key={m.k} className="bg-white p-5" style={{ border: `1px solid ${LINE}`, borderRadius: brand.radius }}>
                <dt className="text-xs font-semibold uppercase tracking-wide" style={{ color: brand.neutralColor }}>{m.k}</dt>
                <dd className="mt-1 text-3xl font-bold" style={{ color: INK, fontVariantNumeric: 'tabular-nums', fontFamily: brand.fontHeading }}>{m.v}</dd>
                <dd className="mt-2 text-[15px] leading-6" style={{ color: INK }}>{m.d}</dd>
              </div>
            ))}
          </dl>

          <GuideNote tone="primary" title="Selecting several files at once is fine">
            Pick ten files and each one gets its own row and its own status. One failure never holds up the others.
            A file that is not PDF, Word, Markdown or plain text is turned away with a message listing those four types.
          </GuideNote>

          <div className="mt-8">
            <PrimaryAction onClick={() => navigate('documents')}>
              <IcoUpload className="w-4 h-4" aria-hidden="true" /> Go to my document library
            </PrimaryAction>
          </div>
        </div>
      );
    }

    if (id === 'statuses') {
      return (
        <div>
          <p className="text-[17px] leading-8" style={{ color: INK }}>
            Every document carries one of four words. They update by themselves while you watch the library —
            there is no refresh button to hunt for.
          </p>

          <ul className="mt-6 space-y-3">
            {['queued', 'processing', 'ready', 'failed'].map((s) => (
              <li
                key={s}
                className="flex flex-col gap-3 bg-white p-5 sm:flex-row sm:items-center"
                style={{ border: `1px solid ${LINE}`, borderRadius: brand.radius }}
              >
                <div className="sm:w-44 shrink-0"><StatusChip status={s} size="lg" /></div>
                <p className="text-[15px] leading-7" style={{ color: INK }}>{STATUS_META[s].meaning}</p>
              </li>
            ))}
          </ul>

          <h3 className="mt-10 text-lg font-semibold" style={{ color: INK, fontFamily: brand.fontHeading }}>How that looks in your library</h3>
          <div className="mt-4 overflow-x-auto bg-white" style={{ border: `1px solid ${LINE}`, borderRadius: brand.radius }}>
            <GTable className="w-full text-left" style={{ fontVariantNumeric: 'tabular-nums' }}>
              <GTHead>
                <GTR>
                  <GTH className="px-5 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: brand.neutralColor, backgroundColor: SOFT }}>File</GTH>
                  <GTH className="px-5 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: brand.neutralColor, backgroundColor: SOFT }}>Uploaded</GTH>
                  <GTH className="px-5 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: brand.neutralColor, backgroundColor: SOFT }}>Size</GTH>
                  <GTH className="px-5 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: brand.neutralColor, backgroundColor: SOFT }}>Pages</GTH>
                  <GTH className="px-5 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: brand.neutralColor, backgroundColor: SOFT }}>Status</GTH>
                </GTR>
              </GTHead>
              <GTBody>
                {SAMPLE_LIBRARY.map((d) => (
                  <GTR key={d.filename} style={{ borderTop: `1px solid ${LINE}` }}>
                    <GTD className="px-5 py-4">
                      <span className="flex items-center gap-2 text-[15px] font-medium" style={{ color: INK }}>
                        <IcoFile className="w-4 h-4 shrink-0" aria-hidden="true" />
                        {d.filename}
                      </span>
                      {d.failure_reason ? (
                        <span className="mt-1 block text-sm" style={{ color: brand.neutralColor }}>{d.failure_reason}</span>
                      ) : null}
                    </GTD>
                    <GTD className="px-5 py-4 text-[15px] whitespace-nowrap" style={{ color: brand.neutralColor }}>{d.created_at}</GTD>
                    <GTD className="px-5 py-4 text-[15px] whitespace-nowrap" style={{ color: brand.neutralColor }}>{d.size}</GTD>
                    <GTD className="px-5 py-4 text-[15px]" style={{ color: brand.neutralColor }}>{d.pages}</GTD>
                    <GTD className="px-5 py-4"><StatusChip status={d.status} /></GTD>
                  </GTR>
                ))}
              </GTBody>
            </GTable>
          </div>

          <GuideNote tone="accent" title="Failed is not the end of it">
            A failed document keeps its file, so <span className="font-semibold">Retry</span> queues a fresh attempt on the same upload and
            throws away anything half-written from the first try. If a PDF is a photograph of pages rather than text, retrying will not help —
            it needs a text version instead.
          </GuideNote>

          <GuideNote tone="neutral" title="Deleting really deletes">
            <span className="inline-flex items-center gap-1.5 font-semibold"><IcoTrash className="w-4 h-4" aria-hidden="true" /> Delete</span> asks you to
            confirm, then removes the file, its extracted text and its embeddings together. After that it cannot be retrieved and will never
            appear in an answer again.
          </GuideNote>
        </div>
      );
    }

    if (id === 'ask') {
      return (
        <div>
          <p className="text-[17px] leading-8" style={{ color: INK }}>
            Open <span className="font-semibold">Chat</span>, type a question in your own words and send it.
            Your question is matched against every document of yours that says Ready, and only the closest passages
            are handed to the model along with the question.
          </p>

          <h3 className="mt-8 text-lg font-semibold" style={{ color: INK, fontFamily: brand.fontHeading }}>What a good first question looks like</h3>
          <ul className="mt-4 space-y-3">
            {[
              '“What notice period applies after two years of service?”',
              '“Summarise the renewal terms in the Avesta supplier agreement.”',
              '“Which risks were flagged twice in the Q3 board pack?”'
            ].map((ex) => (
              <li key={ex} className="flex items-start gap-3 text-[15px] leading-7" style={{ color: INK }}>
                <IcoCheck className="w-5 h-5 shrink-0 mt-0.5" style={{ color: brand.accentColor }} aria-hidden="true" />
                <span>{ex}</span>
              </li>
            ))}
          </ul>

          <h3 className="mt-10 text-lg font-semibold" style={{ color: INK, fontFamily: brand.fontHeading }}>While the answer is being written</h3>
          <p className="mt-3 text-[15px] leading-7" style={{ color: INK }}>
            Text appears word by word as it is produced, so you can start reading immediately. If the connection to the model
            drops part way, you get a plain message and a <span className="font-semibold">Retry</span> button — never a sentence that
            just stops and pretends to be finished.
          </p>

          <GuideNote tone="primary" title="When the answer is not in your documents">
            The assistant replies <span className="italic">“I couldn’t find that in your documents.”</span> and shows no citations.
            It will not fall back on general knowledge, even for questions it could obviously answer. That is the whole point:
            if you see an answer, your documents said it.
          </GuideNote>

          <h3 className="mt-10 text-lg font-semibold" style={{ color: INK, fontFamily: brand.fontHeading }}>Follow-ups and chat history</h3>
          <ul className="mt-4 space-y-3 text-[15px] leading-7" style={{ color: INK }}>
            <li className="flex gap-3"><IcoRight className="w-4 h-4 mt-1.5 shrink-0" style={{ color: brand.primaryColor }} aria-hidden="true" /><span>Ask “and what about the second one?” — the conversation so far is used to work out what you meant before the search runs.</span></li>
            <li className="flex gap-3"><IcoRight className="w-4 h-4 mt-1.5 shrink-0" style={{ color: brand.primaryColor }} aria-hidden="true" /><span>Each chat is titled from your first question, so the sidebar reads sensibly. Rename it whenever you like; it will not be re-titled behind you.</span></li>
            <li className="flex gap-3"><IcoRight className="w-4 h-4 mt-1.5 shrink-0" style={{ color: brand.primaryColor }} aria-hidden="true" /><span>Deleting a chat removes its messages only. The documents it cited stay in your library.</span></li>
            <li className="flex gap-3"><IcoRight className="w-4 h-4 mt-1.5 shrink-0" style={{ color: brand.primaryColor }} aria-hidden="true" /><span>On a phone the chat list tucks behind a toggle at the top; opening and closing it keeps you in the conversation you were reading.</span></li>
          </ul>

          <div className="mt-8">
            <PrimaryAction onClick={() => navigate('chat')}>
              Open the chat <IcoRight className="w-4 h-4" aria-hidden="true" />
            </PrimaryAction>
          </div>
        </div>
      );
    }

    if (id === 'citations') {
      return (
        <div>
          <p className="text-[17px] leading-8" style={{ color: INK }}>
            Every supported statement carries a small numbered marker with the document name and page.
            Select a marker to read the exact passage the answer was built from. Try it on this example answer.
          </p>

          <div className="mt-6 bg-white p-6" style={{ border: `1px solid ${LINE}`, borderRadius: brand.radius }}>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: brand.neutralColor }}>Example answer</p>
            <p className="mt-3 text-[17px] leading-8" style={{ color: INK }}>
              Anyone past two years of continuous service gives six weeks’ written notice
              <CitationMarker c={DEMO_CITATIONS[0]} open={openCitation === 1} onToggle={() => setOpenCitation(openCitation === 1 ? null : 1)} />
              {' '}and untaken annual leave is paid in the final salary run at the rate in force on the leaving date
              <CitationMarker c={DEMO_CITATIONS[1]} open={openCitation === 2} onToggle={() => setOpenCitation(openCitation === 2 ? null : 2)} />.
            </p>

            {openCitation ? (
              <div
                className="mt-5 p-5 gc-reveal"
                style={{ backgroundColor: tint(brand.primaryColor, 0.06), border: `1px solid ${tint(brand.primaryColor, 0.25)}`, borderRadius: brand.radius }}
              >
                <div className="flex items-start justify-between gap-4">
                  <p className="text-sm font-semibold" style={{ color: PRIMARY_INK }}>
                    {DEMO_CITATIONS[openCitation - 1].filename} · page <span style={{ fontVariantNumeric: 'tabular-nums' }}>{DEMO_CITATIONS[openCitation - 1].page}</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => setOpenCitation(null)}
                    aria-label="Close the source passage"
                    className="shrink-0 p-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                    style={{ color: brand.neutralColor, borderRadius: brand.radius }}
                  >
                    <IcoX className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
                <blockquote
                  className="mt-3 pl-4 text-[15px] leading-7 italic"
                  style={{ color: INK, borderLeft: `3px solid ${brand.primaryColor}` }}
                >
                  {DEMO_CITATIONS[openCitation - 1].quoted_passage}
                </blockquote>
              </div>
            ) : (
              <p className="mt-5 text-sm" style={{ color: brand.neutralColor }}>
                Nothing open yet — select marker <span style={{ fontVariantNumeric: 'tabular-nums' }}>1</span> or{' '}
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>2</span> above to see the passage behind it.
              </p>
            )}
          </div>

          <h3 className="mt-10 text-lg font-semibold" style={{ color: INK, fontFamily: brand.fontHeading }}>How to check an answer in under a minute</h3>
          <ol className="mt-4 space-y-3 text-[15px] leading-7" style={{ color: INK }}>
            <li>Read the claim, then open its marker and read the passage next to it.</li>
            <li>If the passage does not say what the answer says, treat the answer as wrong and tell us.</li>
            <li>No marker on a sentence means no document backed it. Ask again, more specifically.</li>
          </ol>

          <GuideNote tone="accent" title="Markers always resolve">
            A citation can only point at a passage that belongs to you, still exists, and was actually among the passages given to the
            model for that answer. If you delete the document, the answer stays in your history but the passage is gone with the file.
          </GuideNote>
        </div>
      );
    }

    return (
      <div>
        <p className="text-[17px] leading-8" style={{ color: INK }}>
          Knowing what the product does not do saves you an afternoon. This is the full list for the current release.
        </p>

        <h3 className="mt-8 text-lg font-semibold" style={{ color: INK, fontFamily: brand.fontHeading }}>Not in this release</h3>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {[
            'Scanned PDFs and photographs of pages (no OCR yet)',
            'Spreadsheets and CSV files',
            'Web pages added by pasting a URL',
            'Audio and video transcription',
            'Sharing a document or chat with someone else',
            'Exporting conversations',
            'Google sign-in, email verification, self-serve password reset',
            'Single sign-on and multi-factor authentication'
          ].map((t) => (
            <li
              key={t}
              className="flex items-start gap-3 bg-white p-4 text-[15px] leading-6"
              style={{ color: INK, border: `1px solid ${LINE}`, borderRadius: brand.radius }}
            >
              <IcoX className="w-4 h-4 mt-0.5 shrink-0" style={{ color: brand.neutralColor }} aria-hidden="true" />
              <span>{t}</span>
            </li>
          ))}
        </ul>

        <h3 className="mt-10 text-lg font-semibold" style={{ color: INK, fontFamily: brand.fontHeading }}>How your content is handled</h3>
        <ul className="mt-4 space-y-3 text-[15px] leading-7" style={{ color: INK }}>
          <li className="flex gap-3"><IcoCheck className="w-5 h-5 mt-1 shrink-0" style={{ color: brand.accentColor }} aria-hidden="true" /><span>Answers and embeddings both come from Google Gemini, on a paid tier whose terms exclude your content from model training.</span></li>
          <li className="flex gap-3"><IcoCheck className="w-5 h-5 mt-1 shrink-0" style={{ color: brand.accentColor }} aria-hidden="true" /><span>Your documents, passages and chats are scoped to your account. A request for someone else’s document returns nothing at all.</span></li>
          <li className="flex gap-3"><IcoCheck className="w-5 h-5 mt-1 shrink-0" style={{ color: brand.accentColor }} aria-hidden="true" /><span>Delete removes the stored file, the extracted text and the embeddings together.</span></li>
          <li className="flex gap-3"><IcoAlert className="w-5 h-5 mt-1 shrink-0" style={{ color: brand.neutralColor }} aria-hidden="true" /><span>There is no EU data-residency commitment and no account-wide delete in this release. If you need either, tell us before uploading anything sensitive.</span></li>
        </ul>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: brand.backgroundColor, fontFamily: brand.fontBody }}>
      <style>{`
        @keyframes gcFade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        .gc-reveal { animation: gcFade 220ms ease-out both; }
        @media (prefers-reduced-motion: reduce) {
          .gc-reveal { animation: none; }
          .transition-transform, .transition-colors { transition: none !important; }
        }
      `}</style>

      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* ---------- page header ---------- */}
        <header className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: brand.primaryColor }}>
            Documentation
          </p>
          <h1
            className="mt-3 text-4xl sm:text-5xl font-bold tracking-tight"
            style={{ color: INK, fontFamily: brand.fontHeading }}
          >
            Getting started
          </h1>
          <p className="mt-4 text-lg leading-8" style={{ color: brand.neutralColor }}>
            From a new account to a first answer you can check, in about ten minutes. Six short parts —
            read them in order, or jump to the one you need.
          </p>
        </header>

        {/* ---------- stale / sync notice ---------- */}
        <div
          className="mt-8 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
          style={{
            backgroundColor: sync === 'current' ? tint(brand.accentColor, 0.09) : 'white',
            border: `1px solid ${sync === 'current' ? tint(brand.accentColor, 0.35) : LINE}`,
            borderRadius: brand.radius
          }}
        >
          <p className="flex items-center gap-2.5 text-sm" style={{ color: INK }}>
            {sync === 'current' ? (
              <IcoCheckCircle className="w-4 h-4 shrink-0" style={{ color: ACCENT_INK }} aria-hidden="true" />
            ) : (
              <IcoClock className="w-4 h-4 shrink-0" style={{ color: brand.neutralColor }} aria-hidden="true" />
            )}
            {sync === 'stale' && <span>You are reading the saved copy of this guide. Last synced <span style={{ fontVariantNumeric: 'tabular-nums' }}>13 Oct 2026, 09:12</span>.</span>}
            {sync === 'checking' && <span>Checking for a newer version of the guide…</span>}
            {sync === 'current' && <span style={{ color: ACCENT_INK }}>Up to date. This is release <span style={{ fontVariantNumeric: 'tabular-nums' }}>2026.10.13</span> of the guide.</span>}
          </p>
          {sync !== 'current' && (
            <button
              type="button"
              onClick={() => setSync('checking')}
              disabled={sync === 'checking'}
              className="self-start px-4 py-2 text-sm font-semibold bg-white disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              style={{ color: PRIMARY_INK, border: `1px solid ${tint(brand.primaryColor, 0.35)}`, borderRadius: brand.radius }}
            >
              {sync === 'checking' ? 'Checking…' : 'Check for updates'}
            </button>
          )}
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[19rem_minmax(0,1fr)] lg:gap-12">
          {/* ---------- rail ---------- */}
          <div className="space-y-6">
            <nav aria-labelledby="guide-contents-heading">
              <h2
                id="guide-contents-heading"
                className="text-xs font-semibold uppercase tracking-[0.14em]"
                style={{ color: brand.neutralColor }}
              >
                Guide contents
              </h2>

              <div className="mt-3">
                <label htmlFor="guide-search" className="block text-sm font-medium" style={{ color: INK }}>
                  Search the guide
                </label>
                <div className="relative mt-1.5">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
                    <IcoSearch className="w-4 h-4" style={{ color: brand.neutralColor }} aria-hidden="true" />
                  </span>
                  <input
                    id="guide-search"
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="e.g. size limit, citations"
                    className="w-full bg-white py-2.5 pl-9 pr-9 text-[15px] focus:outline-none focus-visible:ring-2"
                    style={{ color: INK, border: `1px solid ${LINE}`, borderRadius: brand.radius }}
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => setQuery('')}
                      aria-label="Clear the guide search"
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 focus:outline-none focus-visible:ring-2"
                      style={{ color: brand.neutralColor, borderRadius: brand.radius }}
                    >
                      <IcoX className="w-4 h-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
                <p className="mt-2 text-sm" style={{ color: brand.neutralColor, fontVariantNumeric: 'tabular-nums' }}>
                  {query ? `${matches.length} of ${SECTIONS.length} parts match` : `${SECTIONS.length} parts, about 12 minutes`}
                </p>
              </div>

              <ol className="mt-4 space-y-1.5">
                {matches.map((s) => {
                  const isActive = s.id === activeId && !query;
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => goTo(s.id)}
                        aria-current={isActive ? 'true' : undefined}
                        className="w-full text-left px-4 py-3 transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                        style={{
                          backgroundColor: isActive ? brand.primaryColor : 'white',
                          color: isActive ? '#FFFFFF' : INK,
                          border: `1px solid ${isActive ? brand.primaryColor : LINE}`,
                          borderRadius: brand.radius
                        }}
                      >
                        <span className="flex items-baseline gap-2.5">
                          <span
                            className="text-xs font-bold"
                            style={{ fontVariantNumeric: 'tabular-nums', color: isActive ? 'rgba(255,255,255,0.75)' : brand.neutralColor }}
                          >
                            {String(SECTIONS.findIndex((x) => x.id === s.id) + 1).padStart(2, '0')}
                          </span>
                          <span className="text-[15px] font-semibold leading-6">{s.label}</span>
                        </span>
                        <span
                          className="mt-0.5 block pl-7 text-xs"
                          style={{ color: isActive ? 'rgba(255,255,255,0.8)' : brand.neutralColor, fontVariantNumeric: 'tabular-nums' }}
                        >
                          {s.minutes} read
                        </span>
                      </button>
                    </li>
                  );
                })}
                {matches.length === 0 && (
                  <li className="px-4 py-3 text-sm" style={{ color: brand.neutralColor }}>
                    No part of the guide matches that.
                  </li>
                )}
              </ol>
            </nav>

            {/* ---------- checklist ---------- */}
            <section
              aria-labelledby="checklist-heading"
              className="bg-white p-5"
              style={{ border: `1px solid ${LINE}`, borderRadius: brand.radius }}
            >
              <h2 id="checklist-heading" className="text-sm font-semibold" style={{ color: INK }}>
                Your setup checklist
              </h2>
              <p className="mt-1 text-sm" style={{ color: brand.neutralColor, fontVariantNumeric: 'tabular-nums' }}>
                {completed} of {CHECKLIST.length} done
              </p>
              <div className="mt-3 h-1.5 w-full overflow-hidden" style={{ backgroundColor: tint(brand.neutralColor, 0.18), borderRadius: '999px' }}>
                <div
                  className="h-full transition-all duration-300 ease-out"
                  style={{ width: `${(completed / CHECKLIST.length) * 100}%`, backgroundColor: brand.accentColor }}
                />
              </div>

              <ul className="mt-4 space-y-3">
                {CHECKLIST.map((c) => (
                  <li key={c.id} className="flex items-start gap-3">
                    <input
                      id={c.id}
                      type="checkbox"
                      checked={!!done[c.id]}
                      onChange={(e) => setDone({ ...done, [c.id]: e.target.checked })}
                      className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                      style={{ accentColor: brand.accentColor }}
                    />
                    <label
                      htmlFor={c.id}
                      className="cursor-pointer text-[15px] leading-6"
                      style={{ color: done[c.id] ? brand.neutralColor : INK, textDecoration: done[c.id] ? 'line-through' : 'none' }}
                    >
                      {c.text}
                    </label>
                  </li>
                ))}
              </ul>

              {allDone && (
                <div
                  className="mt-4 p-4 gc-reveal"
                  style={{ backgroundColor: tint(brand.accentColor, 0.1), borderRadius: brand.radius }}
                >
                  <p className="flex items-center gap-2 text-sm font-semibold" style={{ color: ACCENT_INK }}>
                    <IcoCheckCircle className="w-4 h-4" aria-hidden="true" /> That is the whole product.
                  </p>
                  <p className="mt-1 text-sm leading-6" style={{ color: INK }}>
                    Nothing else to set up. Keep uploading as you go.
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate('chat')}
                    className="mt-3 w-full px-4 py-2.5 text-sm font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                    style={{ backgroundColor: brand.accentColor, borderRadius: brand.radius }}
                  >
                    Back to the chat
                  </button>
                </div>
              )}
            </section>
          </div>

          {/* ---------- main panel ---------- */}
          <main>
            {query ? (
              matches.length > 0 ? (
                <section aria-labelledby="results-heading" className="gc-reveal">
                  <h2 id="results-heading" className="text-2xl font-bold tracking-tight" style={{ color: INK, fontFamily: brand.fontHeading }}>
                    {matches.length} {matches.length === 1 ? 'part' : 'parts'} mention “{query.trim()}”
                  </h2>
                  <ul className="mt-6 space-y-3">
                    {matches.map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => goTo(s.id)}
                          className="group w-full bg-white p-6 text-left transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                          style={{ border: `1px solid ${LINE}`, borderRadius: brand.radius }}
                        >
                          <span className="flex items-center justify-between gap-4">
                            <span className="text-lg font-semibold" style={{ color: PRIMARY_INK, fontFamily: brand.fontHeading }}>{s.label}</span>
                            <IcoRight className="w-5 h-5 shrink-0" style={{ color: brand.primaryColor }} aria-hidden="true" />
                          </span>
                          <span className="mt-2 block text-[15px] leading-7" style={{ color: INK }}>{s.blurb}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : (
                <section
                  aria-labelledby="no-results-heading"
                  className="bg-white p-10 text-center gc-reveal"
                  style={{ border: `1px solid ${LINE}`, borderRadius: brand.radius }}
                >
                  <span
                    className="mx-auto flex h-12 w-12 items-center justify-center"
                    style={{ backgroundColor: tint(brand.neutralColor, 0.12), borderRadius: '999px' }}
                  >
                    <IcoSearch className="w-5 h-5" style={{ color: brand.neutralColor }} aria-hidden="true" />
                  </span>
                  <h2 id="no-results-heading" className="mt-5 text-xl font-bold" style={{ color: INK, fontFamily: brand.fontHeading }}>
                    Nothing in the guide covers “{query.trim()}”
                  </h2>
                  <p className="mx-auto mt-2 max-w-md text-[15px] leading-7" style={{ color: brand.neutralColor }}>
                    This guide only documents what the product does today. Try one of these instead, or clear the search and read it in order.
                  </p>
                  <div className="mt-6 flex flex-wrap justify-center gap-2">
                    {['size limit', 'citations', 'failed', 'password'].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setQuery(s)}
                        className="px-4 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                        style={{ backgroundColor: tint(brand.primaryColor, 0.1), color: PRIMARY_INK, borderRadius: brand.radius }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="mt-6 px-5 py-2.5 text-sm font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                    style={{ backgroundColor: brand.primaryColor, borderRadius: brand.radius }}
                  >
                    Clear search
                  </button>
                </section>
              )
            ) : (
              <article key={active.id} className="gc-reveal">
                <div
                  className="bg-white p-6 sm:p-10"
                  style={{ border: `1px solid ${LINE}`, borderRadius: brand.radius }}
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: brand.neutralColor, fontVariantNumeric: 'tabular-nums' }}>
                    Part {activeIndex + 1} of {SECTIONS.length} · {active.minutes} read
                  </p>
                  <h2
                    ref={headingRef}
                    tabIndex={-1}
                    className="mt-2 text-3xl font-bold tracking-tight focus:outline-none"
                    style={{ color: INK, fontFamily: brand.fontHeading }}
                  >
                    {active.label}
                  </h2>
                  <div className="mt-6">
                    <Body id={active.id} />
                  </div>
                </div>

                {/* prev / next */}
                <nav aria-label="Guide pagination" className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-between">
                  {activeIndex > 0 ? (
                    <button
                      type="button"
                      onClick={() => goTo(SECTIONS[activeIndex - 1].id)}
                      className="flex items-center gap-3 bg-white px-5 py-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                      style={{ border: `1px solid ${LINE}`, borderRadius: brand.radius }}
                    >
                      <IcoLeft className="w-5 h-5 shrink-0" style={{ color: brand.primaryColor }} aria-hidden="true" />
                      <span>
                        <span className="block text-xs" style={{ color: brand.neutralColor }}>Previous</span>
                        <span className="block text-[15px] font-semibold" style={{ color: PRIMARY_INK }}>{SECTIONS[activeIndex - 1].label}</span>
                      </span>
                    </button>
                  ) : <span className="hidden sm:block" />}

                  {activeIndex < SECTIONS.length - 1 ? (
                    <button
                      type="button"
                      onClick={() => goTo(SECTIONS[activeIndex + 1].id)}
                      className="flex items-center justify-end gap-3 bg-white px-5 py-4 text-right focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                      style={{ border: `1px solid ${LINE}`, borderRadius: brand.radius }}
                    >
                      <span>
                        <span className="block text-xs" style={{ color: brand.neutralColor }}>Next</span>
                        <span className="block text-[15px] font-semibold" style={{ color: PRIMARY_INK }}>{SECTIONS[activeIndex + 1].label}</span>
                      </span>
                      <IcoRight className="w-5 h-5 shrink-0" style={{ color: brand.primaryColor }} aria-hidden="true" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => navigate('documents')}
                      className="flex items-center justify-end gap-3 px-5 py-4 text-right text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                      style={{ backgroundColor: brand.primaryColor, borderRadius: brand.radius }}
                    >
                      <span>
                        <span className="block text-xs" style={{ color: 'rgba(255,255,255,0.8)' }}>You have read it all</span>
                        <span className="block text-[15px] font-semibold">Upload a document</span>
                      </span>
                      <IcoRight className="w-5 h-5 shrink-0" aria-hidden="true" />
                    </button>
                  )}
                </nav>

                {/* feedback */}
                <section
                  aria-labelledby="feedback-heading"
                  className="mt-6 bg-white p-6"
                  style={{ border: `1px solid ${LINE}`, borderRadius: brand.radius }}
                >
                  {feedback === 'sent' ? (
                    <div className="gc-reveal">
                      <h2 id="feedback-heading" className="flex items-center gap-2 text-base font-semibold" style={{ color: ACCENT_INK }}>
                        <IcoCheckCircle className="w-5 h-5" aria-hidden="true" /> Thank you — that is logged against this page
                      </h2>
                      <p className="mt-2 text-[15px] leading-7" style={{ color: INK }}>
                        {feedbackText.trim()
                          ? `We have your note: “${feedbackText.trim()}”. If it needs a reply we will use the address on your account.`
                          : 'We review page feedback every Friday and rewrite whatever keeps tripping people up.'}
                      </p>
                    </div>
                  ) : (
                    <div>
                      <h2 id="feedback-heading" className="text-base font-semibold" style={{ color: INK }}>
                        Did “{active.label}” tell you what you needed?
                      </h2>
                      <div className="mt-4 flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => { setFeedbackText(''); setFeedback('sent'); }}
                          className="px-5 py-2.5 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                          style={{ backgroundColor: tint(brand.accentColor, 0.12), color: ACCENT_INK, border: `1px solid ${tint(brand.accentColor, 0.35)}`, borderRadius: brand.radius }}
                        >
                          Yes, this was clear
                        </button>
                        <button
                          type="button"
                          onClick={() => setFeedback('asking')}
                          className="px-5 py-2.5 text-sm font-semibold bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                          style={{ color: INK, border: `1px solid ${LINE}`, borderRadius: brand.radius }}
                        >
                          No, something is missing
                        </button>
                      </div>

                      {feedback === 'asking' && (
                        <form
                          className="mt-5 gc-reveal"
                          onSubmit={(e) => { e.preventDefault(); setFeedback('sent'); }}
                        >
                          <label htmlFor="feedback-note" className="block text-sm font-medium" style={{ color: INK }}>
                            What were you looking for?
                          </label>
                          <textarea
                            id="feedback-note"
                            rows={3}
                            value={feedbackText}
                            onChange={(e) => setFeedbackText(e.target.value)}
                            placeholder="For example: how long processing usually takes for a 300-page PDF"
                            className="mt-1.5 w-full p-3 text-[15px] focus:outline-none focus-visible:ring-2"
                            style={{ color: INK, border: `1px solid ${LINE}`, borderRadius: brand.radius }}
                          />
                          <div className="mt-3 flex gap-3">
                            <button
                              type="submit"
                              className="px-5 py-2.5 text-sm font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                              style={{ backgroundColor: brand.primaryColor, borderRadius: brand.radius }}
                            >
                              Send to the docs team
                            </button>
                            <button
                              type="button"
                              onClick={() => { setFeedback('idle'); setFeedbackText(''); }}
                              className="px-5 py-2.5 text-sm font-semibold bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                              style={{ color: INK, border: `1px solid ${LINE}`, borderRadius: brand.radius }}
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  )}
                </section>
              </article>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
