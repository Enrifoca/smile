/**
 * Builds docs/mirai-memory-and-agent-loop-flow.pdf from the same content as
 * ~/.cursor/projects/.../canvases/mirai-memory-agent-loop.canvas.tsx
 *
 * Uses a short-lived temp HTML file (not stored in the repo), then Chrome headless.
 * Run: node scripts/generate-mirai-memory-and-agent-loop-flow-pdf.mjs
 */

import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_PDF = path.join(ROOT, "docs", "mirai-memory-and-agent-loop-flow.pdf");

const CHROME_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
];

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function flowNode({ title, body, meta, tone = "neutral" }) {
  const t = esc(title);
  const b = esc(body);
  const m = meta != null ? `<p class="meta">${esc(meta)}</p>` : "";
  return `<div class="node tone-${tone}"><div><p class="nt">${t}</p><p class="nb">${b}</p></div>${m}</div>`;
}

function connector(label) {
  const lab = label
    ? `<span class="clab">${esc(label)}</span>`
    : "";
  return `<div class="conn">${lab}<div class="ctrack"><span class="cline"></span><span class="carr"></span></div></div>`;
}

function decisionNode({ title, yes, no }) {
  return `<div class="dec"><p class="dt">${esc(title)}</p><div class="drow"><span class="py">${esc(
    yes,
  )}</span><span class="pn">${esc(no)}</span></div></div>`;
}

function flowGrid(cells) {
  return `<div class="flow-grid">${cells.join("")}</div>`;
}

function card(header, inner) {
  return `<div class="card"><div class="ch">${esc(header)}</div><div class="cb">${inner}</div></div>`;
}

