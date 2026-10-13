// @ts-nocheck -- generated from the approved design under its JS runtime contract; not hand-written TypeScript.
/* eslint-disable @typescript-eslint/no-unused-vars */
import React from "react";

import * as UI from "@/lib/ui";
import { Icons } from "@/lib/icons";
import { brand } from "@/lib/brand";
import { useNavigate } from "@/lib/navigate";

const { Label, Separator } = UI;
const { Plus, Search, ChevronRight, ChevronDown, Menu, FileText, Trash, Edit, ArrowRight, AlertCircle } = Icons;

const rgba = (hex, a) => {
  const h = String(hex).replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

const darken = (hex, f) => {
  const h = String(hex).replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  const r = Math.round(((n >> 16) & 255) * (1 - f));
  const g = Math.round(((n >> 8) & 255) * (1 - f));
  const b = Math.round((n & 255) * (1 - f));
  return `rgb(${r}, ${g}, ${b})`;
};

const READY_DOCS = 7;
const PROCESSING_DOCS = 2;

const SCRIPTS = [
  {
    keys: ['notice', 'lease', 'ardent', 'terminate', 'break'],
    content:
      "The Ardent House lease can be ended early on six months' written notice, and that notice cannot be served before the third anniversary of the commencement date [[1]].\n\nNotice has to reach the landlord's registered office by recorded delivery — email on its own is not valid service [[2]]. If the premises are vacated without valid notice, rent for the rest of the term stays payable [[3]].",
    citations: [
      {
        n: 1,
        document: 'Ardent House — Lease Agreement.pdf',
        page: 14,
        quoted_passage:
          "The Tenant may determine this Lease on not less than six (6) months' prior written notice, such notice not to be served before the third anniversary of the Commencement Date."
      },
      {
        n: 2,
        document: 'Ardent House — Lease Agreement.pdf',
        page: 15,
        quoted_passage:
          "Any notice served under clause 12 shall be delivered by recorded delivery to the Landlord's registered office. Service by electronic mail shall not constitute valid service."
      },
      {
        n: 3,
        document: 'Ardent House — Lease Agreement.pdf',
        page: 16,
        quoted_passage:
          'Where the Tenant vacates the Premises without valid service of a determination notice, the rent for the remainder of the Term shall remain payable in full.'
      }
    ]
  },
  {
    keys: ['expense', 'approve', 'approval', 'sign off', 'signs off', '5,000', '5000'],
    content:
      'Anything above £5,000 needs two approvals: the budget holder, plus a member of the finance leadership team [[1]].\n\nBetween £1,000 and £5,000 the budget holder can approve it alone [[2]]. Travel booked outside the preferred supplier needs a written exception from Finance whatever it costs [[3]].',
    citations: [
      {
        n: 1,
        document: 'Finance Handbook 2026.docx',
        page: 22,
        quoted_passage:
          'Expenditure exceeding £5,000 requires dual approval: the relevant budget holder and one member of the Finance Leadership Team.'
      },
      {
        n: 2,
        document: 'Finance Handbook 2026.docx',
        page: 21,
        quoted_passage:
          'Expenditure of £1,000 to £5,000 inclusive may be approved by the budget holder acting alone, provided it falls within the approved annual plan.'
      },
      {
        n: 3,
        document: 'Finance Handbook 2026.docx',
        page: 24,
        quoted_passage:
          'Travel booked outside the preferred supplier requires a written exception from Finance, irrespective of value.'
      }
    ]
  },
  {
    keys: ['revenue', 'q3', 'region', 'emea', 'apac', 'split'],
    content:
      'Q3 revenue was £4.82m, 11% up on Q2 [[1]].\n\nBy region: EMEA £2.31m, North America £1.74m, APAC £0.77m [[2]]. The APAC number excludes the Wrenfield renewal, which was signed on 2 October and falls into Q4 [[3]].',
    citations: [
      {
        n: 1,
        document: 'Q3 Board Pack.pdf',
        page: 3,
        quoted_passage:
          'Group revenue for the quarter closed at £4.82m, an increase of 11% against Q2 and 6% ahead of plan.'
      },
      {
        n: 2,
        document: 'Q3 Board Pack.pdf',
        page: 4,
        quoted_passage: 'Regional split: EMEA £2.31m; North America £1.74m; APAC £0.77m.'
      },
      {
        n: 3,
        document: 'Q3 Board Pack.pdf',
        page: 9,
        quoted_passage:
          'The Wrenfield renewal (£0.41m) was executed on 2 October and is therefore recognised in Q4, not in the APAC figure above.'
      }
    ]
  },
  {
    keys: ['parental', 'leave', 'contractor', 'maternity', 'paternity'],
    content:
      'Enhanced parental leave applies to employees only — contractors engaged through an agency are explicitly out of scope [[1]].\n\nA contractor can agree unpaid time away with their engaging manager, and it has to be recorded against the statement of work [[2]].',
    citations: [
      {
        n: 1,
        document: 'People Policies — v4.md',
        page: 2,
        quoted_passage:
          'The enhanced parental leave provisions in this section apply to employees on a contract of employment. Agency and contract workers are out of scope.'
      },
      {
        n: 2,
        document: 'People Policies — v4.md',
        page: 3,
        quoted_passage:
          'Contract workers may agree periods of unpaid absence with their engaging manager; such periods must be recorded against the relevant statement of work.'
      }
    ]
  },
  {
    keys: ['retention', 'keep', 'delete', 'backup', 'records', 'how long'],
    content:
      'Customer records are kept for seven years after the contract ends, then deleted [[1]].\n\nSupport transcripts are kept for 18 months [[2]]. Backups roll off on a 35-day cycle, so a deletion request is fully flushed within 35 days [[3]].',
    citations: [
      {
        n: 1,
        document: 'Data Retention Standard.pdf',
        page: 2,
        quoted_passage:
          'Customer master records shall be retained for seven (7) years following termination or expiry of the contract, after which they are deleted.'
      },
      {
        n: 2,
        document: 'Data Retention Standard.pdf',
        page: 3,
        quoted_passage: 'Support conversation transcripts are retained for eighteen (18) months from the date of last contact.'
      },
      {
        n: 3,
        document: 'Data Retention Standard.pdf',
        page: 6,
        quoted_passage:
          'Encrypted backups are retained on a rolling 35-day cycle. A deletion request is therefore fully flushed from all systems within 35 days.'
      }
    ]
  },
  {
    keys: ['wrenfield', 'penalty', 'sow', 'late'],
    content:
      'The Wrenfield statement of work caps late-delivery penalties at 10% of the fees for the affected milestone [[1]].\n\nPenalties only start once a milestone is more than ten working days late, and they do not apply where the delay is caused by the client not supplying agreed inputs [[2]].',
    citations: [
      {
        n: 1,
        document: 'Wrenfield SOW — signed.pdf',
        page: 7,
        quoted_passage:
          'Service credits for late delivery shall not in aggregate exceed ten per cent (10%) of the Fees payable for the affected Milestone.'
      },
      {
        n: 2,
        document: 'Wrenfield SOW — signed.pdf',
        page: 8,
        quoted_passage:
          'No service credit accrues until a Milestone is more than ten (10) Working Days late, nor where delay arises from the Client failing to provide agreed inputs.'
      }
    ]
  }
];

const NOT_FOUND_TEXT =
  "I couldn't find an answer to that in your documents.\n\nNothing in your ready documents covers it, so I won't answer from general knowledge. If you think it should be in there, check the file is uploaded and shows as ready in your library.";

const INITIAL_CONVERSATIONS = [
  { id: 'c1', title: 'Notice period on the Ardent lease', updated: 'Today 09:41', title_locked: false },
  { id: 'c2', title: 'Q3 revenue split by region', updated: 'Yesterday 16:20', title_locked: false },
  { id: 'c3', title: 'Board pack — headcount question', updated: 'Sun 11:05', title_locked: true },
  { id: 'c4', title: 'Parental leave for contractors', updated: '8 Oct', title_locked: false },
  { id: 'c5', title: 'Penalty clause in the Wrenfield SOW', updated: '6 Oct', title_locked: false },
  { id: 'c6', title: 'Data retention commitments', updated: '30 Sep', title_locked: true }
];

const INITIAL_MESSAGES = {
  c1: [
    {
      id: 'm1',
      role: 'user',
      kind: 'question',
      time: '09:38',
      content: 'What notice do we have to give to end the Ardent House lease early?'
    },
    {
      id: 'm2',
      role: 'assistant',
      kind: 'answer',
      time: '09:38',
      content: SCRIPTS[0].content,
      citations: SCRIPTS[0].citations
    },
    { id: 'm3', role: 'user', kind: 'question', time: '09:41', content: 'And what about the second one — Wrenfield?' },
    {
      id: 'm4',
      role: 'assistant',
      kind: 'answer',
      time: '09:41',
      content: SCRIPTS[5].content,
      citations: SCRIPTS[5].citations
    }
  ],
  c2: [
    { id: 'm5', role: 'user', kind: 'question', time: '16:19', content: 'How did Q3 revenue split by region?' },
    {
      id: 'm6',
      role: 'assistant',
      kind: 'answer',
      time: '16:19',
      content: SCRIPTS[2].content,
      citations: SCRIPTS[2].citations
    },
    { id: 'm7', role: 'user', kind: 'question', time: '16:20', content: 'Does the board pack explain the APAC shortfall?' },
    {
      id: 'm8',
      role: 'assistant',
      kind: 'error',
      time: '16:20',
      content: '',
      question: 'Does the board pack explain the APAC shortfall?'
    }
  ],
  c3: [
    { id: 'm9', role: 'user', kind: 'question', time: '11:05', content: 'What was the average tenure of the engineering team in 2019?' },
    { id: 'm10', role: 'assistant', kind: 'notfound', time: '11:05', content: NOT_FOUND_TEXT }
  ],
  c4: [
    { id: 'm11', role: 'user', kind: 'question', time: '14:02', content: 'Does enhanced parental leave cover contractors?' },
    {
      id: 'm12',
      role: 'assistant',
      kind: 'answer',
      time: '14:02',
      content: SCRIPTS[3].content,
      citations: SCRIPTS[3].citations
    }
  ],
  c5: [
    { id: 'm13', role: 'user', kind: 'question', time: '10:27', content: 'What is the late delivery penalty in the Wrenfield SOW?' },
    {
      id: 'm14',
      role: 'assistant',
      kind: 'answer',
      time: '10:27',
      content: SCRIPTS[5].content,
      citations: SCRIPTS[5].citations
    }
  ],
  c6: [
    { id: 'm15', role: 'user', kind: 'question', time: '09:12', content: 'How long do we keep customer records?' },
    {
      id: 'm16',
      role: 'assistant',
      kind: 'answer',
      time: '09:12',
      content: SCRIPTS[4].content,
      citations: SCRIPTS[4].citations
    }
  ]
};

const SUGGESTIONS = [
  'Who signs off expenses over £5,000?',
  'How long do we keep customer records?',
  'What notice ends the Ardent House lease?'
];

const findScript = (question) => {
  const q = question.toLowerCase();
  let best = null;
  let score = 0;
  SCRIPTS.forEach((s) => {
    const hits = s.keys.filter((k) => q.includes(k)).length;
    if (hits > score) {
      score = hits;
      best = s;
    }
  });
  return score > 0 ? best : null;
};

const autoTitle = (question) => {
  let t = question.trim().replace(/\s+/g, ' ').replace(/[?.!]+$/, '');
  t = t.charAt(0).toUpperCase() + t.slice(1);
  if (t.length > 38) {
    const cut = t.slice(0, 38);
    const sp = cut.lastIndexOf(' ');
    t = (sp > 18 ? cut.slice(0, sp) : cut) + '…';
  }
  return t;
};

const parseContent = (text) => {
  const clean = text.replace(/\[\[?\d*$/, '');
  const parts = [];
  const re = /\[\[(\d+)\]\]/g;
  let last = 0;
  let m;
  while ((m = re.exec(clean)) !== null) {
    if (m.index > last) parts.push({ t: 'text', v: clean.slice(last, m.index) });
    parts.push({ t: 'cite', n: Number(m[1]) });
    last = m.index + m[0].length;
  }
  if (last < clean.length) parts.push({ t: 'text', v: clean.slice(last) });
  return parts;
};

export default function Screen() {
  const navigate = useNavigate();
  const TEXT = darken(brand.neutralColor, 0.55);
  const MUTED = brand.neutralColor;
  const LINE = rgba(brand.neutralColor, 0.2);
  const R = brand.radius;

  const [conversations, setConversations] = React.useState(INITIAL_CONVERSATIONS);
  const [messagesByConv, setMessagesByConv] = React.useState(INITIAL_MESSAGES);
  const [activeId, setActiveId] = React.useState('c1');
  const [draft, setDraft] = React.useState('');
  const [query, setQuery] = React.useState('');
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [renamingId, setRenamingId] = React.useState(null);
  const [renameDraft, setRenameDraft] = React.useState('');
  const [renameError, setRenameError] = React.useState('');
  const [confirmId, setConfirmId] = React.useState(null);
  const [openCite, setOpenCite] = React.useState(null);
  const [stream, setStream] = React.useState(null);
  const idRef = React.useRef(100);
  const scrollRef = React.useRef(null);
  const composerRef = React.useRef(null);
  const cancelRef = React.useRef(null);

  const nextId = (p) => {
    idRef.current += 1;
    return p + idRef.current;
  };

  const messages = activeId === 'new' ? [] : messagesByConv[activeId] || [];
  const activeConv = conversations.find((c) => c.id === activeId) || null;

  // token-by-token stream
  React.useEffect(() => {
    if (!stream) return undefined;
    const reduce =
      typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false;
    const step = reduce ? 400 : 5;
    const t = setInterval(() => {
      setStream((p) => (p ? { ...p, pos: Math.min(p.pos + step, p.len) } : p));
    }, 26);
    return () => clearInterval(t);
  }, [stream ? stream.msgId : null]);

  React.useEffect(() => {
    if (stream && stream.pos >= stream.len) setStream(null);
  }, [stream]);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, stream ? stream.pos : 0, activeId]);

  React.useEffect(() => {
    if (!confirmId) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setConfirmId(null);
    };
    window.addEventListener('keydown', onKey);
    if (cancelRef.current) cancelRef.current.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmId]);

  const touch = (id) =>
    setConversations((cs) => {
      const hit = cs.find((c) => c.id === id);
      if (!hit) return cs;
      return [{ ...hit, updated: 'Just now' }, ...cs.filter((c) => c.id !== id)];
    });

  const buildAnswer = (question) => {
    const script = findScript(question);
    const id = nextId('a');
    const time = '10:0' + (idRef.current % 10);
    if (!script) {
      return { msg: { id, role: 'assistant', kind: 'notfound', time, content: NOT_FOUND_TEXT }, len: NOT_FOUND_TEXT.length };
    }
    return {
      msg: { id, role: 'assistant', kind: 'answer', time, content: script.content, citations: script.citations },
      len: script.content.length
    };
  };

  const send = (raw) => {
    const question = (raw === undefined ? draft : raw).trim();
    if (!question || stream) return;
    let convId = activeId;
    if (activeId === 'new') {
      convId = nextId('c');
      setConversations((cs) => [{ id: convId, title: autoTitle(question), updated: 'Just now', title_locked: false }, ...cs]);
      setActiveId(convId);
    } else {
      setConversations((cs) => {
        const hit = cs.find((c) => c.id === convId);
        if (!hit) return cs;
        const existing = messagesByConv[convId] || [];
        const titled = hit.title_locked || existing.length > 0 ? hit.title : autoTitle(question);
        return [{ ...hit, title: titled, updated: 'Just now' }, ...cs.filter((c) => c.id !== convId)];
      });
    }
    const userMsg = {
      id: nextId('u'),
      role: 'user',
      kind: 'question',
      time: '10:0' + (idRef.current % 10),
      content: question
    };
    const built = buildAnswer(question);
    setMessagesByConv((m) => ({ ...m, [convId]: [...(m[convId] || []), userMsg, built.msg] }));
    setStream({ convId, msgId: built.msg.id, pos: 0, len: built.len });
    setDraft('');
  };

  const retry = (convId, errorMsgId, question) => {
    if (stream) return;
    const built = buildAnswer(question);
    setMessagesByConv((m) => ({
      ...m,
      [convId]: (m[convId] || []).map((msg) => (msg.id === errorMsgId ? built.msg : msg))
    }));
    setStream({ convId, msgId: built.msg.id, pos: 0, len: built.len });
    touch(convId);
  };

  const startRename = (c) => {
    setRenamingId(c.id);
    setRenameDraft(c.title);
    setRenameError('');
  };

  const saveRename = (id) => {
    if (!renameDraft.trim()) {
      setRenameError('A chat needs a name — the previous title has been kept.');
      return;
    }
    setConversations((cs) => cs.map((c) => (c.id === id ? { ...c, title: renameDraft.trim(), title_locked: true } : c)));
    setRenamingId(null);
    setRenameError('');
  };

  const doDelete = () => {
    const id = confirmId;
    setConversations((cs) => cs.filter((c) => c.id !== id));
    setMessagesByConv((m) => {
      const copy = { ...m };
      delete copy[id];
      return copy;
    });
    if (activeId === id) setActiveId('new');
    setConfirmId(null);
  };

  const filtered = conversations.filter((c) => c.title.toLowerCase().includes(query.trim().toLowerCase()));
  const pendingConv = confirmId ? conversations.find((c) => c.id === confirmId) : null;

  const focusRing = 'focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';

  const renderMessage = (msg) => {
    const isStreaming = stream && stream.msgId === msg.id;
    const shown = isStreaming ? msg.content.slice(0, stream.pos) : msg.content;

    if (msg.role === 'user') {
      return (
        <li key={msg.id} className="msg-in flex flex-col items-end">
          <p className="mb-1 text-xs" style={{ color: MUTED, fontVariantNumeric: 'tabular-nums' }}>
            You · {msg.time}
          </p>
          <div
            className="max-w-[88%] px-4 py-3 text-[15px] leading-relaxed sm:max-w-[75%]"
            style={{
              backgroundColor: rgba(brand.primaryColor, 0.07),
              border: `1px solid ${rgba(brand.primaryColor, 0.16)}`,
              borderRadius: R,
              color: TEXT
            }}
          >
            {msg.content}
          </div>
        </li>
      );
    }

    if (msg.kind === 'error') {
      return (
        <li key={msg.id} className="msg-in">
          <p className="mb-1 text-xs" style={{ color: MUTED, fontVariantNumeric: 'tabular-nums' }}>
            Assistant · {msg.time}
          </p>
          <div
            className="max-w-[92%] p-4"
            style={{ backgroundColor: '#FFFFFF', border: `1px solid ${rgba(brand.neutralColor, 0.35)}`, borderRadius: R }}
          >
            <div className="flex items-start gap-3">
              <span style={{ color: darken(brand.neutralColor, 0.3) }} aria-hidden="true">
                <Icons.AlertCircle className="mt-0.5 h-5 w-5" />
              </span>
              <div>
                <h3 className="text-sm font-semibold" style={{ color: TEXT, fontFamily: brand.fontHeading }}>
                  The assistant is temporarily unavailable
                </h3>
                <p className="mt-1 text-sm leading-relaxed" style={{ color: MUTED }}>
                  Gemini didn&apos;t respond in time, so nothing was saved for this turn. Your question is still here — ask it
                  again and we&apos;ll run the same retrieval.
                </p>
                <button
                  type="button"
                  onClick={() => retry(activeId, msg.id, msg.question)}
                  className={`mt-3 inline-flex items-center gap-2 px-3 py-2 text-sm font-medium ${focusRing}`}
                  style={{
                    borderRadius: R,
                    border: `1px solid ${rgba(brand.primaryColor, 0.4)}`,
                    color: brand.primaryColor,
                    outlineColor: brand.primaryColor,
                    backgroundColor: rgba(brand.primaryColor, 0.06)
                  }}
                >
                  <Icons.ArrowRight className="h-4 w-4" aria-hidden="true" />
                  Ask this question again
                </button>
              </div>
            </div>
          </div>
        </li>
      );
    }

    const isNotFound = msg.kind === 'notfound';
    const cites = msg.citations || [];

    return (
      <li key={msg.id} className="msg-in">
        <p className="mb-1 flex flex-wrap items-center gap-x-2 text-xs" style={{ color: MUTED, fontVariantNumeric: 'tabular-nums' }}>
          <span>Assistant · {msg.time}</span>
          {!isStreaming && !isNotFound && cites.length > 0 ? (
            <span style={{ color: darken(brand.accentColor, 0.35) }}>{cites.length} citations</span>
          ) : null}
          {!isStreaming && isNotFound ? <span>no citations — nothing met the relevance threshold</span> : null}
          {isStreaming ? <span>streaming from Gemini…</span> : null}
        </p>
        <div
          className="max-w-[92%] px-4 py-4"
          style={{
            backgroundColor: '#FFFFFF',
            border: `1px solid ${isNotFound ? rgba(brand.neutralColor, 0.3) : LINE}`,
            borderRadius: R,
            borderLeft: isNotFound ? `3px solid ${rgba(brand.neutralColor, 0.6)}` : `3px solid ${brand.accentColor}`
          }}
        >
          <div className="text-[15px] leading-relaxed" style={{ color: TEXT }}>
            {parseContent(shown).map((part, i) => {
              if (part.t === 'text') {
                return part.v.split('\n\n').map((para, j, arr) => (
                  <React.Fragment key={`${i}-${j}`}>
                    <span>{para}</span>
                    {j < arr.length - 1 ? <span className="block h-3" /> : null}
                  </React.Fragment>
                ));
              }
              const cite = cites.find((c) => c.n === part.n);
              if (!cite) return null;
              const key = `${msg.id}:${cite.n}`;
              const open = openCite === key;
              return (
                <button
                  key={`${i}-c`}
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenCite(open ? null : key)}
                  className={`mx-1 inline-flex items-baseline gap-1 px-1.5 py-0.5 align-baseline text-[12px] font-medium ${focusRing}`}
                  style={{
                    borderRadius: '0.25rem',
                    backgroundColor: open ? rgba(brand.accentColor, 0.2) : rgba(brand.accentColor, 0.12),
                    border: `1px solid ${rgba(brand.accentColor, 0.45)}`,
                    color: darken(brand.accentColor, 0.4),
                    outlineColor: brand.primaryColor,
                    fontVariantNumeric: 'tabular-nums'
                  }}
                >
                  {cite.document.replace(/\.(pdf|docx|md|txt)$/i, '')}, p.{cite.page}
                </button>
              );
            })}
            {isStreaming ? (
              <span
                className="caret ml-0.5 inline-block h-4 w-[2px] align-text-bottom"
                style={{ backgroundColor: brand.primaryColor }}
                aria-hidden="true"
              />
            ) : null}
          </div>

          {!isStreaming && openCite && openCite.startsWith(`${msg.id}:`) ? (
            (() => {
              const n = Number(openCite.split(':')[1]);
              const c = cites.find((x) => x.n === n);
              if (!c) return null;
              return (
                <div
                  className="cite-in mt-4 p-3"
                  style={{ backgroundColor: rgba(brand.accentColor, 0.07), borderRadius: R, borderLeft: `3px solid ${brand.accentColor}` }}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: darken(brand.accentColor, 0.4) }}>
                    Source passage
                  </p>
                  <blockquote className="mt-2 text-sm italic leading-relaxed" style={{ color: TEXT }}>
                    “{c.quoted_passage}”
                  </blockquote>
                  <p className="mt-2 text-xs" style={{ color: MUTED, fontVariantNumeric: 'tabular-nums' }}>
                    {c.document} · page {c.page}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => navigate('documents')}
                      className={`text-xs font-medium underline underline-offset-2 ${focusRing}`}
                      style={{ color: brand.primaryColor, outlineColor: brand.primaryColor }}
                    >
                      Open in document library
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpenCite(null)}
                      className={`text-xs font-medium underline underline-offset-2 ${focusRing}`}
                      style={{ color: MUTED, outlineColor: brand.primaryColor }}
                    >
                      Hide passage
                    </button>
                  </div>
                </div>
              );
            })()
          ) : null}
        </div>
      </li>
    );
  };

  return (
    <div style={{ fontFamily: brand.fontBody, color: TEXT }}>
      <style>{`
        @keyframes ragMsgIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        @keyframes ragCaret { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        @keyframes ragPanelIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
        .msg-in { animation: ragMsgIn .24s ease-out both; }
        .cite-in { animation: ragPanelIn .2s ease-out both; }
        .caret { animation: ragCaret 1s steps(1) infinite; }
        .row-hover { transition: background-color .15s ease, border-color .15s ease; }
        @media (prefers-reduced-motion: reduce) {
          .msg-in, .cite-in, .caret { animation: none !important; }
          .row-hover { transition: none; }
        }
      `}</style>

      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl" style={{ fontFamily: brand.fontHeading, color: TEXT }}>
          Chat
        </h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed" style={{ color: MUTED }}>
          Ask a question and the answer is built only from documents you uploaded. Every claim carries a citation you can open.
        </p>
      </header>

      <div
        className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
        style={{ backgroundColor: '#FFFFFF', border: `1px solid ${LINE}`, borderRadius: R }}
      >
        <span
          className="inline-flex items-center gap-2 px-2.5 py-1 text-sm font-medium"
          style={{ backgroundColor: rgba(brand.accentColor, 0.12), borderRadius: '999px', color: darken(brand.accentColor, 0.42) }}
        >
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: brand.accentColor }} aria-hidden="true" />
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{READY_DOCS} documents ready</span>
        </span>
        <span className="text-sm" style={{ color: MUTED, fontVariantNumeric: 'tabular-nums' }}>
          {PROCESSING_DOCS} still processing — their content isn&apos;t searchable yet
        </span>
        <button
          type="button"
          onClick={() => navigate('documents')}
          className={`ml-auto text-sm font-medium underline underline-offset-2 ${focusRing}`}
          style={{ color: brand.primaryColor, outlineColor: brand.primaryColor }}
        >
          Manage documents
        </button>
      </div>

      <div className="mb-4 md:hidden">
        <button
          type="button"
          onClick={() => setSidebarOpen((v) => !v)}
          aria-expanded={sidebarOpen}
          className={`inline-flex w-full items-center justify-between px-4 py-3 text-sm font-medium ${focusRing}`}
          style={{ backgroundColor: '#FFFFFF', border: `1px solid ${LINE}`, borderRadius: R, color: TEXT, outlineColor: brand.primaryColor }}
        >
          <span className="inline-flex items-center gap-2">
            <Icons.Menu className="h-4 w-4" aria-hidden="true" />
            Your chats
            <span style={{ color: MUTED, fontVariantNumeric: 'tabular-nums' }}>({conversations.length})</span>
          </span>
          {sidebarOpen ? <Icons.ChevronDown className="h-4 w-4" aria-hidden="true" /> : <Icons.ChevronRight className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-[286px_minmax(0,1fr)]">
        {/* Sidebar */}
        <aside
          className={`${sidebarOpen ? 'block' : 'hidden'} md:block`}
          style={{ backgroundColor: '#FFFFFF', border: `1px solid ${LINE}`, borderRadius: R }}
          aria-label="Saved conversations"
        >
          <div className="p-4">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ fontFamily: brand.fontHeading, color: TEXT }}>
                Your chats
              </h2>
              <span className="text-xs" style={{ color: MUTED, fontVariantNumeric: 'tabular-nums' }}>
                {conversations.length}
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                setActiveId('new');
                setOpenCite(null);
                setSidebarOpen(false);
                if (composerRef.current) composerRef.current.focus();
              }}
              className={`mt-3 inline-flex w-full items-center justify-center gap-2 px-3 py-2.5 text-sm font-semibold text-white ${focusRing}`}
              style={{ backgroundColor: brand.primaryColor, borderRadius: R, outlineColor: brand.primaryColor }}
            >
              <Icons.Plus className="h-4 w-4" aria-hidden="true" />
              New chat
            </button>

            <div className="mt-4">
              <Label htmlFor="chat-search" className="text-xs font-medium" style={{ color: MUTED }}>
                Find a chat
              </Label>
              <div className="relative mt-1">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: MUTED }} aria-hidden="true">
                  <Icons.Search className="h-4 w-4" />
                </span>
                <input
                  id="chat-search"
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="lease, revenue…"
                  className={`w-full py-2 pl-9 pr-3 text-sm ${focusRing}`}
                  style={{ border: `1px solid ${LINE}`, borderRadius: R, color: TEXT, outlineColor: brand.primaryColor, backgroundColor: brand.backgroundColor }}
                />
              </div>
            </div>
          </div>

          <Separator />

          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center">
              {conversations.length === 0 ? (
                <>
                  <h3 className="text-sm font-semibold" style={{ color: TEXT, fontFamily: brand.fontHeading }}>
                    No saved chats yet
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed" style={{ color: MUTED }}>
                    Ask your first question and we&apos;ll save the conversation here, named after what you asked.
                  </p>
                </>
              ) : (
                <>
                  <h3 className="text-sm font-semibold" style={{ color: TEXT, fontFamily: brand.fontHeading }}>
                    Nothing matches “{query.trim()}”
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed" style={{ color: MUTED }}>
                    Chat titles come from your first question. Try a word you would have used.
                  </p>
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className={`mt-3 text-sm font-medium underline underline-offset-2 ${focusRing}`}
                    style={{ color: brand.primaryColor, outlineColor: brand.primaryColor }}
                  >
                    Clear search
                  </button>
                </>
              )}
            </div>
          ) : (
            <ul className="max-h-[420px] overflow-y-auto p-2 md:max-h-[52vh]">
              {filtered.map((c) => {
                const active = c.id === activeId;
                const renaming = renamingId === c.id;
                return (
                  <li key={c.id} className="mb-1">
                    {renaming ? (
                      <div className="p-2" style={{ backgroundColor: rgba(brand.primaryColor, 0.05), borderRadius: R }}>
                        <Label htmlFor={`rename-${c.id}`} className="text-xs font-medium" style={{ color: MUTED }}>
                          Chat title
                        </Label>
                        <input
                          id={`rename-${c.id}`}
                          value={renameDraft}
                          onChange={(e) => {
                            setRenameDraft(e.target.value);
                            setRenameError('');
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              saveRename(c.id);
                            }
                            if (e.key === 'Escape') setRenamingId(null);
                          }}
                          className={`mt-1 w-full px-2 py-1.5 text-sm ${focusRing}`}
                          style={{ border: `1px solid ${LINE}`, borderRadius: R, color: TEXT, outlineColor: brand.primaryColor, backgroundColor: '#FFFFFF' }}
                        />
                        {renameError ? (
                          <p className="mt-1 text-xs" style={{ color: darken(brand.neutralColor, 0.25) }} role="alert">
                            {renameError}
                          </p>
                        ) : null}
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() => saveRename(c.id)}
                            className={`px-2.5 py-1.5 text-xs font-semibold text-white ${focusRing}`}
                            style={{ backgroundColor: brand.primaryColor, borderRadius: R, outlineColor: brand.primaryColor }}
                          >
                            Save title
                          </button>
                          <button
                            type="button"
                            onClick={() => setRenamingId(null)}
                            className={`px-2.5 py-1.5 text-xs font-medium ${focusRing}`}
                            style={{ border: `1px solid ${LINE}`, borderRadius: R, color: MUTED, outlineColor: brand.primaryColor }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="row-hover flex items-start gap-1 p-1"
                        style={{
                          borderRadius: R,
                          backgroundColor: active ? rgba(brand.primaryColor, 0.08) : 'transparent',
                          borderLeft: active ? `3px solid ${brand.primaryColor}` : '3px solid transparent'
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setActiveId(c.id);
                            setOpenCite(null);
                            setSidebarOpen(false);
                          }}
                          aria-current={active ? 'true' : undefined}
                          className={`min-w-0 flex-1 px-2 py-2 text-left ${focusRing}`}
                          style={{ borderRadius: R, outlineColor: brand.primaryColor }}
                        >
                          <span className="block truncate text-sm font-medium" style={{ color: active ? brand.primaryColor : TEXT }}>
                            {c.title}
                          </span>
                          <span className="mt-0.5 block text-xs" style={{ color: MUTED, fontVariantNumeric: 'tabular-nums' }}>
                            {c.updated}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => startRename(c)}
                          aria-label={`Rename chat: ${c.title}`}
                          className={`mt-1 p-1.5 ${focusRing}`}
                          style={{ borderRadius: '0.375rem', color: MUTED, outlineColor: brand.primaryColor }}
                        >
                          <Icons.Edit className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmId(c.id)}
                          aria-label={`Delete chat: ${c.title}`}
                          className={`mt-1 p-1.5 ${focusRing}`}
                          style={{ borderRadius: '0.375rem', color: MUTED, outlineColor: brand.primaryColor }}
                        >
                          <Icons.Trash className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <Separator />
          <p className="px-4 py-3 text-xs leading-relaxed" style={{ color: MUTED }}>
            Chats and documents are private to your account. Nobody else can open them.
          </p>
        </aside>

        {/* Thread */}
        <section
          className="flex min-h-[560px] flex-col"
          style={{ backgroundColor: brand.backgroundColor, border: `1px solid ${LINE}`, borderRadius: R, height: '74vh' }}
          aria-label="Conversation"
        >
          <div className="flex items-center justify-between gap-3 px-5 py-4" style={{ borderBottom: `1px solid ${LINE}`, backgroundColor: '#FFFFFF', borderTopLeftRadius: R, borderTopRightRadius: R }}>
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold" style={{ fontFamily: brand.fontHeading, color: TEXT }}>
                {activeId === 'new' ? 'New chat' : activeConv ? activeConv.title : 'New chat'}
              </h2>
              <p className="mt-0.5 text-xs" style={{ color: MUTED, fontVariantNumeric: 'tabular-nums' }}>
                {activeId === 'new'
                  ? 'Named automatically from your first question'
                  : `${messages.length} messages · searching ${READY_DOCS} ready documents`}
              </p>
            </div>
            {activeConv ? (
              <button
                type="button"
                onClick={() => startRename(activeConv)}
                className={`shrink-0 px-3 py-2 text-sm font-medium ${focusRing}`}
                style={{ border: `1px solid ${LINE}`, borderRadius: R, color: MUTED, outlineColor: brand.primaryColor }}
              >
                Rename
              </button>
            ) : null}
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
            {messages.length === 0 ? (
              <div className="mx-auto max-w-xl py-10 text-center">
                <span
                  className="inline-flex h-12 w-12 items-center justify-center"
                  style={{ backgroundColor: rgba(brand.primaryColor, 0.1), borderRadius: '999px', color: brand.primaryColor }}
                  aria-hidden="true"
                >
                  <Icons.FileText className="h-6 w-6" />
                </span>
                <h3 className="mt-4 text-xl font-semibold" style={{ fontFamily: brand.fontHeading, color: TEXT }}>
                  Ask your first question
                </h3>
                <p className="mt-2 text-[15px] leading-relaxed" style={{ color: MUTED }}>
                  We search all {READY_DOCS} of your ready documents, quote what we find and tell you plainly when the answer
                  isn&apos;t in there.
                </p>
                <ul className="mt-6 space-y-2 text-left">
                  {SUGGESTIONS.map((s) => (
                    <li key={s}>
                      <button
                        type="button"
                        onClick={() => {
                          setDraft(s);
                          if (composerRef.current) composerRef.current.focus();
                        }}
                        className={`row-hover flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm ${focusRing}`}
                        style={{ backgroundColor: '#FFFFFF', border: `1px solid ${LINE}`, borderRadius: R, color: TEXT, outlineColor: brand.primaryColor }}
                      >
                        {s}
                        <Icons.ArrowRight className="h-4 w-4 shrink-0" style={{ color: brand.primaryColor }} aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => navigate('getting-started')}
                  className={`mt-6 text-sm font-medium underline underline-offset-2 ${focusRing}`}
                  style={{ color: brand.primaryColor, outlineColor: brand.primaryColor }}
                >
                  Read getting started
                </button>
              </div>
            ) : (
              <ol className="space-y-6">{messages.map(renderMessage)}</ol>
            )}
          </div>

          <div className="px-4 pb-5 pt-4 sm:px-6" style={{ borderTop: `1px solid ${LINE}`, backgroundColor: '#FFFFFF', borderBottomLeftRadius: R, borderBottomRightRadius: R }}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
            >
              <Label htmlFor="question" className="text-sm font-medium" style={{ color: TEXT }}>
                Ask a question about your documents
              </Label>
              <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end">
                <textarea
                  id="question"
                  ref={composerRef}
                  rows={2}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder="e.g. What notice do we have to give on the Ardent lease?"
                  className={`min-h-[60px] flex-1 resize-none px-3 py-3 text-[15px] leading-relaxed ${focusRing}`}
                  style={{ border: `1px solid ${LINE}`, borderRadius: R, color: TEXT, outlineColor: brand.primaryColor, backgroundColor: brand.backgroundColor }}
                />
                <button
                  type="submit"
                  disabled={!draft.trim() || !!stream}
                  className={`inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-white ${focusRing}`}
                  style={{
                    backgroundColor: !draft.trim() || stream ? rgba(brand.primaryColor, 0.45) : brand.primaryColor,
                    borderRadius: R,
                    outlineColor: brand.primaryColor,
                    cursor: !draft.trim() || stream ? 'not-allowed' : 'pointer'
                  }}
                >
                  {stream ? 'Answering…' : 'Ask'}
                  {!stream ? <Icons.ArrowRight className="h-4 w-4" aria-hidden="true" /> : null}
                </button>
              </div>
              <p className="mt-2 text-xs leading-relaxed" style={{ color: MUTED }}>
                Answers come only from your own uploaded documents. Enter sends, Shift + Enter adds a line.
              </p>
            </form>
          </div>
        </section>
      </div>

      {pendingConv ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: rgba(darken(brand.neutralColor, 0.7), 0.5) }}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
            className="w-full max-w-md p-6"
            style={{ backgroundColor: '#FFFFFF', borderRadius: R, border: `1px solid ${LINE}` }}
          >
            <h2 id="delete-title" className="text-lg font-semibold" style={{ fontFamily: brand.fontHeading, color: TEXT }}>
              Delete “{pendingConv.title}”?
            </h2>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: MUTED }}>
              This removes the conversation and all of its messages for good. The documents it cited stay in your library.
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                ref={cancelRef}
                onClick={() => setConfirmId(null)}
                className={`px-4 py-2.5 text-sm font-medium ${focusRing}`}
                style={{ border: `1px solid ${LINE}`, borderRadius: R, color: TEXT, outlineColor: brand.primaryColor }}
              >
                Keep chat
              </button>
              <button
                type="button"
                onClick={doDelete}
                className={`px-4 py-2.5 text-sm font-semibold text-white ${focusRing}`}
                style={{ backgroundColor: darken(brand.neutralColor, 0.35), borderRadius: R, outlineColor: brand.primaryColor }}
              >
                Delete permanently
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
