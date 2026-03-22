import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const readmePath = path.join(repoRoot, "README.md");
const outputDir = path.join(repoRoot, ".tests");
const outputPath = path.join(outputDir, "readme-toc-preview.html");

const tocEntries = [
  ["system-overview", "系统说明"],
  ["system-architecture", "系统架构"],
  ["data-storage", "数据存储"],
  ["project-structure", "目录结构"],
  ["quick-start", "快速启动"],
  ["scheduled-jobs", "定时任务"],
  ["environments", "环境"],
  ["news-pipeline", "新闻采集与过滤流程"],
  ["core-fields", "核心字段说明"],
  ["keywords-and-aliases", "关键词与标的别名"],
  ["review-workflow", "复盘工作流"],
  ["testing", "测试"],
  ["docs", "文档"],
];

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderInline(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

const headingIdByLabel = Object.fromEntries(
  tocEntries.map(([id, label]) => [label, id]),
);

function renderMarkdown(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.startsWith("```")) {
      const codeLines = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }
      index += 1;
      blocks.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const headingText = headingMatch[2].trim();
      const headingId = level === 2 ? headingIdByLabel[headingText] : "";
      const attrs = headingId
        ? ` id="${headingId}" class="anchored-heading"`
        : "";
      blocks.push(`<h${level}${attrs}>${renderInline(headingText)}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^-\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^-\s+/.test(lines[index])) {
        items.push(`<li>${renderInline(lines[index].replace(/^-\s+/, ""))}</li>`);
        index += 1;
      }
      blocks.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index])) {
        items.push(`<li>${renderInline(lines[index].replace(/^\d+\.\s+/, ""))}</li>`);
        index += 1;
      }
      blocks.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    const paragraphLines = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !lines[index].startsWith("```") &&
      !/^(#{1,6})\s+/.test(lines[index]) &&
      !/^-+\s+/.test(lines[index]) &&
      !/^\d+\.\s+/.test(lines[index])
    ) {
      paragraphLines.push(lines[index].trim());
      index += 1;
    }
    blocks.push(`<p>${renderInline(paragraphLines.join(" "))}</p>`);
  }

  return blocks.join("\n");
}

function buildTocHtml() {
  const items = tocEntries
    .map(([id, label]) => `<li><a href="#${id}">${label}</a></li>`)
    .join("");
  return `<nav class="toc-card" aria-label="ReadMe 目录"><div class="toc-eyebrow">Directory</div><h2>目录</h2><ol>${items}</ol></nav>`;
}

function buildHeadingScript() {
  return `
const content = document.querySelector("#content");

function scrollToHashTarget() {
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return;
  const target = document.getElementById(hash);
  if (!target) return;
  target.scrollIntoView({ block: "start", behavior: "auto" });
}

window.addEventListener("hashchange", scrollToHashTarget);
scrollToHashTarget();
`;
}

const readmeMarkdown = await readFile(readmePath, "utf8");
const renderedHtml = renderMarkdown(readmeMarkdown);