function docHtml() {
  const heroTitle = "Mirai Memory and Agent Loop Flow";
  const heroBody =
    "Two end-to-end flows: how context is assembled into each model call, and how the agent loops through tools, approval pauses, and final answers.";

  const flow1a = flowGrid([
    flowNode({
      title: "User Send",
      body:
        "ChatView receives input, resets memory_update count, attachments, loading state.",
      meta: "ChatView.tsx",
      tone: "info",
    }),
    connector(),
    flowNode({
      title: "Start Turn",
      body:
        "Agent.processMessage() resets abort flag, tool cache, scratchpad, and nudge flags.",
      meta: "Agent",
    }),
    connector(),
    flowNode({
      title: "Refresh Memory",
      body:
        "Before each model call, loadMemoryForAgent() calls memoryAPI.getAll().",
      meta: ".mirai/memories",
      tone: "warning",
    }),
    connector(),
    flowNode({
      title: "Build Prompt",
      body:
        "getSystemPrompt() combines user profile, Jira metadata, and formatted memory.",
      meta: "getSystemPrompt()",
      tone: "success",
    }),
  ]);

  const flow1b = flowGrid([
    flowNode({
      title: "Memory Files",
      body:
        "user.md has authority. learned.md and issue examples are lower-priority hints.",
      meta: "MemoryService",
    }),
    connector("loaded by"),
    flowNode({
      title: "MemoryStore",
      body: "formatMemoryForPrompt() creates the always-loaded memory block.",
      meta: "Priority encoded here",
      tone: "warning",
    }),
    connector("merged into"),
    flowNode({
      title: "System Prompt",
      body:
        "Memory, Jira environment knowledge, and user context become the leading model instruction.",
      meta: "prompts.ts",
      tone: "success",
    }),
    connector("plus"),
    flowNode({
      title: "Model Messages",
      body:
        "The model receives system prompt plus the recent conversation window.",
      meta: "tool_summary filtered",
      tone: "info",
    }),
  ]);

  const flow1c = flowGrid([
    flowNode({
      title: "Chat History",
      body:
        "Stored chatHistory reloads into Agent.conversationHistory when a chat opens.",
      meta: "storage",
    }),
    connector("windowed as"),
    flowNode({
      title: "Recent Context",
      body:
        "Last 40 model-visible messages, chronological, excluding UI-only summaries.",
      meta: "conversationHistory",
    }),
    connector("augmented by"),
    flowNode({
      title: "Scratchpad",
      body:
        "Per-turn notes survive context eviction and prevent repeat reads/searches.",
      meta: "sessionScratchpad",
      tone: "warning",
    }),
    connector("sent to"),
    flowNode({
      title: "AI Call",
      body: "callAI() sends the assembled context to reasoning or main model.",
      meta: "callAI()",
      tone: "success",
    }),
  ]);

  const writeBack = card(
    "Write-Back Flow",
    flowGrid([
      flowNode({
        title: "memory_update / delete",
        body: "Agent requests memory changes through tools.",
        meta: "one update per turn",
        tone: "info",
      }),
      connector(),
      flowNode({
        title: "executeMemoryTool()",
        body: "ChatView validates and calls memoryAPI methods.",
        meta: "renderer guard",
      }),
      connector(),
      flowNode({
        title: "MemoryService.save",
        body: "Markdown files are rewritten and cache updates.",
        meta: "electron service",
      }),
      connector(),
      flowNode({
        title: "Next AI Call",
        body:
          "loadMemory refreshes, so the saved note enters future prompts.",
        meta: "loop back",
        tone: "success",
      }),
    ]),
  );

  const flow2a = flowGrid([
    flowNode({
      title: "runAgentLoop()",
      body:
        "Iteration starts unless abortFlag is set or maxIterations is reached.",
      meta: "default cap: 10",
      tone: "info",
    }),
    connector(),
    flowNode({
      title: "callAI()",
      body:
        "Refreshes memory, appends scratchpad, sends message window, streams response.",
      meta: "reasoning or main model",
    }),
    connector(),
    decisionNode({
      title: "Tool calls returned?",
      yes: "yes: inspect tools",
      no: "no: finalize",
    }),
    connector("no"),
    flowNode({
      title: "Final Answer",
      body:
        "Action-first and think-only guards may nudge once; otherwise response is saved.",
      meta: "assistant message",
      tone: "success",
    }),
  ]);

  const flow2b = flowGrid([
    decisionNode({
      title: "Requires confirmation?",
      yes: "yes: pause",
      no: "no: execute",
    }),
    connector("no"),
    flowNode({
      title: "Execute Tool",
      body: "Jira, file, memory, or scratchpad tool runs immediately.",
      meta: "executeTool()",
      tone: "info",
    }),
    connector(),
    flowNode({
      title: "Record Result",
      body:
        "Tool result enters history as [tool_result: name]; summary goes to UI only.",
      meta: "tool_summary filtered",
    }),
    connector("loop"),
    flowNode({
      title: "Next Iteration",
      body:
        "The model sees the result and decides whether to call more tools or answer.",
      meta: "back to callAI()",
      tone: "success",
    }),
  ]);

  const flow2c = flowGrid([
    flowNode({
      title: "PendingAction",
      body:
        "Confirmed Jira writes and attachments pause the loop for user approval.",
      meta: "onPendingAction()",
      tone: "warning",
    }),
    connector("approve"),
    flowNode({
      title: "approveAction()",
      body:
        "Runs the deferred tool or batch, then pushes the tool result.",
      meta: "resume point",
      tone: "info",
    }),
    connector(),
    flowNode({
      title: "Scratchpad / Cache",
      body:
        "Writes invalidate cache; useful actions append scratchpad notes.",
      meta: "same turn memory",
    }),
    connector("resume"),
    flowNode({
      title: "runAgentLoop()",
      body:
        "The loop resumes after approval and lets the model continue.",
      meta: "not a new user turn",
      tone: "success",
    }),
  ]);

  const exitCard = card(
    "Loop Exit Paths",
    `<ul class="bullets">
<li>Final assistant response when no tool call remains.</li>
<li>Pause on <code>PendingAction</code> until approve or reject.</li>
<li>Abort boundary via <code>abortFlag</code>.</li>
<li>Iteration-limit message when max loop count is reached.</li>
</ul>`,
  );

  const feedbackCard = card(
    "Context Feedback Loop",
    `<ul class="bullets">
<li>Tool results become future model context.</li>
<li>Scratchpad notes preserve what happened this turn.</li>
<li>Memory updates persist beyond the current chat.</li>
<li>UI summaries remain visible to the user but hidden from the model.</li>
</ul>`,
  );

  const pills = [
    "Memory files: .mirai/memories/user.md, learned.md, issue-types/*.md",
    "Memory service: electron/services/memory.ts",
    "Prompt assembly: src/types/memory.ts + src/agent/prompts.ts",
    "Agent loop: src/agent/index.ts",
    "Renderer wiring: src/components/ChatView.tsx",
    "Tool definitions: src/agent/tools.ts",
  ]
    .map((p) => `<span class="pill">${esc(p)}</span>`)
    .join("");

  const sourceCard = card(
    "Source Map",
    `<div class="pill-wrap">${pills}</div>`,
  );

  const css = `
    @page { size: A4 landscape; margin: 12mm; }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 9.5pt;
      color: #171717;
      margin: 0;
      padding: 8px 10px 20px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    h1 { font-size: 18pt; font-weight: 700; margin: 0 0 6px; letter-spacing: -0.02em; }
    .lead { color: #525252; margin: 0 0 10px; max-width: 900px; line-height: 1.45; }
    .tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
    .tag { font-size: 8.5pt; padding: 3px 9px; border-radius: 999px; border: 1px solid #d4d4d8; background: #fafafa; }
    .tag-i { border-color: #93c5fd; background: #eff6ff; }
    .tag-w { border-color: #fcd34d; background: #fffbeb; }
    .tag-s { border-color: #86efac; background: #f0fdf4; }
    hr { border: none; border-top: 1px solid #e5e5e5; margin: 14px 0; }
    h2 { font-size: 12pt; font-weight: 600; margin: 0 0 10px; padding-bottom: 4px; border-bottom: 1px solid #d4d4d8; }
    .stack { display: flex; flex-direction: column; gap: 12px; margin-bottom: 12px; }
    .flow-grid {
      display: grid;
      grid-template-columns: minmax(0,1fr) 44px minmax(0,1fr) 44px minmax(0,1fr) 44px minmax(0,1fr);
      gap: 6px;
      align-items: stretch;
    }
    .node {
      min-height: 96px;
      border: 1px solid #d4d4d8;
      border-radius: 8px;
      padding: 10px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      background: #f4f4f5;
    }
    .tone-info { border-left: 3px solid #2563eb; }
    .tone-success { border-left: 3px solid #16a34a; }
    .tone-warning { border-left: 3px solid #737373; }
    .tone-neutral { border-left: 3px solid #d4d4d8; }
    .nt { font-weight: 600; margin: 0 0 5px; font-size: 9.5pt; }
    .nb { margin: 0; color: #404040; font-size: 8.5pt; line-height: 1.35; }
    .meta { margin: 8px 0 0; font-size: 8pt; color: #737373; font-style: italic; }
    .conn {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 96px;
    }
    .clab { font-size: 7.5pt; color: #737373; text-align: center; margin-bottom: 3px; line-height: 1.2; }
    .ctrack { display: flex; align-items: center; width: 100%; }
    .cline { flex: 1; height: 1px; background: #a3a3a3; }
    .carr {
      width: 0; height: 0;
      border-top: 5px solid transparent;
      border-bottom: 5px solid transparent;
      border-left: 6px solid #a3a3a3;
    }
    .dec {
      min-height: 96px;
      border: 1px solid #a3a3a3;
      border-radius: 8px;
      padding: 10px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      background: #fafafa;
    }
    .dt { font-weight: 600; margin: 0 0 6px; font-size: 9.5pt; }
    .drow { display: flex; justify-content: space-between; gap: 6px; flex-wrap: wrap; }
    .py { font-size: 8pt; padding: 2px 7px; border-radius: 999px; border: 1px solid #86efac; background: #f0fdf4; color: #14532d; }
    .pn { font-size: 8pt; padding: 2px 7px; border-radius: 999px; border: 1px solid #fcd34d; background: #fffbeb; color: #78350f; }
    .card { border: 1px solid #d4d4d8; border-radius: 8px; overflow: hidden; margin-top: 4px; break-inside: avoid; }
    .ch { font-weight: 600; font-size: 10pt; padding: 8px 12px; background: #fafafa; border-bottom: 1px solid #e5e5e5; }
    .cb { padding: 10px 12px; }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .bullets { margin: 0; padding-left: 1.1em; }
    .bullets li { margin: 4px 0; font-size: 9pt; color: #404040; }
    code { font-family: ui-monospace, Menlo, monospace; font-size: 8.5pt; background: #f5f5f5; padding: 1px 3px; border-radius: 3px; }
    .pill-wrap { display: flex; flex-wrap: wrap; gap: 6px; }
    .pill { font-size: 8pt; padding: 4px 8px; border: 1px solid #e5e5e5; border-radius: 999px; background: #fafafa; color: #262626; }
    .note { font-size: 8pt; color: #737373; margin-top: 16px; }
    @media print { .flow-grid { break-inside: avoid; } }
  `;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${esc(heroTitle)}</title>
<style>${css}</style>
</head>
<body>
  <h1>${esc(heroTitle)}</h1>
  <p class="lead">${esc(heroBody)}</p>
  <div class="tags">
    <span class="tag tag-i">context assembly</span>
    <span class="tag tag-w">approval branch</span>
    <span class="tag tag-s">loop-back paths</span>
  </div>
  <hr/>
  <section class="stack">
    <h2>Flow 1: Context Assembly</h2>
    ${flow1a}
    ${flow1b}
    ${flow1c}
    ${writeBack}
  </section>
  <hr/>
  <section class="stack">
    <h2>Flow 2: Agent Loop</h2>
    ${flow2a}
    ${flow2b}
    ${flow2c}
    <div class="two">${exitCard}${feedbackCard}</div>
  </section>
  <hr/>
  ${sourceCard}
  <p class="note">Derived from Cursor canvas mirai-memory-agent-loop.canvas.tsx — PDF generated without a repo HTML file.</p>
</body>
</html>`;
}

function findChrome() {
  for (const p of CHROME_CANDIDATES) {
    try {
      fs.accessSync(p, fs.constants.X_OK);
      return p;
    } catch {
      /* continue */
    }
  }
  return null;
}

function main() {
  const chrome = findChrome();
  if (!chrome) {
    console.error(
      "Chrome or Chromium not found. Install Google Chrome or set CHROME_PATH.",
    );
    process.exit(1);
  }

  const html = docHtml();
  const tmp = path.join(
    os.tmpdir(),
    `mirai-memory-canvas-${process.pid}-${Date.now()}.html`,
  );
  fs.mkdirSync(path.dirname(OUT_PDF), { recursive: true });
  fs.writeFileSync(tmp, html, "utf8");

  const fileUrl = `file://${tmp}`;
  const r = spawnSync(
    chrome,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-pdf-header-footer",
      `--print-to-pdf=${OUT_PDF}`,
      fileUrl,
    ],
    { stdio: "inherit" },
  );

  try {
    fs.unlinkSync(tmp);
  } catch {
    /* ignore */
  }

  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }

  console.log(OUT_PDF);
}

main();