const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>README TOC Preview</title>
    <style>
      :root {
        --bg: #f4efe7;
        --card: rgba(255, 252, 247, 0.94);
        --card-strong: #fffaf2;
        --ink: #17233b;
        --muted: #6a7488;
        --line: rgba(23, 35, 59, 0.12);
        --accent: #0f766e;
        --accent-soft: rgba(15, 118, 110, 0.1);
        --shadow: 0 24px 60px rgba(23, 35, 59, 0.12);
      }

      * {
        box-sizing: border-box;
      }

      html {
        scroll-behavior: smooth;
      }

      body {
        margin: 0;
        font-family: "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif;
        color: var(--ink);
        background:
          radial-gradient(circle at top left, rgba(15, 118, 110, 0.16), transparent 24%),
          radial-gradient(circle at top right, rgba(217, 119, 6, 0.14), transparent 22%),
          linear-gradient(180deg, #f9f4ec 0%, var(--bg) 100%);
      }

      .shell {
        width: min(1220px, calc(100vw - 40px));
        margin: 32px auto 48px;
        display: grid;
        grid-template-columns: 280px minmax(0, 1fr);
        gap: 24px;
        align-items: start;
      }

      .toc-card,
      .content-card {
        background: var(--card);
        border: 1px solid var(--line);
        border-radius: 24px;
        box-shadow: var(--shadow);
        backdrop-filter: blur(16px);
      }

      .toc-card {
        position: sticky;
        top: 24px;
        padding: 22px 20px 20px;
      }

      .toc-eyebrow {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--accent);
      }

      .toc-card h2 {
        margin: 10px 0 16px;
        font-size: 28px;
      }

      .toc-card ol {
        margin: 0;
        padding-left: 22px;
        display: grid;
        gap: 8px;
      }

      .toc-card a {
        color: var(--ink);
        text-decoration: none;
        border-bottom: 1px solid transparent;
      }

      .toc-card a:hover {
        color: var(--accent);
        border-bottom-color: currentColor;
      }

      .content-card {
        padding: 36px 52px 64px;
      }

      .hero {
        margin-bottom: 28px;
        padding: 24px 28px;
        background: linear-gradient(135deg, rgba(15, 118, 110, 0.12), rgba(217, 119, 6, 0.1));
        border: 1px solid rgba(15, 118, 110, 0.12);
        border-radius: 20px;
      }

      .hero .label {
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--accent);
      }

      .hero h1 {
        margin: 10px 0 8px;
        font-size: clamp(34px, 4vw, 46px);
        line-height: 1.06;
      }

      .hero p {
        margin: 0;
        color: var(--muted);
        font-size: 16px;
        line-height: 1.75;
      }

      #content h1:first-child {
        display: none;
      }

      #content h2,
      #content h3 {
        scroll-margin-top: 28px;
      }

      #content h2 {
        margin: 40px 0 14px;
        font-size: 34px;
        line-height: 1.15;
      }

      #content h3 {
        margin: 28px 0 12px;
        font-size: 24px;
      }

      #content p,
      #content li {
        color: #27334e;
        font-size: 16px;
        line-height: 1.85;
      }

      #content ul,
      #content ol {
        padding-left: 24px;
      }

      #content pre {
        overflow-x: auto;
        padding: 18px 20px;
        background: #fbf7f0;
        border: 1px solid rgba(23, 35, 59, 0.08);
        border-radius: 16px;
      }

      #content code {
        font-family: "SFMono-Regular", "Menlo", "Monaco", monospace;
        font-size: 0.92em;
      }

      #content p code,
      #content li code {
        padding: 2px 6px;
        background: var(--accent-soft);
        border-radius: 999px;
      }

      .anchored-heading::before {
        content: "#";
        display: inline-block;
        margin-right: 10px;
        color: rgba(15, 118, 110, 0.72);
      }

      .meta {
        margin-top: 24px;
        padding-top: 18px;
        border-top: 1px solid var(--line);
        color: var(--muted);
        font-size: 14px;
      }

      @media (max-width: 980px) {
        .shell {
          grid-template-columns: 1fr;
        }

        .toc-card {
          position: static;
        }

        .content-card {
          padding: 28px 24px 42px;
        }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <aside id="toc">${buildTocHtml()}</aside>
      <section class="content-card">
        <div class="hero">
          <div class="label">Local Preview</div>
          <h1>ReadMe 目录效果预览</h1>
          <p>这个页面用当前仓库里的 README 生成，左侧目录是拟议中的导航效果，方便你先看样式和跳转感受。</p>
        </div>
        <article id="content"></article>
        <div class="meta">生成文件：<code>.tests/readme-toc-preview.html</code>。如果你更新了 <code>README.md</code>，重新运行生成脚本即可刷新预览。</div>
      </section>
    </main>

    <script>
      document.querySelector("#content").innerHTML = ${JSON.stringify(renderedHtml)};
      ${buildHeadingScript()}
    </script>
  </body>
</html>
`;

await mkdir(outputDir, { recursive: true });
await writeFile(outputPath, html, "utf8");
console.log(`Generated preview: ${outputPath}`);
