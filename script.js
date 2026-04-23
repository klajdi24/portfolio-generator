window.sampleCV = `Noor Halim
Environment Artist / World Builder
London, UK

Summary
Cinematic environment artist focused on atmospheric world building, lighting, and storytelling through space.

Selected Work
* Echoes of Aether (2024) — Environment art + lighting for a sci-fi ruin. https://example.com/echoes.jpg
- Ashen Vale (2023) — World building and modular kit for dark fantasy city. https://example.com/ashen.mp4
- Meridian Drift (2022) — Key art scene composition and mood exploration.

Experience
Lead Environment Artist — Black Rift Studio (2022–Present)
Environment Artist — Greyline Interactive (2020–2022)

Process
Atmospheric lighting, modular kits, scene composition, Unreal workflows, storytelling through space.

Skills
Unreal Engine, Substance Painter, Blender, ZBrush, Photoshop, Lighting, World Building

Education
BA Games Art, University of Arts London`;

const qs = (sel) => document.querySelector(sel);
const qsa = (sel) => Array.from(document.querySelectorAll(sel));

window.state = {

  useLLM: true,
  useStream: true,
  cvText: "",
  prompt: "",
  layout: "auto",
  motion: "auto",
  parsed: null,
  mode: "default",
  palette: null,
  family: null,
  usedSample: false,
  stylePreset: null,
  revision: "",
  lastUploadWasPdf: false,
  parsedCV: null,
  pdfParsing: false,
  manualEdit: false,
  buildId: null,
  assets: [],
  cvOriginalFile: null,
  lastPortfolio: null,
  lastProjects: [],
  ghRepos: [],
  ghPinned: [],
};

function runDemoMode() {
  // A reliable, assessor-friendly run: sample CV + professional prompt + subtle motion.
  try {
    const cvBox = qs('#cvText');
    if (cvBox) cvBox.value = sampleCV;
    state.cvText = sampleCV;
    state.usedSample = true;
    state.sampleActive = true;
    state.parsedCV = null;
    state.lastUploadWasPdf = false;

    const prompt = 'Professional, clean, recruiter-friendly portfolio. Minimal motion (no floating). Strong typography, clear hierarchy. Neutral background, subtle accent. Make project cards concise with outcomes and tools.';
    const p = qs('#aiPrompt');
    if (p) p.value = prompt;
    state.prompt = prompt;

    const motion = qs('#motionSelect');
    if (motion) motion.value = 'subtle';
    state.motion = 'subtle';

    const layout = qs('#layoutSelect');
    if (layout) layout.value = 'recruiter';
    state.layout = 'recruiter';

    // Keep LLM on if available, but demo must still work if it isn't.
    renderPreflight();
    renderPortfolio();
  } catch (e) {
    alert('Demo mode failed.');
  }
}

function runBaselineMode() {
  // Baseline comparison: no LLM, clean mono style, subtle motion.
  try {
    // Keep any typed CV, but ensure we don't rely on structured/LLM state.
    state.parsedCV = null;
    state.lastUploadWasPdf = false;

    const prompt = 'Baseline portfolio: clean, minimal, professional, recruiter-friendly. No fancy motion.';
    const p = qs('#aiPrompt');
    if (p && !String(p.value || '').trim()) p.value = prompt;
    state.prompt = String(qs('#aiPrompt')?.value || state.prompt || prompt).trim();

    state.stylePreset = 'mono';
    state.mode = 'default';
    state.useLLM = false;
    try { const llmToggle = qs('#llmToggle'); if (llmToggle) llmToggle.checked = false; } catch (e) {}
    checkLLMStatus();

    const motion = qs('#motionSelect');
    if (motion) motion.value = 'subtle';
    state.motion = 'subtle';

    const layout = qs('#layoutSelect');
    if (layout) layout.value = 'recruiter';
    state.layout = 'recruiter';

    renderPreflight();
    renderPortfolio();
  } catch (e) {
    alert('Baseline mode failed.');
  }
}

const DEFAULT_PASTE_PLACEHOLDER = `Paste your CV / resume text here...\n\nTip: If you uploaded a PDF, the app may show structured JSON here for transparency. You can still edit it.`;

function setBanner(sel, text, kind = 'idle') {
  const el = typeof sel === 'string' ? qs(sel) : sel;
  if (!el) return;
  el.textContent = String(text || '');
  try { el.dataset.kind = kind || 'idle'; } catch (e) {}
}

function preflightChecks() {
  const checks = [];

  const cvBox = qs('#cvText');
  const raw = (cvBox?.value || state.cvText || '').trim();
  const hasAnyCvText = raw.length >= 80 || !!state.parsedCV;
  const hasPrompt = !!String((qs('#aiPrompt')?.value || state.prompt || '')).trim();
  const structured = (state.parsedCV && typeof state.parsedCV === 'object') ? state.parsedCV : null;
  const cv = structured ? ensureProjectObjects(structured) : null;

  // Use structured CV when available (after generate). Otherwise, fall back to heuristic parsing
  // so pre-flight still feels helpful before the first generation.
  const rawForParse = structured ? structuredToText(cv) : raw;
  const heur = rawForParse ? parseCV(normalizeCvText(String(rawForParse || ''))) : null;

  const projectEntries = Array.isArray(cv?.projects) && cv.projects.length
    ? cv.projects.map(normalizeProjectObject)
    : (Array.isArray(heur?.projects) ? heur.projects.map(p => (typeof p === 'string' ? parseProjectLine(p) : normalizeProjectObject(p))) : []);

  const projectCount = projectEntries.length;
  const withDesc = projectEntries.filter(p => String(p.desc || '').trim().length >= 40).length;
  const withLinks = projectEntries.filter(p => !!safeHref(p.linkUrl)).length;
  const withMedia = projectEntries.filter(p => !!safeMediaSrc(p.mediaUrl) || !!safeMediaSrc(p.posterUrl)).length;
  const summaryLen = String((cv?.summary || heur?.summary || '')).trim().length;

  checks.push({
    id: 'cv',
    kind: hasAnyCvText ? 'ok' : 'fix',
    title: 'CV provided',
    detail: hasAnyCvText ? 'Ready' : 'Add your CV to get started (upload or use the sample).'
  });
  checks.push({
    id: 'prompt',
    kind: hasPrompt ? 'ok' : 'warn',
    title: 'Style prompt',
    detail: hasPrompt ? 'Ready' : 'Recommended: describe the vibe, audience, and layout.'
  });
  checks.push({
    id: 'summary',
    kind: summaryLen >= 60 ? 'ok' : 'warn',
    title: 'Summary quality',
    detail: summaryLen >= 60 ? 'Ready' : (summaryLen ? 'A bit short, aim for 2–3 lines.' : 'Missing summary, generate a draft to extract it.')
  });
  const projectsKind = (projectCount >= 3 && projectCount <= 6) ? 'ok' : 'warn';
  checks.push({
    id: 'projects',
    kind: projectsKind,
    title: 'Projects extracted',
    detail: projectCount <= 6
      ? `${projectCount} found (target 3–6).`
      : `${projectCount} found (recommended 3–6). Consider curating to the strongest 6.`
  });
  checks.push({
    id: 'project-desc',
    kind: (projectCount ? (withDesc >= Math.min(3, projectCount) ? 'ok' : 'warn') : 'warn'),
    title: 'Project descriptions',
    detail: `${withDesc}/${projectCount || 0} have strong descriptions.`
  });
  checks.push({
    id: 'links',
    kind: (projectCount ? (withLinks >= 1 ? 'ok' : 'warn') : 'warn'),
    title: 'Project links',
    detail: `${withLinks}/${projectCount || 0} have links.`
  });
  checks.push({
    id: 'media',
    kind: (projectCount ? (withMedia >= 1 ? 'ok' : 'warn') : 'warn'),
    title: 'Project media',
    detail: `${withMedia}/${projectCount || 0} have media.`
  });

  // Overall status
  const hasFix = checks.some(c => c.kind === 'fix');
  const hasWarn = checks.some(c => c.kind === 'warn');
  const overall = hasFix ? 'fix' : (hasWarn ? 'warn' : 'ok');
  return { overall, checks };
}

function renderAccordionMeta() {
  const enrich = qs('#enrichMeta');
  if (enrich) {
    const mediaCount = (state.assets || []).length;
    const ghUser = String(qs('#ghUser')?.value || '').trim();
    const repoCount = Array.isArray(state.ghRepos) ? state.ghRepos.length : 0;
    const mediaPart = mediaCount ? `${mediaCount} media` : 'No media';
    const ghPart = ghUser ? (repoCount ? `${repoCount} repos loaded` : 'GitHub set') : 'GitHub not connected';
    enrich.textContent = `${mediaPart} · ${ghPart}`;
  }

  const tools = qs('#toolsMeta');
  if (tools) {
    const { overall, checks } = preflightChecks();
    const recs = checks.filter(c => c.kind === 'warn').length;
    const missing = checks.filter(c => c.kind === 'fix').length;
    const exDisabled = !!qs('#exportBtn')?.disabled;
    const readiness = overall === 'ok' ? 'Ready' : (overall === 'warn' ? 'Recommendations' : 'Missing');
    const counts = missing ? `${missing} missing` : (recs ? `${recs} recommendations` : 'No recommendations');
    const exportPart = exDisabled ? 'Export after generation' : 'Export available';
    tools.textContent = `${readiness} · ${counts} · ${exportPart}`;
  }
}

function renderPreflight() {
  const status = qs('#preflightStatus');
  const list = qs('#preflightList');
  if (!status || !list) return;
  const { overall, checks } = preflightChecks();
  const label = overall === 'ok'
    ? 'Ready'
    : (overall === 'warn' ? 'Good start (recommended improvements)' : 'Missing required info');
  setBanner(status, `Portfolio readiness: ${label}`, overall === 'ok' ? 'ok' : (overall === 'warn' ? 'busy' : 'error'));

  const ghUser = String(qs('#ghUser')?.value || '').trim();
  const actionFor = (c) => {
    if (c.id === 'cv' && c.kind !== 'ok') return { label: 'Add CV', action: 'open-cv' };
    if (c.id === 'prompt' && c.kind !== 'ok') return { label: 'Improve prompt', action: 'open-prompt' };
    if (c.id === 'projects') {
      if (c.kind === 'warn') return { label: 'Review projects', action: 'open-advanced' };
    }
    if (c.id === 'media' && c.kind !== 'ok') return { label: 'Add media', action: 'open-media' };
    // Summary is extracted during the normal Generate step, so avoid showing a duplicate "generate" CTA here.
    return null;
  };

  list.innerHTML = checks.map(c => {
    const pill = c.kind === 'ok' ? 'Ready' : (c.kind === 'warn' ? 'Recommended' : 'Missing');
    const act = actionFor(c);
    const btn = act ? `<button type="button" class="small-btn" data-preflight-action="${escapeHtml(act.action)}">${escapeHtml(act.label)}</button>` : `<div class="pill">${pill}</div>`;
    return `
      <div class="preflight-item" data-kind="${c.kind}">
        <div>
          <strong>${escapeHtml(c.title)}</strong>
          <div class="help">${escapeHtml(c.detail)}</div>
        </div>
        ${btn}
      </div>`;
  }).join('');

  renderAccordionMeta();
}

function looksLikeDemoCVJson(text = "") {
  const t = String(text || '');
  return /"name"\s*:\s*"John Doe"/i.test(t) || /"title"\s*:\s*"Software Engineer"/i.test(t);
}

const cinematicKeywords = [
  "cinematic", "dark", "studio", "poster", "art book", "art-book", "atmospheric", "premium", "mysterious",
  "environment artist", "game artist", "world builder", "worldbuilding", "cinematic artist", "environment designer"
];

const stylePresets = {
  blue: {
    mode: "default",
    motion: "dynamic",
    palette: { base: "#0b1020", surface: "#121a2e", surfaceAlt: "#18243b", steel: "#5b7cff", amber: "#9cc3ff", text: "#eef3ff", textMuted: "#a9b8d9", border: "rgba(90,120,200,0.25)", glow: "rgba(120,170,255,0.25)" }
  },
  cinematic: {
    mode: "cinematic-dark",
    motion: "cinematic",
    palette: { base: "#101216", surface: "#161b22", surfaceAlt: "#1d2630", steel: "#3c4d62", amber: "#c88a3a", text: "#f1ede7", textMuted: "#b7b2ad", border: "rgba(148,160,175,0.18)", glow: "rgba(200,138,58,0.18)" }
  },
  playful: {
    mode: "default",
    motion: "playful",
    // Higher-contrast, less "muddy" playful palette so it stays usable.
    palette: { base: "#f7f8ff", surface: "#ffffff", surfaceAlt: "#eef1ff", steel: "#4257ff", amber: "#ff4db8", text: "#14162a", textMuted: "#3e456a", border: "rgba(66,87,255,0.22)", glow: "rgba(255,77,184,0.22)" }
  },
  mono: {
    mode: "default",
    motion: "subtle",
    palette: { base: "#0e0e10", surface: "#141417", surfaceAlt: "#1d1d22", steel: "#8c8c8c", amber: "#d0d0d0", text: "#f6f6f6", textMuted: "#b1b1b1", border: "rgba(255,255,255,0.12)", glow: "rgba(255,255,255,0.12)" }
  }
};

function normalizeCvText(raw = "") {
  // Preserve newlines (sections matter for CV parsing).
  // Normalize each line's internal spacing, then collapse excessive blank lines.
  let t = String(raw || '').replace(/\r/g, '\n');
  t = t
    .split('\n')
    .map(l => l.replace(/\s+/g, ' ').trim())
    .join('\n');
  // Collapse 3+ newlines to 2.
  t = t.replace(/\n{3,}/g, '\n\n').trim();
  const headings = [
    'SUMMARY','PROFILE','WORK EXPERIENCE','EXPERIENCE','EDUCATION','SKILLS','PROJECTS','LANGUAGES','CERTIFICATIONS'
  ];
  headings.forEach(h => {
    const re = new RegExp(`(${h.replace(/\s+/g, '\\s*')})`, 'gi');
    t = t.replace(re, `\n${h}\n`);
  });
  // break at likely section runs (ALL CAPS words)
  t = t.replace(/\b([A-Z]{4,}(?:\s+[A-Z]{2,}){0,2})\b/g, '\n$1\n');
  // split common sentences for readability
  t = t.replace(/\.\s+/g, '.\n');
  // contact info
  t = t.replace(/\b(\+?\d{1,3})?\s?\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{4}\b/g, (m)=>`\n${m}\n`);
  t = t.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, (m)=>`\n${m}\n`);
  // date ranges
  t = t.replace(/\b(\d{4}\s?[–-]\s?\d{4}|\d{4}\s?[–-]\s?Present|\d{4}\s?[–-]\s?\d{2})\b/g, (m)=>`\n${m}\n`);
  // split bullets-like entries
  t = t.replace(/\b(Project|Experience|Education|Skill|Language)\b\s*[:\-]?/gi, '\n$1\n');
  // split long skill/tool lists by commas
  t = t.replace(/(SKILLS\n)([^\n]+)/gi, (m, h, list) => `${h}${list.split(',').map(s=>s.trim()).join('\n')}`);
  t = t.replace(/\n{3,}/g, '\n\n');
  return t.trim();
}

// PDF extraction often produces: split words ("Illus trator"), repeated headings,
// and missing newlines. This tries to restore human-readable structure.
function cleanPdfCvText(raw = "") {
  let t = String(raw || "");
  // normalize whitespace but keep newlines
  t = t.replace(/\r/g, '\n');
  t = t.replace(/[ \t]+/g, ' ');
  t = t.replace(/\n{3,}/g, '\n\n');

  // Fix common PDF word-splitting without accidentally concatenating real words.
  // Targeted fixes only (avoid turning "i made an" into "imadean").
  const joinMap = {
    'Illus trator': 'Illustrator',
    'Premi er': 'Premier',
    'Inde sign': 'InDesign',
    'Visu al': 'Visual',
    'micr osoft': 'microsoft',
    'Power point': 'PowerPoint',
    'After effects': 'After Effects',
    'Premier Pro': 'Premiere Pro',
    'Pro tools': 'Pro Tools',
    'Max msp': 'Max/MSP',
    'we ll': 'well',
  };
  Object.entries(joinMap).forEach(([k, v]) => {
    const re = new RegExp(`\\b${k.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')}\\b`, 'gi');
    t = t.replace(re, v);
  });

  // Join hyphenated line breaks: "inter-\nactive" -> "interactive"
  t = t.replace(/(\w)-\s*\n\s*(\w)/g, '$1$2');

  // common heading aliases to consistent headings
  const headingMap = [
    [/\bWORK\s*EXPERIENCE\b/gi, 'EXPERIENCE'],
    [/\bPROF(ILE)?\b/gi, 'SUMMARY'],
    [/\bSELECTED\s*WORK\b/gi, 'PROJECTS'],
  ];
  headingMap.forEach(([re, rep]) => { t = t.replace(re, rep); });

  // Ensure headings on their own lines
  ['SUMMARY','PROJECTS','EXPERIENCE','EDUCATION','SKILLS','LANGUAGES','CERTIFICATIONS','CONTACT']
    .forEach(h => {
      const re = new RegExp(`\\b${h}\\b`, 'gi');
      t = t.replace(re, `\n${h}\n`);
    });

  // If email/phone are floating inside sentences, isolate them.
  t = t.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, (m) => `\n${m}\n`);
  t = t.replace(/\b\+?\d{1,3}\s*\(?\d{2,4}\)?\s*\d{3,4}\s*\d{3,4}\b/g, (m) => `\n${m}\n`);

  // Turn obvious project/skill runs into line items
  t = t.replace(/\b(Unity VR|Three\.js|Sound Design|Media Production|FMOD|Pro Tools|After Effects|Premiere Pro|Figma|Maya|Max\/MSP|Max msp)\b/gi, '\n$1');

  // If we see a PROJECTS heading, try to bulletize the following common project labels.
  t = t.replace(/\nPROJECTS\n([\s\S]{0,1200}?)(\nEXPERIENCE\n|\nEDUCATION\n|\nSKILLS\n|$)/i, (m, block, tail) => {
    const lines = block
      .split(/\n+/)
      .map(s => s.trim())
      .filter(Boolean)
      .map(s => (/^(Unity VR|Three\.js|Sound Design|Media Production)/i.test(s) ? `- ${s}` : s));
    return `\nPROJECTS\n${lines.join('\n')}\n${tail}`;
  });

  // Cleanup duplicates like multiple EXPERIENCE/SKILLS back-to-back
  t = t.replace(/\n(\s*(SUMMARY|PROJECTS|EXPERIENCE|EDUCATION|SKILLS|LANGUAGES)\s*\n)+/g, (m) => {
    const hs = Array.from(new Set(m.split(/\n+/).map(s => s.trim()).filter(Boolean)));
    return '\n' + hs.join('\n') + '\n';
  });

  // Finally run the general normalizer which adds structure.
  return normalizeCvText(t);
}

async function loadPdfJs() {
  if (window.pdfjsLib) return window.pdfjsLib;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.onload = () => resolve();
    s.onerror = (e) => reject(e);
    document.head.appendChild(s);
  });
  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  return window.pdfjsLib;
}

function cvFromPlainText(raw = "") {
  // For pasted/typed CVs: keep original line breaks, just light cleanup.
  // This avoids the aggressive PDF repair heuristics.
  let t = String(raw || '').replace(/\r/g, '\n');
  t = t.replace(/[\t\f\v]+/g, ' ');
  t = t.replace(/\n{3,}/g, '\n\n');
  return normalizeCvText(t);
}

async function extractPdfText(arrayBuffer) {
  const pdfjsLib = await loadPdfJs();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  // Reconstruct lines using text item positions (much better than a flat join).
  // This helps CVs retain section structure instead of becoming one long sentence.
  let out = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent({ includeMarkedContent: true });

    // Group items by Y coordinate (line), then sort each line by X.
    // PDF coordinates are noisy, so we quantize Y.
    const lines = new Map();
    for (const it of (content.items || [])) {
      const s = (it.str || '').trim();
      if (!s) continue;
      const t = it.transform || [1, 0, 0, 1, 0, 0];
      const x = t[4] || 0;
      const y = t[5] || 0;
      const yKey = Math.round(y / 3) * 3; // quantize
      if (!lines.has(yKey)) lines.set(yKey, []);
      lines.get(yKey).push({ x, s });
    }

    const sortedY = Array.from(lines.keys()).sort((a, b) => b - a); // top to bottom
    for (const yKey of sortedY) {
      const items = lines.get(yKey).sort((a, b) => a.x - b.x);
      let line = '';
      let lastX = null;
      for (const { x, s } of items) {
        // Insert a space when there is a noticeable gap.
        if (lastX !== null && x - lastX > 18 && !line.endsWith(' ')) line += ' ';
        line += (line && !line.endsWith(' ') ? ' ' : '') + s;
        lastX = x;
      }
      line = line.replace(/\s+/g, ' ').trim();
      if (!line) continue;
      out += line + '\n';
    }
    out += '\n';
  }
  return out.trim();
}

// NOTE: We previously attempted server-side PDF parsing via multipart upload.
// In practice, client-side PDF.js extraction + server-side LLM repair is more reliable.

function parseCV(text) {
  const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);
  const name = lines[0] || "Unnamed";
  const title = lines.find(l => /artist|designer|developer|engineer|writer|director|producer|architect|researcher|animator|illustrator|photographer/i.test(l) && l !== name) || "Creative Professional";
  const location = lines.find(l => /\b(UK|United Kingdom|London|Remote|New York|Berlin|Paris|Los Angeles|Montreal|Toronto|Vancouver|Canada|USA|United States)\b/i.test(l)) || "";

  const getSection = (label) => {
    const idx = lines.findIndex(l => l.toLowerCase() === label.toLowerCase());
    if (idx === -1) return [];
    const out = [];
    for (let i = idx + 1; i < lines.length; i++) {
      if (/^[A-Z][A-Za-z ]{2,}$/.test(lines[i]) && lines[i].length < 30) break;
      out.push(lines[i]);
    }
    return out;
  };

  const summary = getSection("Summary").join(" ") || "Creative technologist working across animation, interactive media, and immersive experiences.";
  let projects = getSection("Selected Work").length ? getSection("Selected Work") : lines.filter(l => /^-/.test(l));
  // Support CVs that use a PROJECTS heading.
  if (!projects.length) projects = getSection("Projects");
  const experience = getSection("Experience");
  const process = getSection("Process");
  const skills = getSection("Skills");

  return { name, title, location, summary, projects, experience, process, skills };
}

// Fallback merge for LLM-parsed CV JSON.
// The UI expects these fields to exist and be reasonably populated.
// If the model omits sections (common with messy PDF text), we backfill
// from the heuristic parser and a light project/url extractor.
function mergeFallback(parsedCV, rawCvText = "") {
  const base = (parsedCV && typeof parsedCV === 'object') ? { ...parsedCV } : {};
  const normalized = normalizeCvText(rawCvText || "");
  const heur = parseCV(normalized);

  const pick = (a, b) => (a !== undefined && a !== null && String(a).trim() !== "") ? a : b;
  const arr = (x) => Array.isArray(x) ? x.filter(Boolean).map(v => String(v).trim()).filter(Boolean) : [];
  const projArr = (x) => {
    if (!Array.isArray(x)) return [];
    return x
      .map(e => normalizeProjectObject(e))
      .filter(p => p && (p.title || p.desc || p.mediaUrl || p.linkUrl));
  };

  base.name = pick(base.name, heur.name);
  base.title = pick(base.title, heur.title);
  base.location = pick(base.location, heur.location);

  // Guard: location should not be a phone prefix like "+44".
  if (base.location && /^\+\d{1,3}$/.test(String(base.location).trim())) {
    base.location = heur.location || '';
  }
  base.summary = pick(base.summary, heur.summary);

  base.experience = arr(base.experience).length ? arr(base.experience) : heur.experience;
  base.skills = arr(base.skills).length ? arr(base.skills) : heur.skills;
  base.tools = arr(base.tools);
  base.languages = arr(base.languages);
  base.education = arr(base.education);
  base.process = arr(base.process).length ? arr(base.process) : heur.process;

  // Projects: if empty, try heuristic projects, then URL/bullet extraction.
  const existingProjects = projArr(base.projects);
  if (existingProjects.length) {
    base.projects = existingProjects;
  } else if (Array.isArray(heur.projects) && heur.projects.length) {
    base.projects = heur.projects.map(p => normalizeProjectObject(p));
  } else {
    const lines = (rawCvText || "").split(/\n+/).map(s => s.trim()).filter(Boolean);
    const urlLine = (l) => /https?:\/\//i.test(l);
    const bulletLine = (l) => /^[-•*]\s+/.test(l);
    const candidates = lines.filter(l => urlLine(l) || bulletLine(l));
    // Prefer compact distinct entries.
    const uniq = [];
    for (const c of candidates) {
      const s = c.replace(/^[-•*]\s+/, '').trim();
      if (!s) continue;
      if (uniq.some(u => u.toLowerCase() === s.toLowerCase())) continue;
      uniq.push(s);
      if (uniq.length >= 8) break;
    }
    base.projects = uniq.map(p => normalizeProjectObject(p));
  }

  // Ensure arrays are arrays.
  base.projects = projArr(base.projects);
  base.experience = arr(base.experience);
  base.skills = arr(base.skills);
  base.process = arr(base.process);

  return base;
}

function tokenizePrompt(prompt = "") {
  return prompt.toLowerCase().split(/[^a-z0-9+]+/).filter(Boolean);
}

function includesAny(text, list) {
  return list.some(k => text.includes(k));
}

function buildContentPlan(parsed, prompt = "") {
  const text = prompt.toLowerCase();
  const wantsSelectedFirst = text.includes("selected work") || text.includes("selected first") || text.includes("emphasize selected");
  const wantsProcessSecond = text.includes("process") && text.includes("experience");
  const sectionOrder = wantsSelectedFirst
    ? ["selected", wantsProcessSecond ? "process" : "experience", wantsProcessSecond ? "experience" : "process", "skills"]
    : ["selected", "process", "experience", "skills"];

  const heroLabel = parsed?.title || "Creative Portfolio";
  const heroSubtitle = parsed?.summary || "Crafting immersive worlds through light, scale, and narrative space.";

  return {
    sectionOrder,
    heroLabel,
    heroSubtitle,
    selectedIntro: text.includes("art book") ? "Visual-first work, composed like cinematic spreads." : "Visual-first projects with cinematic lighting and world-building focus.",
    processIntro: "Crafting worlds through light, structure, and narrative space.",
    experienceIntro: "Studio experience focused on immersive environments.",
    skillsIntro: "Quiet support for the work — the craft behind the scenes.",
    educationIntro: "Education and training."
  };
}

function buildVisualPlan(parsed, prompt = "", mode = "default") {
  const text = prompt.toLowerCase();
  const family = mode === "cinematic-dark" ? "cinematic-editorial" : "clean";
  return {
    family,
    mood: includesAny(text, ["mysterious", "moody", "dark", "atmospheric"]) ? "moody" : "neutral",
    layout: includesAny(text, ["split", "editorial", "art book", "poster"]) ? "split-hero" : "standard",
    heroTreatment: includesAny(text, ["poster", "key art", "art book"]) ? "poster" : "classic",
    cardTreatment: includesAny(text, ["visual-first", "gallery", "cinematic"]) ? "gallery" : "standard",
    spacing: includesAny(text, ["generous", "spacious", "air", "negative space", "increase spacing"]) ? "spacious" : "normal",
    background: {
      grain: includesAny(text, ["grain", "film", "halftone"]) || mode === "cinematic-dark",
      grid: includesAny(text, ["grid", "overlay", "editorial"]) || mode === "cinematic-dark"
    }
  };
}

function normalizeProjects(projects = []) {
  if (!Array.isArray(projects)) return [];
  return projects.map((entry) => {
    if (typeof entry === "string") return parseProjectLine(entry);
    if (entry && typeof entry === "object") {
      const title = entry.title || entry.name || "Untitled";
      const year = entry.year || "";
      const desc = entry.description || entry.desc || entry.summary || "Atmospheric environment exploration";
      return {
        title,
        year,
        desc,
        featured: !!entry.featured,
        mediaUrl: entry.media || entry.mediaUrl || null,
        linkUrl: entry.link || entry.linkUrl || null,
        posterUrl: entry.poster || entry.posterUrl || null,
        role: entry.role || null,
        tools: entry.tools || null,
        badge: entry.badge || null
      };
    }
    return parseProjectLine(String(entry || ""));
  });
}

// Curate projects to a portfolio-friendly list (recommended 3–6).
// Keeps the UI clean and aligns with the pre-flight target.
function pickSelectedProjects(projects = [], max = 6) {
  const items = normalizeProjects(projects || []);
  const take = (arr, pred, out, usedTitles) => {
    for (const p of arr) {
      if (!p) continue;
      if (out.length >= max) break;
      if (!pred(p)) continue;
      const key = String(p.title || '').toLowerCase().trim();
      if (!key || usedTitles.has(key)) continue;
      usedTitles.add(key);
      out.push({ ...p, featured: true });
    }
  };
  const out = [];
  const usedTitles = new Set();

  // 1) Explicit featured first, keep original order.
  take(items, (p) => !!p.featured, out, usedTitles);
  // 2) Then projects with media.
  take(items, (p) => !p.featured && !!safeMediaSrc(p.mediaUrl), out, usedTitles);
  // 3) Then projects with links.
  take(items, (p) => !p.featured && !!safeHref(p.linkUrl), out, usedTitles);
  // 4) Then best descriptions.
  take(items, (p) => !p.featured && String(p.desc || '').trim().length >= 60, out, usedTitles);
  // 5) Fill remaining.
  take(items, (p) => true, out, usedTitles);

  return out;
}

function curateCvProjects(cv, max = 6) {
  if (!cv || typeof cv !== 'object') return { selected: [], overflow: [] };
  ensureProjectObjects(cv);
  const all = normalizeProjects(cv.projects || []);
  if (all.length <= max) return { selected: all, overflow: [] };
  const selected = pickSelectedProjects(all, max);
  const selKeys = new Set(selected.map(p => String(p.title || '').toLowerCase().trim()).filter(Boolean));
  const overflow = all.filter(p => {
    const k = String(p.title || '').toLowerCase().trim();
    return k && !selKeys.has(k);
  });
  cv.projects = selected;
  return { selected, overflow };
}

function topSkills(skills = [], max = 3) {
  if (!Array.isArray(skills)) return [];
  return skills.slice(0, max).map(s => s.split(',')[0]).map(s => s.trim()).filter(Boolean);
}

function buildRevisionPatch(revision = "") {
  const text = revision.toLowerCase();
  if (!text) return null;
  const patch = { contentPlan: {}, visualPlan: {}, palette: {}, motion: null, layout: null };

  if (includesAny(text, ["selected work first", "selected first", "emphasize selected"])) {
    patch.contentPlan.sectionOrder = ["selected", "process", "experience", "skills"];
  }
  if (includesAny(text, ["process first"])) {
    patch.contentPlan.sectionOrder = ["process", "selected", "experience", "skills"];
  }
  if (includesAny(text, ["editorial", "split hero", "split-hero"])) {
    patch.visualPlan.layout = "split-hero";
  }
  if (includesAny(text, ["clean cards", "minimal cards", "flat cards"])) {
    patch.visualPlan.cardTreatment = "clean";
  }
  if (includesAny(text, ["visual-first", "gallery", "cinematic cards"])) {
    patch.visualPlan.cardTreatment = "gallery";
  }

  // More artistic / expressive direction.
  if (includesAny(text, ["artistic", "artsy", "expressive", "editorial", "art book", "art-book", "poster", "illustrated", "illustration", "gallery"])) {
    patch.visualPlan.variant = "artistic";
    patch.visualPlan.cardTreatment = patch.visualPlan.cardTreatment || "gallery";
    patch.visualPlan.spacing = patch.visualPlan.spacing || "spacious";
    patch.visualPlan.heroTreatment = "poster";
    patch.visualPlan.background = { grain: true, grid: true };
    // Default to cinematic motion for "artistic" unless user explicitly asked for extreme.
    if (!includesAny(text, ["extreme", "more motion", "dynamic"])) patch.motion = patch.motion || "cinematic";
    // Nudge palette towards higher-contrast editorial.
    if (!Object.keys(patch.palette || {}).length) {
      patch.palette = {
        base: "#0f1115",
        surface: "#151a21",
        surfaceAlt: "#1b2430",
        steel: "#425466",
        amber: "#c88a3a",
        text: "#f2eee8",
        textMuted: "#b9b2aa",
        border: "rgba(148,160,175,0.18)",
        glow: "rgba(200,138,58,0.18)"
      };
    }
  }
  if (includesAny(text, ["increase spacing", "increased spacing", "more spacing", "more negative space", "spacious"])) {
    patch.visualPlan.spacing = "spacious";
  }
  if (includesAny(text, ["reduce motion", "less motion", "no motion", "no animation", "no animations", "calm motion", "reduced motion"])) {
    patch.motion = "subtle";
  }
  if (includesAny(text, ["cinematic motion"])) {
    patch.motion = "cinematic";
  }
  if (includesAny(text, ["playful motion", "bouncy"])) {
    patch.motion = "playful";
  }
  if (includesAny(text, ["more motion", "dynamic motion", "more animations", "dynamic", "reactive", "interactive"])) {
    patch.motion = includesAny(text, ["extreme", "very dynamic", "lots of motion"]) ? "extreme" : "dynamic";
  }
  const colorKeywords = ["red", "crimson", "blue", "teal", "purple", "amber", "gold", "black", "monochrome", "white", "ivory", "midnight"];
  if (colorKeywords.some(k => text.includes(k))) {
    patch.palette = paletteFor(revision, "default");
  }
  return patch;
}

function applyRevisionPatch(parsed, revision) {
  if (!revision) return parsed;
  const patch = buildRevisionPatch(revision);
  if (!patch) return parsed;
  const merged = { ...parsed };
  if (patch.contentPlan && Object.keys(patch.contentPlan).length) {
    merged.contentPlan = { ...(merged.contentPlan || {}), ...patch.contentPlan };
  }
  if (patch.visualPlan && Object.keys(patch.visualPlan).length) {
    merged.visualPlan = { ...(merged.visualPlan || {}), ...patch.visualPlan };
  }
  if (patch.palette && Object.keys(patch.palette).length) {
    merged.palette = { ...(merged.palette || {}), ...patch.palette };
  }
  if (patch.motion) merged.motion = patch.motion;
  if (patch.layout) merged.layout = patch.layout;
  return merged;
}

function applyPlans(parsed, prompt, mode) {
  const contentPlan = parsed?.contentPlan || buildContentPlan(parsed, prompt);
  const visualPlan = parsed?.visualPlan || buildVisualPlan(parsed, prompt, mode);
  return { ...parsed, contentPlan, visualPlan };
}

async function llmParse(rawText) {
  const res = await fetch('/api/parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rawText })
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Parse failed');
  return data.data;
}

async function llmGenerate(cvText, prompt, stream = true) {
  const payload = { cvText, prompt };
  if (stream) {
    const res = await fetch('/api/generate?stream=1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let content = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (line.startsWith('data:')) {
          const data = line.replace('data:', '').trim();
          if (data === '[DONE]') continue;
          try {
            const json = JSON.parse(data);
            const delta = json.choices?.[0]?.delta?.content || '';
            content += delta;
          } catch (e) {}
        }
      }
    }
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Failed to parse streamed JSON');
    return JSON.parse(match[0]);
  }

  const maxRetries = 2;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'LLM failed');
      return data.data;
    } catch (e) {
      if (i === maxRetries) throw e;
      await new Promise(r => setTimeout(r, 600 * (i + 1)));
    }
  }
}

async function llmImproveFromCV(rawCvText, basePrompt, stream = true, strict = false) {
  // Second-pass: ask the model to rewrite/repair the extracted CV into clean sections
  // and to produce richer, portfolio-ready project bullets.
  const res = await fetch('/api/improve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rawText: rawCvText, prompt: basePrompt, stream, strict })
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Improve failed');
  return data.data;
}


async function exportHTML() {
  console.log('Export clicked');
  const preview = qs('#preview');
  if (!preview || preview.classList.contains('hidden')) {
    alert('Generate a portfolio first.');
    return;
  }
  let css = '';
  try {
    const res = await fetch('style.css');
    css = await res.text();
  } catch (e) {}

  const projects = state.lastProjects || normalizeProjects(state.parsed?.projects || []);
  const modalMarkup = `
  <div id="projectModal" class="modal hidden" aria-hidden="true">
    <div class="modal-backdrop" data-modal-close="1"></div>
    <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
      <button type="button" class="modal-close" aria-label="Close" data-modal-close="1">×</button>
      <div class="modal-content">
        <div class="modal-media" id="modalMedia"></div>
        <div class="modal-copy">
          <h3 id="modalTitle">Project</h3>
          <div class="modal-meta" id="modalMeta"></div>
          <p class="modal-desc" id="modalDesc"></p>
          <div class="modal-actions" id="modalActions"></div>
        </div>
      </div>
    </div>
  </div>`;

  const modalScript = `
  <script>
  window.__PORTFOLIO_PROJECTS__ = ${JSON.stringify(projects || []).replace(/<\//g, '<\\/')};
  (function(){
    const qs = (s, r=document) => r.querySelector(s);
    const esc = (s) => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#39;');
    const modal = () => qs('#projectModal');
    const close = () => {
      const m = modal();
      if (!m) return;
      m.classList.add('hidden');
      m.setAttribute('aria-hidden','true');
      try { qs('#modalMedia')?.querySelector('video')?.pause?.(); } catch (e) {}
    };
    const open = (idx) => {
      const p = (window.__PORTFOLIO_PROJECTS__||[])[idx];
      const m = modal();
      if (!p || !m) return;
      qs('#modalTitle').textContent = p.title || 'Project';
      qs('#modalDesc').textContent = p.desc || '';
      const meta = [];
      if (p.year) meta.push('Year: '+p.year);
      if (p.role) meta.push('Role: '+p.role);
      if (p.tools) meta.push('Tools: '+(Array.isArray(p.tools)?p.tools.join(', '):p.tools));
      qs('#modalMeta').innerHTML = meta.map(x=>'<span>'+esc(x)+'</span>').join('');
      const mediaUrl = p.mediaUrl || p.posterUrl || '';
      const isVideo = /\.(mp4|webm|ogg|mov)(\?|#|$)/i.test(mediaUrl);
      qs('#modalMedia').innerHTML = mediaUrl ? (isVideo ? '<video controls playsinline preload="metadata" src="'+esc(mediaUrl)+'"></video>' : '<img alt="'+esc(p.title||'Project')+'" src="'+esc(mediaUrl)+'"/>') : '<div class="help">No media attached.</div>';
      const actions = [];
      if (p.linkUrl) actions.push('<a class="primary" target="_blank" rel="noopener" href="'+esc(p.linkUrl)+'">Open project link</a>');
      if (p.mediaUrl) actions.push('<a target="_blank" rel="noopener" href="'+esc(p.mediaUrl)+'">Open media</a>');
      if (p.mediaUrl) actions.push('<a download href="'+esc(p.mediaUrl)+'">Download media</a>');
      qs('#modalActions').innerHTML = actions.join('');
      m.classList.remove('hidden');
      m.setAttribute('aria-hidden','false');
    };
    document.addEventListener('click', (e) => {
      const t = e.target;
      if (!t) return;
      if (t.closest && t.closest('[data-modal-close]')) { close(); e.preventDefault(); return; }
      const link = t.closest && t.closest('.project-link');
      if (link && link.dataset && link.dataset.projectIdx != null) {
        const idx = Number(link.dataset.projectIdx);
        if (Number.isFinite(idx)) { open(idx); e.preventDefault(); return; }
      }
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  })();
  </script>`;

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1" /><title>Exported Portfolio</title><style>${css}</style></head><body>${preview.innerHTML}${modalMarkup}${modalScript}</body></html>`;
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);

  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = 'portfolio.html';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (e) {}

  const win = window.open(url, '_blank');
  if (!win) {
    alert('Popup blocked. Allow popups for this site to export.');
  }

  const log = qs('#aiLog');
  if (log) {
    log.innerHTML = `<p><strong>Export ready:</strong> <a href="${url}" target="_blank" rel="noopener">Open exported HTML</a></p>`;
  }
}

async function injectInlineCSS() {
  try {
    const res = await fetch('style.css');
    const css = await res.text();
    const tag = qs('#inline-export');
    if (tag) tag.textContent = css;
  } catch (e) {}
}


async function checkLLMStatus() {
  const el = qs('#llmStatus');
  if (!el) return;
  if (!state.useLLM) {
    setBanner(el, 'LLM status: off', 'idle');
    return;
  }
  setBanner(el, 'LLM status: checking…', 'busy');

  // Render free tier can cold-start, and edge caches can briefly serve a stale negative response.
  // We (1) bust cache with a query param, (2) disable cache, (3) retry a few times.
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(`/api/status?ts=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setBanner(el, data.ok ? 'LLM status: connected' : 'LLM status: error', data.ok ? 'ok' : 'error');
      return;
    } catch (e) {
      // keep retrying
      await new Promise(r => setTimeout(r, 350 * (attempt + 1)));
    }
  }

  setBanner(el, 'LLM status: unreachable', 'error');
}

async function showBuildId() {
  try {
    const r = await fetch('/api/version');
    const j = await r.json();
    const log = qs('#aiLog');
    if (log && j?.build) {
      state.buildId = j.build;
      log.innerHTML = `<p class="help">Build: ${j.build}</p>` + log.innerHTML;
    }
  } catch (e) {}
}

function structuredToText(cv) {
  if (!cv || typeof cv !== 'object') return '';
  const lines = [];
  if (cv.name) lines.push(String(cv.name));
  if (cv.title) lines.push(String(cv.title));
  if (cv.location) lines.push(String(cv.location));

  if (cv.summary) {
    lines.push('SUMMARY');
    lines.push(String(cv.summary));
  }
  if (Array.isArray(cv.projects) && cv.projects.length) {
    lines.push('PROJECTS');
    cv.projects.forEach(p => {
      if (p && typeof p === 'object') {
        const title = String(p.title || p.name || 'Untitled').trim();
        const year = String(p.year || '').trim();
        const desc = String(p.desc || p.description || p.summary || '').trim();
        const mediaUrl = p.mediaUrl || p.media || null;
        const linkUrl = p.linkUrl || p.link || null;
        const bits = [
          `${title}${year ? ` (${year})` : ''}${desc ? ` — ${desc}` : ''}`,
          linkUrl ? `link: ${linkUrl}` : null,
          mediaUrl ? `media: ${mediaUrl}` : null,
        ].filter(Boolean);
        lines.push(`- ${bits.join(' | ')}`);
      } else {
        lines.push(`- ${String(p)}`);
      }
    });
  }
  if (Array.isArray(cv.experience) && cv.experience.length) {
    lines.push('EXPERIENCE');
    cv.experience.forEach(x => lines.push(`- ${String(x)}`));
  }
  if (Array.isArray(cv.skills) && cv.skills.length) {
    lines.push('SKILLS');
    cv.skills.forEach(s => lines.push(String(s)));
  }
  if (Array.isArray(cv.tools) && cv.tools.length) {
    lines.push('TOOLS');
    cv.tools.forEach(t => lines.push(String(t)));
  }
  if (Array.isArray(cv.education) && cv.education.length) {
    lines.push('EDUCATION');
    cv.education.forEach(e => lines.push(`- ${String(e)}`));
  }
  if (Array.isArray(cv.languages) && cv.languages.length) {
    lines.push('LANGUAGES');
    cv.languages.forEach(l => lines.push(String(l)));
  }
  return lines.join('\n');
}

function tryParseCvJson(text = "") {
  try {
    const obj = JSON.parse(String(text || '').trim());
    if (obj && typeof obj === 'object' && (obj.name !== undefined || obj.projects !== undefined)) return obj;
  } catch (e) {}
  return null;
}

function normalizeProjectObject(entry) {
  if (entry && typeof entry === 'object') {
    const title = entry.title || entry.name || 'Untitled';
    const year = entry.year || '';
    const desc = entry.desc || entry.description || entry.summary || 'Project description';
    let tools = entry.tools || null;
    if (typeof tools === 'string') {
      tools = tools.split(',').map(s => s.trim()).filter(Boolean);
    }
    return {
      title,
      year,
      desc,
      featured: !!entry.featured,
      mediaUrl: entry.mediaUrl || entry.media || null,
      linkUrl: entry.linkUrl || entry.link || null,
      posterUrl: entry.posterUrl || entry.poster || null,
      role: entry.role || null,
      tools,
      badge: entry.badge || null,
    };
  }
  return normalizeProjects([String(entry || '')])[0];
}

function ensureProjectObjects(cv) {
  if (!cv || typeof cv !== 'object') return cv;
  if (!Array.isArray(cv.projects)) cv.projects = [];
  cv.projects = cv.projects.map(normalizeProjectObject);
  return cv;
}

async function uploadMediaFiles(files = []) {
  const fd = new FormData();
  for (const f of (files || [])) fd.append('files', f);
  const res = await fetch('/api/upload', { method: 'POST', body: fd });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Upload failed');
  return data.files || [];
}

function tokens(s = '') {
  return String(s || '')
    .toLowerCase()
    .replace(/\.[a-z0-9]{2,4}$/i, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .filter(t => !['the','and','of','to','in','a','an','for','project','final','v1','v2','draft'].includes(t));
}

function bestAssetForProject(projectTitle, assets, used = new Set()) {
  const pt = tokens(projectTitle);
  if (!pt.length) return null;
  let best = null;
  for (const a of assets) {
    if (!a?.url || used.has(a.url)) continue;
    const at = tokens(a.name || a.url);
    const common = pt.filter(t => at.includes(t)).length;
    const bonus = (a.name || '').toLowerCase().includes(projectTitle.toLowerCase().split(' ')[0] || '') ? 1 : 0;
    const score = common + bonus;
    if (!best || score > best.score) best = { asset: a, score };
  }
  if (!best) return null;
  // Require at least one token match to avoid random assignment.
  if (best.score < 1) return null;
  return best.asset;
}

function setProjectMedia(projectLine, mediaUrl) {
  // Legacy string encoding. Prefer schema-first projects.
  let line = String(projectLine || '').trim();
  line = line.replace(/\s*\|\s*media:\s*(https?:\/\/[^\s]+|\/uploads\/[^\s]+|uploads\/[^\s]+)/ig, '');
  if (!mediaUrl) return line;
  return `${line} | media: ${mediaUrl}`;
}

function autoAssignAssetsToProjects() {
  if (!state.parsedCV || !state.assets?.length) return;
  ensureProjectObjects(state.parsedCV);
  const used = new Set((state.parsedCV.projects || []).map(p => p?.mediaUrl).filter(Boolean));
  state.parsedCV.projects = (state.parsedCV.projects || []).map((p) => {
    const proj = normalizeProjectObject(p);
    if (proj.mediaUrl) return proj;
    const asset = bestAssetForProject(proj.title || 'Project', state.assets, used);
    if (!asset) return proj;
    used.add(asset.url);
    proj.mediaUrl = asset.url;
    return proj;
  });
  // Keep the CV box in sync for transparency.
  const cvBox = qs('#cvText');
  if (cvBox && !state.manualEdit) cvBox.value = JSON.stringify(state.parsedCV, null, 2);
}

function renderMediaAssignments() {
  const wrap = qs('#mediaAssignments');
  if (!wrap) return;
  const assets = state.assets || [];
  const projects = state.parsedCV?.projects || [];
  // Banner text is managed elsewhere via setBanner.
  if (!projects.length) {
    wrap.innerHTML = '<p class="help">Generate or parse a CV first to see project assignments.</p>';
    return;
  }
  ensureProjectObjects(state.parsedCV);
  const options = ['<option value="">(none)</option>'].concat(
    assets.map(a => `<option value="${a.url}">${a.name}</option>`)
  ).join('');
  wrap.innerHTML = projects.map((p, idx) => {
    const proj = normalizeProjectObject(p);
    const title = proj.title || `Project ${idx + 1}`;
    return `
      <div class="assign-row">
        <div><strong>${title}</strong><div class="help">Card media</div></div>
        <select data-idx="${idx}">${options}</select>
        <button type="button" class="small-btn" data-clear="${idx}">Clear</button>
      </div>`;
  }).join('');
  wrap.querySelectorAll('select[data-idx]').forEach(sel => {
    const idx = Number(sel.dataset.idx);
    const proj = normalizeProjectObject(state.parsedCV.projects[idx] || {});
    sel.value = proj.mediaUrl || '';
    sel.addEventListener('change', () => {
      const url = sel.value || '';
      const cur = normalizeProjectObject(state.parsedCV.projects[idx] || {});
      cur.mediaUrl = url || null;
      state.parsedCV.projects[idx] = cur;
      const cvBox = qs('#cvText');
      if (cvBox && !state.manualEdit) cvBox.value = JSON.stringify(state.parsedCV, null, 2);
    });
  });
  wrap.querySelectorAll('button[data-clear]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.clear);
      const cur = normalizeProjectObject(state.parsedCV.projects[idx] || {});
      cur.mediaUrl = null;
      state.parsedCV.projects[idx] = cur;
      const cvBox = qs('#cvText');
      if (cvBox && !state.manualEdit) cvBox.value = JSON.stringify(state.parsedCV, null, 2);
      renderMediaAssignments();
    });
  });
}

async function exportZIP() {
  const preview = qs('#preview');
  if (!preview || preview.classList.contains('hidden')) {
    alert('Generate a portfolio first.');
    return;
  }
  // lazy-load JSZip
  if (!window.JSZip) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      s.onload = () => resolve();
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  const zip = new window.JSZip();
  let css = '';
  try { css = await (await fetch('style.css')).text(); } catch (e) {}

  const rawHtml = preview.innerHTML;
  const usedUploads = Array.from(new Set((rawHtml.match(/\/(?:uploads)\/[^"'\s)]+/g) || [])));
  let html = rawHtml;
  // rewrite /uploads/... -> assets/...
  for (const u of usedUploads) {
    const fname = u.split('/').pop();
    html = html.split(u).join(`assets/${fname}`);
  }

  const projects = (state.lastProjects || normalizeProjects(state.parsed?.projects || [])).map(p => {
    const fix = (v) => (v && typeof v === 'string') ? v.replace(/\/(?:uploads)\//g, 'assets/') : v;
    return {
      ...p,
      mediaUrl: fix(p.mediaUrl),
      posterUrl: fix(p.posterUrl),
      linkUrl: p.linkUrl,
    };
  });

  const modalMarkup = `
  <div id="projectModal" class="modal hidden" aria-hidden="true">
    <div class="modal-backdrop" data-modal-close="1"></div>
    <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
      <button type="button" class="modal-close" aria-label="Close" data-modal-close="1">×</button>
      <div class="modal-content">
        <div class="modal-media" id="modalMedia"></div>
        <div class="modal-copy">
          <h3 id="modalTitle">Project</h3>
          <div class="modal-meta" id="modalMeta"></div>
          <p class="modal-desc" id="modalDesc"></p>
          <div class="modal-actions" id="modalActions"></div>
        </div>
      </div>
    </div>
  </div>`;

  const modalScript = `
  <script>
  window.__PORTFOLIO_PROJECTS__ = ${JSON.stringify(projects || []).replace(/<\//g, '<\\/')};
  (function(){
    const qs = (s, r=document) => r.querySelector(s);
    const esc = (s) => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#39;');
    const modal = () => qs('#projectModal');
    const close = () => {
      const m = modal();
      if (!m) return;
      m.classList.add('hidden');
      m.setAttribute('aria-hidden','true');
      try { qs('#modalMedia')?.querySelector('video')?.pause?.(); } catch (e) {}
    };
    const open = (idx) => {
      const p = (window.__PORTFOLIO_PROJECTS__||[])[idx];
      const m = modal();
      if (!p || !m) return;
      qs('#modalTitle').textContent = p.title || 'Project';
      qs('#modalDesc').textContent = p.desc || '';
      const meta = [];
      if (p.year) meta.push('Year: '+p.year);
      if (p.role) meta.push('Role: '+p.role);
      if (p.tools) meta.push('Tools: '+(Array.isArray(p.tools)?p.tools.join(', '):p.tools));
      qs('#modalMeta').innerHTML = meta.map(x=>'<span>'+esc(x)+'</span>').join('');
      const mediaUrl = p.mediaUrl || p.posterUrl || '';
      const isVideo = /\.(mp4|webm|ogg|mov)(\?|#|$)/i.test(mediaUrl);
      qs('#modalMedia').innerHTML = mediaUrl ? (isVideo ? '<video controls playsinline preload="metadata" src="'+esc(mediaUrl)+'"></video>' : '<img alt="'+esc(p.title||'Project')+'" src="'+esc(mediaUrl)+'"/>') : '<div class="help">No media attached.</div>';
      const actions = [];
      if (p.linkUrl) actions.push('<a class="primary" target="_blank" rel="noopener" href="'+esc(p.linkUrl)+'">Open project link</a>');
      if (p.mediaUrl) actions.push('<a target="_blank" rel="noopener" href="'+esc(p.mediaUrl)+'">Open media</a>');
      if (p.mediaUrl) actions.push('<a download href="'+esc(p.mediaUrl)+'">Download media</a>');
      qs('#modalActions').innerHTML = actions.join('');
      m.classList.remove('hidden');
      m.setAttribute('aria-hidden','false');
    };
    document.addEventListener('click', (e) => {
      const t = e.target;
      if (!t) return;
      if (t.closest && t.closest('[data-modal-close]')) { close(); e.preventDefault(); return; }
      const link = t.closest && t.closest('.project-link');
      if (link && link.dataset && link.dataset.projectIdx != null) {
        const idx = Number(link.dataset.projectIdx);
        if (Number.isFinite(idx)) { open(idx); e.preventDefault(); return; }
      }
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  })();
  </script>`;

  const doc = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1" /><title>Portfolio</title><link rel="stylesheet" href="style.css"></head><body>${html}${modalMarkup}${modalScript}</body></html>`;

  zip.file('index.html', doc);
  zip.file('style.css', css);

  const assetsFolder = zip.folder('assets');
  for (const u of usedUploads) {
    const fname = u.split('/').pop();
    try {
      const r = await fetch(u);
      const blob = await r.blob();
      assetsFolder.file(fname, blob);
    } catch (e) {}
  }

  const out = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(out);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'portfolio.zip';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

window.exportZIP = exportZIP;

window.addEventListener('load', () => {
  if (typeof checkLLMStatus === 'function') checkLLMStatus();
  if (typeof showBuildId === 'function') showBuildId();
});

function detectMode(prompt, parsed) {
  const text = `${prompt} ${parsed?.title || ""}`.toLowerCase();
  const cinematic = cinematicKeywords.some(k => text.includes(k));
  const recruiter = includesAny(text, ["recruiter", "ats", "hiring manager", "job application"]);
  const explicitlyNoRecruiter = text.includes("no recruiter") || text.includes("not recruiter");
  // If the user explicitly asks for playful/UX, stay out of cinematic mode.
  if (includesAny(text, ["playful", "ux", "ui", "rounded", "soft colours", "soft colors"])) return "default";
  if (cinematic && (!recruiter || explicitlyNoRecruiter)) return "cinematic-dark";
  return "default";
}

function paletteFor(prompt, mode) {
  const text = (prompt || "").toLowerCase();
  const dominantColor = (() => {
    const colors = ["red", "yellow", "blue", "green", "purple", "teal", "orange", "pink"];
    const hasAccent = includesAny(text, ["accent", "accents", "highlight", "highlights", "trim"]);
    const match = colors.find(c => text.includes(c));
    if (!match) return null;
    return hasAccent ? null : match;
  })();

  if (mode === "cinematic-dark" && !dominantColor) {
    const amberAccent = includesAny(text, ["subtle amber", "amber accent", "amber highlights"]) ? "#9a6a2c" : "#a97835";
    const glowAlpha = includesAny(text, ["subtle", "muted", "low"])
      ? "rgba(154,106,44,0.12)"
      : "rgba(167,120,53,0.18)";
    return {
      base: "#0f1115",
      surface: "#151a21",
      surfaceAlt: "#1b2430",
      steel: "#425466",
      amber: amberAccent,
      text: "#f2eee8",
      textMuted: "#b9b2aa",
      border: "rgba(148,160,175,0.18)",
      glow: glowAlpha
    };
  }

  const accentMap = {
    red: "#e35a5a",
    crimson: "#d64a4a",
    yellow: "#f0c24b",
    blue: "#5a86ff",
    green: "#5ad18b",
    teal: "#4cc9b0",
    purple: "#9a6bff",
    orange: "#f08b3e",
    pink: "#ff7ac3"
  };

  const dominantPalettes = {
    red: { base: "#3a0f12", surface: "#4a1418", surfaceAlt: "#5c1c21", text: "#f7e9e9" },
    yellow: { base: "#2c250c", surface: "#3a3211", surfaceAlt: "#4b4116", text: "#f7f1e3" },
    blue: { base: "#0d1a3a", surface: "#12224a", surfaceAlt: "#1b2e5c", text: "#e6edff" },
    green: { base: "#0f2a1b", surface: "#153526", surfaceAlt: "#1c4331", text: "#e6f5ee" },
    teal: { base: "#0f2a28", surface: "#153634", surfaceAlt: "#1d4441", text: "#e6f6f4" },
    purple: { base: "#201338", surface: "#2a1a4a", surfaceAlt: "#35245f", text: "#f0e9ff" },
    orange: { base: "#2b180c", surface: "#3a2010", surfaceAlt: "#4a2a15", text: "#f7ede3" },
    pink: { base: "#2a101f", surface: "#361426", surfaceAlt: "#471a31", text: "#f9e9f1" }
  };

  const accent = Object.keys(accentMap).find(k => text.includes(k));
  const amber = accent ? accentMap[accent] : "#f0b84b";

  if (dominantColor && dominantPalettes[dominantColor]) {
    const p = dominantPalettes[dominantColor];
    return {
      base: p.base,
      surface: p.surface,
      surfaceAlt: p.surfaceAlt,
      steel: "#7a8aa2",
      amber,
      text: p.text,
      textMuted: "#d5cfc9",
      border: "rgba(255,255,255,0.08)",
      glow: accent ? "rgba(227,90,90,0.25)" : "rgba(240,184,75,0.2)"
    };
  }

  const base = text.includes("dark") ? "#0f1012" : "#f7f7f7";
  const textColor = text.includes("dark") ? "#f2f2f2" : "#1c1c1c";
  const surface = text.includes("dark") ? "#15181d" : "#ffffff";
  const surfaceAlt = text.includes("dark") ? "#1b2028" : "#f1f1f1";
  const border = text.includes("dark") ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const glow = accent ? "rgba(227,90,90,0.25)" : "rgba(240,184,75,0.25)";
  return {
    base,
    surface,
    surfaceAlt,
    steel: "#7a8aa2",
    amber,
    text: textColor,
    textMuted: text.includes("dark") ? "#b7b7b7" : "#555",
    border,
    glow
  };
}

function getProfessionFamily(parsed, prompt) {
  const text = `${parsed?.title || ""} ${prompt}`.toLowerCase();
  if (/environment artist|game artist|world builder|environment designer|cinematic artist|level artist|world building|environment art/.test(text)) {
    return "cinematic-artist";
  }
  if (/ux|ui|product designer|interaction/.test(text)) return "digital-product";
  if (/developer|engineer|frontend|full stack/.test(text)) return "developer";
  return "general";
}


function parseProjectLine(line) {
  const clean = line.replace(/^[-•]\s*/, '').trim();
  const featured = /^\s*\*/.test(line) || /\[featured\]/i.test(line);

  // Allow both external URLs and local uploaded assets (served by our local server).
  // Examples: https://... , /uploads/<file> , uploads/<file>
  const anyUrl = '(https?:\\/\\/[^\\s]+|\\/uploads\\/[^\\s]+|uploads\\/[^\\s]+)';
  const mediaMatch = clean.match(new RegExp(`media:\\s*${anyUrl}`, 'i'));
  const linkMatch = clean.match(new RegExp(`link:\\s*${anyUrl}`, 'i'));
  const posterMatch = clean.match(new RegExp(`poster:\\s*${anyUrl}`, 'i'));

  let mediaUrl = mediaMatch ? mediaMatch[1] : null;
  let linkUrl = linkMatch ? linkMatch[1] : null;
  let posterUrl = posterMatch ? posterMatch[1] : null;

  if (!mediaUrl || !linkUrl) {
    const urls = clean.match(new RegExp(anyUrl, 'g')) || [];
    if (!mediaUrl && urls.length) mediaUrl = urls[0];
    if (!linkUrl && clean.includes('->') && urls.length > 1) linkUrl = urls[1];
  }

  let scrubbed = clean
    .replace(new RegExp(`\\s*media:\\s*${anyUrl}`, 'i'), '')
    .replace(new RegExp(`\\s*link:\\s*${anyUrl}`, 'i'), '')
    .replace(new RegExp(`\\s*poster:\\s*${anyUrl}`, 'i'), '')
    .replace(new RegExp(`\\s*${anyUrl}`, 'g'), '')
    .replace(/->/g, '')
    .trim();

  const yearMatch = scrubbed.match(/\((\d{4})\)/);
  const year = yearMatch ? yearMatch[1] : '';
  const title = scrubbed.split('—')[0].replace(/\(\d{4}\)/, '').trim();
  const desc = scrubbed.includes('—') ? scrubbed.split('—')[1].trim() : 'Atmospheric environment exploration';

  return { title, year, desc, featured, mediaUrl, linkUrl, posterUrl };
}

function heroPosterArt(palette) {
  return `
    radial-gradient(circle at 30% 25%, ${palette.glow} 0%, transparent 45%),
    radial-gradient(circle at 70% 60%, rgba(59,74,94,0.55) 0%, transparent 55%),
    linear-gradient(140deg, #0e1116 0%, ${palette.surfaceAlt} 40%, #0c0f14 100%)`;
}

function projectPlaceholderArt(index, palette) {
  const variants = [
    {
      base: `linear-gradient(135deg, #0e1116 0%, ${palette.surfaceAlt} 45%, #0c0f14 100%)`,
      accent: `radial-gradient(circle at 20% 30%, ${palette.glow} 0%, transparent 55%)`
    },
    {
      base: `linear-gradient(155deg, #0b0e13 0%, ${palette.surface} 60%, #1a222d 100%)`,
      accent: `radial-gradient(circle at 70% 40%, rgba(59,74,94,0.45) 0%, transparent 60%)`
    },
    {
      base: `linear-gradient(140deg, #10141a 0%, ${palette.surfaceAlt} 50%, #121821 100%)`,
      accent: `radial-gradient(circle at 60% 65%, ${palette.glow} 0%, transparent 60%)`
    },
    {
      base: `linear-gradient(160deg, #0c0f14 0%, ${palette.surface} 55%, #19212c 100%)`,
      accent: `radial-gradient(circle at 25% 70%, rgba(59,74,94,0.5) 0%, transparent 60%)`
    }
  ];

  const overlay = `linear-gradient(180deg, rgba(0,0,0,0.25), transparent 40%)`;
  const v = variants[index % variants.length];
  return `${v.accent}, ${overlay}, ${v.base}`;
}

function getMediaFromLine(line) {
  const urlMatch = line.match(/(https?:\/\/[^\s]+|\/uploads\/[^\s]+|uploads\/[^\s]+)/i);
  if (!urlMatch) return null;
  const url = urlMatch[0];
  const isVideo = /\.(mp4|webm|ogg|mov)(\?|#|$)/i.test(url);
  return { url, isVideo };
}

function getHeroMedia(projects) {
  const items = normalizeProjects(projects || []);
  for (const p of items) {
    if (p?.featured && p?.mediaUrl) return p;
  }
  for (const p of items) {
    if (p?.mediaUrl) return p;
  }
  return null;
}

function renderCinematicHero(parsed, palette) {
  const heroInfo = getHeroMedia(parsed.projects || []);
  const heroMediaMarkup = heroInfo?.mediaUrl
    ? (/(\.mp4|\.webm|\.ogg|\.mov)(\?|#|$)/i.test(heroInfo.mediaUrl)
        ? `<video class="hero-media" src="${escapeHtml(safeMediaSrc(heroInfo.mediaUrl) || '')}" muted playsinline preload="metadata"></video><div class="video-icon pulse"><span>▶</span></div>`
        : `<img class="hero-media" src="${escapeHtml(safeMediaSrc(heroInfo.mediaUrl) || '')}" alt="Featured project" />`)
    : "";

  const contentPlan = parsed.contentPlan || {};
  const heroLabel = contentPlan.heroLabel || parsed.title || "Environment Artist";
  const heroSubtitle = contentPlan.heroSubtitle || parsed.summary;
  const heroArt = `<div class="hero-art cinematic-poster" style="--art-bg:${heroPosterArt(palette)}">${heroMediaMarkup}<div class="poster-frame"></div><div class="film-grid"></div><div class="film-noise"></div><div class="hero-cta-overlay">View Project →</div></div>`;
  const tools = topSkills((parsed.tools && parsed.tools.length ? parsed.tools : parsed.skills), 3);

  const heroHref = safeHref(heroInfo?.linkUrl) || safeHref(heroInfo?.mediaUrl) || '#selected-work';
  const heroIsHash = /^#/.test(heroHref);

  return `
  <section class="hero cinematic-hero">
      <div class="hero-copy">
      <p class="hero-label">${escapeHtml(heroLabel)}</p>
      <h1>${escapeHtml(parsed.name)}</h1>
      <p class="hero-subtitle">${escapeHtml(heroSubtitle)}</p>
      <div class="hero-cta">
        <button class="cta primary" type="button" data-action="view-work">View Selected Work</button>
        <button class="cta ghost" type="button" data-action="download-cv">Download CV</button>
      </div>
      <div class="hero-meta">
        <div class="meta-card">
          <span>Projects</span>
          <strong>${(parsed.projects || []).length || 3}</strong>
        </div>
        <div class="meta-card">
          <span>Core Tools</span>
          <strong>${escapeHtml(tools.length ? tools.join(" · ") : "Unreal · Substance · Blender")}</strong>
        </div>
        <div class="meta-card">
          <span>Location</span>
          <strong>${escapeHtml(parsed.location || "Remote")}</strong>
        </div>
      </div>
    </div>
    <a class="hero-link" href="${escapeHtml(heroHref)}" ${heroIsHash ? '' : 'target="_blank" rel="noopener"'}>${heroArt}</a>
  </section>`;
}

function renderCinematicProjects(parsed, palette) {
  const projects = normalizeProjects(parsed.projects || []);
  const contentPlan = parsed.contentPlan || {};

  const glowTones = ["rgba(167,120,53,0.18)", "rgba(59,74,94,0.28)", "rgba(120,160,190,0.2)", "rgba(180,140,80,0.18)"];
  if (!projects.length) {
    return `
  <section class="section">
    <div class="section-header">
      <h2>Selected Work</h2>
      <p>${contentPlan.selectedIntro || "Projects will appear here once provided."}</p>
    </div>
    <div class="project-grid"><p class="muted">No projects listed in CV.</p></div>
  </section>`;
  }
  const cards = projects.map((p, i) => {
    const mediaSrc = safeMediaSrc(p.mediaUrl);
    const posterSrc = safeMediaSrc(p.posterUrl);
    const mediaMarkup = p.mediaUrl
      ? (/(\.mp4|\.webm|\.ogg|\.mov)(\?|#|$)/i.test(p.mediaUrl)
          ? `<video class="project-media" src="${escapeHtml(mediaSrc || '')}" muted playsinline preload="metadata"></video><div class="video-icon pulse"><span>▶</span></div>`
          : `<img class="project-media" src="${escapeHtml(mediaSrc || '')}" alt="${escapeHtml(p.title)}" />`)
      : p.posterUrl
        ? `<img class="project-media" src="${escapeHtml(posterSrc || '')}" alt="${escapeHtml(p.title)}" />`
        : "";

    const badge = p.badge || (p.featured ? "Featured" : "Environment");
    const role = p.role || parsed.title || "Professional";
    const toolList = (parsed.tools && parsed.tools.length ? parsed.tools : parsed.skills);
    const tools = Array.isArray(p.tools)
      ? p.tools.join(", ")
      : (p.tools || topSkills(toolList, 3).join(", ") || "");

    const card = `
      <article class="project-card">
        <div class="project-visual" style="--art-bg:${projectPlaceholderArt(i, palette)};--card-glow:${glowTones[i % glowTones.length]}">
          ${mediaMarkup}
          <span class="project-badge">${escapeHtml(badge)}</span>
          <span class="project-year-tag">${escapeHtml(p.year || "")}</span>
        </div>
        <div class="project-body">
          <div class="project-head">
            <h3>${escapeHtml(p.title)}</h3>
            <span class="project-year">${escapeHtml(p.year)}</span>
          </div>
          <p>${escapeHtml(p.desc)}</p>
          <div class="project-meta">
            <span>Role: ${escapeHtml(role)}</span>
            <span>Tools: ${escapeHtml(tools)}</span>
          </div>
        </div>
      </article>`;

    const href = safeHref(p.linkUrl) || safeHref(p.mediaUrl) || safeHref(p.posterUrl);
    return href ? `<a class="project-link" data-project-idx="${i}" href="${escapeHtml(href)}" target="_blank" rel="noopener">${card}</a>` : card;
  }).join("");

  return `
  <section class="section" id="selected-work">
    <div class="section-header">
      <h2>Selected Work</h2>
      <p>${contentPlan.selectedIntro || "Visual-first projects with cinematic lighting and world-building focus."}</p>
    </div>
    <div class="project-grid">${cards}</div>
  </section>`;
}

function renderCinematicProcess(parsed) {
  const items = parsed.process.length ? parsed.process : [
    "Atmospheric lighting passes and mood exploration",
    "Modular environment kits and scale studies",
    "Scene composition and visual storytelling",
    "Unreal workflow with iterative lighting and post"
  ];
  const contentPlan = parsed.contentPlan || {};
  return `
  <section class="section process">
    <div class="section-header">
      <h2>Process</h2>
      <p>${contentPlan.processIntro || "Crafting worlds through light, structure, and narrative space."}</p>
    </div>
    <ul class="process-list">
      ${items.map(i => `<li>${i}</li>`).join("")}
    </ul>
  </section>`;
}

function renderCinematicExperience(parsed) {
  const items = parsed.experience.length ? parsed.experience : [
    "Lead Environment Artist — Black Rift Studio (2022–Present)",
    "Environment Artist — Greyline Interactive (2020–2022)"
  ];
  const contentPlan = parsed.contentPlan || {};
  return `
  <section class="section">
    <div class="section-header">
      <h2>Experience</h2>
      <p>${contentPlan.experienceIntro || "Studio experience focused on immersive environments."}</p>
    </div>
    <div class="experience-list">
      ${items.map(i => `<div class="exp-row">${i}</div>`).join("")}
    </div>
  </section>`;
}

function renderCinematicSkills(parsed) {
  const skills = parsed.skills.length ? parsed.skills : [];
  const tools = parsed.tools?.length ? parsed.tools : [];
  const languages = parsed.languages?.length ? parsed.languages : [];
  const contentPlan = parsed.contentPlan || {};
  const group = (title, items) => items.length ? `
    <div class="skill-group">
      <h3>${title}</h3>
      <div class="skill-tags">${items.map(s => `<span>${s}</span>`).join("")}</div>
    </div>` : '';
  return `
  <section class="section skills">
    <div class="section-header">
      <h2>Tools & Focus</h2>
      <p>${contentPlan.skillsIntro || "Quiet support for the work — the craft behind the scenes."}</p>
    </div>
    ${group('Tools', tools)}
    ${group('Skills', skills)}
    ${group('Languages', languages)}
  </section>`;
}

function renderCinematicPortfolio(parsed, palette) {
  const contentPlan = parsed.contentPlan || {};
  const visualPlan = parsed.visualPlan || {};
  const layout = (parsed.layout || state.layout || "auto").toLowerCase();
  const defaultOrder = ["selected", "process", "experience", "skills"];
  const layoutOrders = {
    showcase: ["selected", "process", "experience", "skills"],
    recruiter: ["experience", "skills", "selected", "process"],
    "case-study": ["selected", "process", "experience", "skills"]
  };
  const layoutBlocks = {
    selected: renderCinematicProjects(parsed, palette),
    process: renderCinematicProcess(parsed),
    experience: renderCinematicExperience(parsed),
    skills: renderCinematicSkills(parsed)
  };
  const order = parsed.sectionOrder || contentPlan.sectionOrder || layoutOrders[layout] || defaultOrder;
  const sectionMap = layoutBlocks;

  const summary = [
    "Cinematic Dark",
    visualPlan.family === "cinematic-editorial" ? "Editorial Studio" : "Studio Portfolio",
    visualPlan.layout === "split-hero" ? "Split Hero" : "Hero",
    layout !== "auto" ? layout.replace("-", " ") : "Selected Work First"
  ].join(" · ");

  const variant = visualPlan.variant || "base";
  const bgGrain = visualPlan.background?.grain ? "on" : "off";
  const bgGrid = visualPlan.background?.grid ? "on" : "off";
  const heroTreatment = visualPlan.heroTreatment || "classic";

  return `
  <div class="portfolio cinematic motion-${state.motion || "cinematic"} card-${visualPlan.cardTreatment || "standard"} ${visualPlan.spacing === "spacious" ? "spacious" : ""} layout-${layout} variant-${variant} bg-grain-${bgGrain} bg-grid-${bgGrid} hero-${heroTreatment}" style="--base:${palette.base};--surface:${palette.surface};--surface-alt:${palette.surfaceAlt};--steel:${palette.steel};--amber:${palette.amber};--text:${palette.text};--text-muted:${palette.textMuted};--border:${palette.border};--glow:${palette.glow}">
    <header class="portfolio-head">
      <div>
        <p class="summary">${summary}</p>
      </div>
    </header>
    ${renderCinematicHero(parsed, palette)}
    <div class="layout-stack">
      ${order.map(k => sectionMap[k]).join("")}
    </div>
  </div>`;
}

function renderDefault(parsed, palette) {
  const isPlayful = state.stylePreset === 'playful' || /playful/i.test(state.prompt || '');
  const contentPlan = parsed.contentPlan || {};
  const projects = normalizeProjects(parsed.projects || []);
  const skills = parsed.skills || [];
  const experience = parsed.experience || [];
  const education = parsed.education || [];

  const heroKicker = isPlayful ? (parsed.title || 'UX / Digital Media') : (parsed.title || 'Creative Portfolio');
  const heroSubtitle = isPlayful
    ? (parsed.summary || 'Playful, people-first work across interaction, motion, and immersive media.')
    : (parsed.summary || 'Selected work and experience.');

  const projectCards = projects.length
    ? projects.map((p, i) => {
        const role = p.role || parsed.title || "";
        const tools = Array.isArray(p.tools)
          ? p.tools.join(", ")
          : (p.tools || topSkills(parsed.skills || [], 3).join(", ") || "");
        const mediaSrc = safeMediaSrc(p.mediaUrl);
        const mediaMarkup = p.mediaUrl
          ? (/([.]mp4|[.]webm|[.]ogg|[.]mov)(\?|#|$)/i.test(p.mediaUrl)
              ? `<video class="project-media" src="${escapeHtml(mediaSrc || '')}" muted playsinline preload="metadata"></video><div class="video-icon pulse"><span>▶</span></div>`
              : `<img class="project-media" src="${escapeHtml(mediaSrc || '')}" alt="${escapeHtml(p.title)}" />`)
          : '';
        const card = `
      <article class="project-card">
        <div class="project-visual" style="--art-bg:${projectPlaceholderArt(i, palette)}">${mediaMarkup}</div>
        <div class="project-body">
          <div class="project-head">
            <h3>${escapeHtml(p.title)}</h3>
            <span class="project-year">${escapeHtml(p.year || "")}</span>
          </div>
          <p>${escapeHtml(p.desc)}</p>
          ${(role || tools) ? `<div class="project-meta">
            ${role ? `<span>Role: ${escapeHtml(role)}</span>` : ``}
            ${tools ? `<span>Tools: ${escapeHtml(tools)}</span>` : ``}
          </div>` : ``}
        </div>
      </article>`;

        const href = safeHref(p.linkUrl) || safeHref(p.mediaUrl) || safeHref(p.posterUrl);
        return href ? `<a class="project-link" data-project-idx="${i}" href="${escapeHtml(href)}" target="_blank" rel="noopener">${card}</a>` : card;
      }).join("")
    : "<p class=\"muted\">No projects found in your CV yet. Add a PROJECTS section (3–6 bullets) for best results.</p>";

  const expRows = experience.length ? experience.map(i => `<div class="exp-row">${escapeHtml(i)}</div>`).join("") : "";
  const cleanTag = (s) => String(s || '').replace(/\s+/g, ' ').trim().replace(/[\.,;:\/]+$/g, '');
  const tagBlacklist = [
    'microsoft word','powerpoint','excel','outlook','e-mail','email','internet',
    'adobe illustrator','illustrator','adobe photoshop','photoshop','adobe after effects','after effects',
    'premiere pro','adobe premiere pro','pro tools','fmod','unity'
  ];
  const heroTags = (skills || [])
    .map(cleanTag)
    .filter(Boolean)
    .filter(s => s.length <= 26)
    .filter(s => !tagBlacklist.includes(s.toLowerCase()))
    .slice(0, 8);

  const skillTags = skills.length ? skills.map(s => `<span>${escapeHtml(cleanTag(s))}</span>`).join("") : "";

  const layout = (parsed.layout || state.layout || "auto").toLowerCase();
  return `
  <div class="portfolio ${isPlayful ? 'playful' : ''} motion-${state.motion || 'auto'} card-${(parsed.visualPlan?.cardTreatment || "standard")} ${(parsed.visualPlan?.spacing === "spacious") ? "spacious" : ""} layout-${layout}" style="--base:${palette.base};--surface:${palette.surface};--surface-alt:${palette.surfaceAlt};--steel:${palette.steel};--amber:${palette.amber};--text:${palette.text};--text-muted:${palette.textMuted};--border:${palette.border};--glow:${palette.glow}">

    <section class="hero-lite ${isPlayful ? 'hero-playful' : ''}">
      <div class="hero-lite-copy">
        <p class="hero-kicker">${escapeHtml(heroKicker)}</p>
        <h1>${escapeHtml(parsed.name)}</h1>
        <p class="hero-subtitle">${escapeHtml(heroSubtitle)}</p>
        ${heroTags.length ? `<div class="hero-tags">${heroTags.map(s => `<span class="tag">${escapeHtml(s)}</span>`).join('')}</div>` : ''}
      </div>
      <div class="hero-lite-art" aria-hidden="true"></div>
    </section>

    <section class="section" id="selected-work">
      <div class="section-header">
        <h2>Selected Work</h2>
        <p>${contentPlan.selectedIntro || "Highlights and outcomes."}</p>
      </div>
      <div class="project-grid">${projectCards}</div>
    </section>

    <section class="section">
      <div class="section-header">
        <h2>Experience</h2>
        <p>${contentPlan.experienceIntro || "Relevant roles and impact."}</p>
      </div>
      <div class="experience-list">${expRows}</div>
    </section>

    <section class="section skills">
      <div class="section-header">
        <h2>Skills</h2>
        <p>${contentPlan.skillsIntro || "Core tools and strengths."}</p>
      </div>
      <div class="skill-tags">${skillTags}</div>
    </section>

    ${education.length ? `
    <section class="section">
      <div class="section-header">
        <h2>Education</h2>
        <p>${contentPlan.educationIntro || "Education and training."}</p>
      </div>
      <div class="experience-list">${education.map(i => `<div class="exp-row">${i}</div>`).join("")}</div>
    </section>` : ''}
  </div>`;
}

async function renderPortfolio() {
  const genBtn = qs('#generateBtn');
  const loading = qs('#loadingState');
  try {
    if (state.pdfParsing) {
      alert('PDF is still parsing. Please wait a moment, then generate again.');
      return;
    }
    // Make it obvious in the CV panel that work is happening.
    if (!state.manualEdit && state.lastUploadWasPdf) {
      setBanner('#uploadStatus', 'Upload status: using structured CV (generating portfolio…) ', 'busy');
    }
    if (genBtn) genBtn.classList.add('is-loading');
    if (loading) loading.classList.remove('hidden');
    const promptInput = (qs('#aiPrompt')?.value || '').trim();
    if (promptInput) state.prompt = promptInput;
    const cvInput = (qs('#cvText')?.value || '').trim();
    // If the textbox contains structured JSON, prefer it as the source of truth.
    const jsonFromBox = tryParseCvJson(cvInput);
    if (jsonFromBox) {
      state.parsedCV = ensureProjectObjects(jsonFromBox);
      state.lastUploadWasPdf = true;
    }
    const hasStructured = !!(state.parsedCV && typeof state.parsedCV === 'object');
    // If we have structured CV and manual edit is off, ignore textarea contents for generation.
    // Otherwise, use whatever is in the textarea/state.
    const cvSource = (hasStructured && !state.manualEdit) ? '' : (cvInput || state.cvText || '');

    if (!cvSource && !hasStructured) {
      if (state.usedSample && state.sampleActive) {
        // keep sample
      } else {
        alert('Please paste or upload your CV before generating.');
        return;
      }
    }
    const finalCV = cvSource || (state.sampleActive ? sampleCV : (hasStructured ? structuredToText(state.parsedCV) : ""));
    // For heuristics/fallbacks we want readable CV-like text even if the source is structured.
    const normalizedCV = hasStructured
      ? normalizeCvText(structuredToText(state.parsedCV))
      : (state.lastUploadWasPdf ? normalizeCvText(finalCV) : cvFromPlainText(finalCV));
    let parsed = null;
    const promptForLLM = state.revision
      ? `${state.prompt}\n\nRevision request: ${state.revision}\nReturn updated palette, motion, layout, contentPlan, visualPlan reflecting the revision.`
      : state.prompt;
    const coerceArrayStrings = (v) => Array.isArray(v) ? v.map(x => String(x || '').trim()).filter(Boolean) : [];
    const coerceProjects = (v) => Array.isArray(v)
      ? v.map(normalizeProjectObject).filter(p => p && (p.title || p.desc || p.mediaUrl || p.linkUrl))
      : [];
    const sanitizeGenerated = (gen, rawCvText) => {
      const base = (gen && typeof gen === 'object') ? { ...gen } : {};
      const heur = parseCV(normalizeCvText(rawCvText || ''));

      base.name = (base.name && String(base.name).trim()) ? base.name : heur.name;
      base.title = (base.title && String(base.title).trim()) ? base.title : heur.title;
      base.location = (base.location && String(base.location).trim()) ? base.location : heur.location;
      base.summary = (base.summary && String(base.summary).trim()) ? base.summary : heur.summary;

      base.projects = coerceProjects(base.projects);
      base.experience = coerceArrayStrings(base.experience);
      base.process = coerceArrayStrings(base.process);
      base.skills = coerceArrayStrings(base.skills);

      // Guardrails to avoid "half page" generations.
      if (!base.projects.length) base.projects = coerceProjects(heur.projects || []);
      if (!base.experience.length) base.experience = heur.experience || [];
      if (!base.skills.length) base.skills = heur.skills || [];

      // Normalize layout/motion to what the renderer/CSS expects.
      const layoutMap = { editorial: 'showcase', 'case-study': 'case-study', showcase: 'showcase', recruiter: 'recruiter', auto: 'auto' };
      const motionMap = { dynamic: 'dynamic', playful: 'playful', auto: null, none: 'subtle', subtle: 'subtle', cinematic: 'cinematic', extreme: 'extreme' };
      if (base.layout) base.layout = layoutMap[String(base.layout).toLowerCase()] || base.layout;
      if (base.motion) base.motion = motionMap[String(base.motion).toLowerCase()] || base.motion;

      // Ensure palette keys exist.
      if (!base.palette || typeof base.palette !== 'object') base.palette = {};
      return base;
    };

    if (state.useLLM || hasStructured) {
      try {
        // Use normalized CV for LLM parsing to preserve section structure.
        // Always generate from structured CV. If we don't have it yet, create it.
        let parsedCV;
        if (state.parsedCV) {
          parsedCV = ensureProjectObjects(state.parsedCV);
        } else {
          // If user is manually editing, parse that text. Otherwise parse the current textbox/state text.
          const rawText = state.manualEdit ? (cvInput || state.cvText || '') : (cvInput || state.cvText || normalizedCV || '');
          parsedCV = await llmImproveFromCV(rawText, state.prompt || '', false, false);
          parsedCV = ensureProjectObjects(parsedCV);
          state.parsedCV = parsedCV;
        }
        parsedCV = mergeFallback(parsedCV, normalizedCV);
        ensureProjectObjects(parsedCV);

        // Curate to 3–6 projects for a portfolio-friendly output (prevents “wall of cards”).
        try {
          const { overflow } = curateCvProjects(parsedCV, 6);
          if (overflow?.length) state.overflowProjects = overflow;
        } catch (e) {}

        // If we have uploaded assets, try to attach them to projects before rendering.
        autoAssignAssetsToProjects();
        renderMediaAssignments();

        // Quality gate: we want at least 3 projects for a usable portfolio.
        const projCount = Array.isArray(parsedCV.projects) ? parsedCV.projects.length : 0;
        if (state.useLLM && projCount < 3) {
          try {
            const rawText2 = state.manualEdit
              ? (cvInput || state.cvText || '')
              : (normalizedCV || cvInput || state.cvText || '');
            const strictCV = await llmImproveFromCV(rawText2, state.prompt || '', false, true);
            if (strictCV && typeof strictCV === 'object') {
              parsedCV = mergeFallback({ ...parsedCV, ...strictCV }, normalizedCV);
              ensureProjectObjects(parsedCV);
              state.parsedCV = parsedCV;
            }
          } catch (e) {
            console.warn('Strict improve pass failed', e);
          }
        }

        // If parsing looks weak, try one more improve pass on normalizedCV (best-effort).
        const weakProjects = !Array.isArray(parsedCV.projects) || parsedCV.projects.length < 2;
        const weakSummary = !parsedCV.summary || String(parsedCV.summary).trim().length < 40;
        if (state.useLLM && (weakProjects || weakSummary)) {
          try {
            const improved2 = await llmImproveFromCV(normalizedCV, state.prompt || '', false, false);
            if (improved2 && typeof improved2 === 'object') {
              parsedCV = mergeFallback({ ...parsedCV, ...improved2 }, normalizedCV);
              ensureProjectObjects(parsedCV);
              state.parsedCV = parsedCV;
            }
          } catch (e) {
            console.warn('Improve pass failed', e);
          }
        }
        // Ask LLM for style + layout plan only.
        const plan = state.useLLM ? await llmGenerate(JSON.stringify(parsedCV), promptForLLM, state.useStream) : null;
        // Merge: keep content from parsedCV, take style fields from plan.
        parsed = {
          ...parsedCV,
          motion: plan?.motion,
          palette: plan?.palette,
          layout: plan?.layout,
          sectionOrder: plan?.sectionOrder,
          contentPlan: plan?.contentPlan,
          visualPlan: plan?.visualPlan,
        };
        parsed = sanitizeGenerated(parsed, normalizedCV);
      } catch (e) {
        console.warn(e);
        parsed = hasStructured ? (state.parsedCV || parseCV(normalizedCV)) : parseCV(normalizedCV);
      }
    } else {
      parsed = parseCV(normalizedCV);
    }
    state.mode = parsed?.theme || state.stylePreset && stylePresets[state.stylePreset]?.mode || detectMode(promptForLLM, parsed);
    let planned = applyPlans(parsed, promptForLLM, state.mode);
    planned = applyRevisionPatch(planned, state.revision);
    state.parsed = planned;
    state.lastPortfolio = planned;
    state.lastProjects = normalizeProjects(planned?.projects || []);
    state.revision = "";
    state.family = getProfessionFamily(planned, state.prompt);
    const basePalette = state.stylePreset && stylePresets[state.stylePreset]?.palette ? stylePresets[state.stylePreset].palette : paletteFor(promptForLLM, state.mode);
    const mergedPalette = planned?.palette ? { ...basePalette, ...planned.palette } : basePalette;
    state.palette = mergedPalette;
    const presetMotion = (state.stylePreset && stylePresets[state.stylePreset]?.motion) || null;
    const wantsReducedMotion = /reduce motion|less motion|no motion|no animation|no animations|static|calm|minimal|clean|professional|recruiter/i.test(promptForLLM || "");
    const wantsPlayfulMotion = /playful|fun|bouncy/i.test(promptForLLM || "");
    const wantsMoreMotion = /dynamic|reactive|interactive|more animations|more motion|energetic/i.test(promptForLLM || "");

    // Respect explicit UI choice first. Only infer motion when user left it on "auto".
    let nextMotion = planned?.motion || presetMotion || state.motion || 'auto';
    if ((state.motion === 'auto' || !state.motion) && !planned?.motion && !presetMotion) {
      if (wantsReducedMotion) nextMotion = 'subtle';
      else if (wantsPlayfulMotion) nextMotion = 'playful';
      else if (wantsMoreMotion) nextMotion = 'dynamic';
      else nextMotion = 'auto';
    }
    state.motion = nextMotion;

    // Sync UI controls to the computed plan (prevents confusing mismatches after LLM output).
    try {
      const ms = qs('#motionSelect');
      if (ms && Array.from(ms.options || []).some(o => o.value === state.motion)) ms.value = state.motion;
    } catch (e) {}
    try {
      const ls = qs('#layoutSelect');
      const lay = String(planned?.layout || state.layout || ls?.value || 'auto');
      if (ls && Array.from(ls.options || []).some(o => o.value === lay)) ls.value = lay;
      state.layout = lay;
    } catch (e) {}

    let html = "";
    if (state.mode === "cinematic-dark") {
      html = renderCinematicPortfolio(planned, state.palette);
      qs("#themeInfo").textContent = "Cinematic Dark";
      qs("#layoutInfo").textContent = planned?.visualPlan?.layout === "split-hero" ? "Editorial Split Hero" : "Hero";
      qs("#motionInfo").textContent = state.motion || "auto";
    } else {
      html = renderDefault(planned, state.palette);
      qs("#themeInfo").textContent = "Default";
      qs("#layoutInfo").textContent = String(planned?.layout || state.layout || 'auto');
      qs("#motionInfo").textContent = state.motion || "auto";
    }

    qs("#extractInfo").textContent = planned.title;

    // Full-width output (preferred UX)
    const outSection = qs('#outputSection');
    const outPreview = qs('#outputPreview');
    if (outPreview) outPreview.innerHTML = html;
    if (outSection) outSection.classList.remove('hidden');

    // Keep the sidebar preview hidden to avoid a cramped "review box" render.
    const sidebarPreview = qs('#preview');
    if (sidebarPreview) {
      sidebarPreview.innerHTML = "";
      sidebarPreview.classList.add('hidden');
    }
    qs("#emptyState").classList.add("hidden");

    // Enable exports only after we have something to export.
    try {
      const ex = qs('#exportBtn');
      const ez = qs('#exportZipBtn');
      if (ex) ex.disabled = false;
      if (ez) ez.disabled = false;
    } catch (e) {}

    // Expand refine panel once we have a first draft.
    try {
      const refine = qs('#refinePanel');
      if (refine && refine instanceof HTMLDetailsElement) refine.open = true;
    } catch (e) {}

    // Re-bind any video hover/visibility handlers to the new markup.
    hoverVideoControl();
    observeVideos();
    initInteractiveTone();

    // Update pre-flight based on the newly structured CV.
    renderPreflight();

    // Jump to the generated portfolio at the bottom of the page (matches earlier UX).
    const scrollTarget = outSection || outPreview;
    if (scrollTarget?.scrollIntoView) {
      scrollTarget.scrollIntoView({ behavior: (state.motion === 'subtle' ? 'auto' : 'smooth'), block: 'start' });
    }

    qs("#aiLog").innerHTML = `
      ${state.buildId ? `<p class="help">Build: ${state.buildId}</p>` : ''}
      <p><strong>Mode:</strong> ${state.mode}</p>
      <p><strong>Family:</strong> ${state.family}</p>
      <p><strong>Palette:</strong> ${state.palette?.base || 'Default'}</p>
      <p><strong>Motion:</strong> ${state.motion}</p>
      <p><strong>LLM:</strong> ${state.useLLM ? 'on' : 'off'}</p>
      <p><strong>Revision:</strong> ${state.revision || '—'}</p>
      <p><strong>Structured CV:</strong> ${state.parsedCV ? 'yes' : 'no'}</p>
      <p><strong>Projects:</strong> ${(state.parsedCV?.projects || []).length}</p>`;
    const dbg = qs('#parsedDebug');
    if (dbg) dbg.textContent = JSON.stringify(parsed, null, 2);
  } finally {
    if (genBtn) genBtn.classList.remove('is-loading');
    if (loading) loading.classList.add('hidden');
    // If we were showing a busy banner, resolve it.
    const up = qs('#uploadStatus');
    if (up && up.dataset?.kind === 'busy') {
      setBanner(up, up.textContent || 'Upload status: ready', 'ok');
    }
  }
}

function init() {
  const preview = qs("#preview");
  if (preview) {
    preview.innerHTML = "";
    preview.classList.add("hidden");
  }
  const emptyState = qs("#emptyState");
  if (emptyState) emptyState.classList.remove("hidden");

  // Hide the full-width output area until we generate.
  try {
    qs('#outputSection')?.classList.add('hidden');
  } catch (e) {}

  const useSample = () => {
    const cvBox = qs("#cvText");
    if (cvBox) cvBox.value = sampleCV;
    state.cvText = sampleCV;
    state.usedSample = true;
  };
  qs("#useSampleBtn")?.addEventListener("click", useSample);
  qs("#emptySampleBtn")?.addEventListener("click", useSample);

  qs('#demoBtn')?.addEventListener('click', () => runDemoMode());
  qs('#baselineBtn')?.addEventListener('click', () => runBaselineMode());

  // If the textarea somehow contains demo JSON (e.g., from a previous run), clear it.
  const cvBoxInit = qs('#cvText');
  if (cvBoxInit && looksLikeDemoCVJson(cvBoxInit.value)) {
    cvBoxInit.value = '';
    state.cvText = '';
    state.parsedCV = null;
    state.lastUploadWasPdf = false;
  }

  const cvBox = qs('#cvText');
  const manualToggle = qs('#manualEditToggle');
  const cvSourceNote = qs('#cvSourceNote');

  const setCvSourceNote = (txt) => { if (cvSourceNote) cvSourceNote.textContent = `CV source: ${txt}`; };
  setCvSourceNote('—');

  // Make initial statuses visible and consistent.
  setBanner('#uploadStatus', 'Upload status: —', 'idle');
  setBanner('#mediaStatus', `Media: ${(state.assets || []).length ? `${state.assets.length} file(s) uploaded` : '—'}`, 'idle');
  setBanner('#preflightStatus', 'Portfolio readiness: —', 'idle');
  renderPreflight();

  // Exports should only be available after a portfolio exists.
  try {
    const ex = qs('#exportBtn');
    const ez = qs('#exportZipBtn');
    if (ex) ex.disabled = true;
    if (ez) ez.disabled = true;
  } catch (e) {}

  const setManualEdit = (on) => {
    state.manualEdit = !!on;
    // Lock the textarea only when we already have structured CV.
    if (cvBox) cvBox.readOnly = (!!state.parsedCV && !state.manualEdit);
    if (!state.manualEdit) {
      // Leaving manual mode: do not treat textarea as source of truth.
      // (parsedCV remains the source if present)
    }
  };

  // Initial lock state.
  setManualEdit(false);

  if (manualToggle) {
    manualToggle.addEventListener('change', (e) => {
      setManualEdit(e.target.checked);
      setCvSourceNote(state.manualEdit ? 'manual text (will be re-parsed on generate)' : (state.lastUploadWasPdf ? 'PDF parsed (structured)' : state.parsedCV ? 'structured' : '—'));
    });
  }

  if (cvBox) {
    cvBox.addEventListener('input', (e) => {
      state.cvText = e.target.value;
      // Any edit to the raw CV invalidates structured CV until we re-parse on generate.
      state.parsedCV = null;
      state.lastUploadWasPdf = false;
      renderPreflight();
    });
  }
  const cvFile = qs("#cvFile");
  const cvDropZone = qs('#cvDropZone');

  const processCvFile = async (file) => {
    if (!file) return;

    // Keep the original file so the preview "Download CV" button can download it.
    // (If the user pasted text instead, we'll fall back to downloading text/JSON.)
    state.cvOriginalFile = file;
    const name = file.name?.toLowerCase() || '';

    // Always reset structured state on new upload.
    state.parsedCV = null;
    state.lastUploadWasPdf = false;
    setManualEdit(false);
    if (manualToggle) manualToggle.checked = false;

    // Guard: if the textarea contains raw PDF bytes, clear it.
    const cvBox = qs('#cvText');
    if (cvBox && /^%PDF-/m.test(cvBox.value || '')) {
      cvBox.value = '';
      state.cvText = '';
    }

    if (file.type === 'application/pdf' || name.endsWith('.pdf')) {
      try {
        setBanner('#uploadStatus', 'Upload status: extracting PDF locally…', 'busy');
        state.pdfParsing = true;
        const genBtn = qs('#generateBtn');
        if (genBtn) genBtn.disabled = true;
        const buf = await file.arrayBuffer();
        const raw = await extractPdfText(buf);
        const cleaned = cleanPdfCvText(raw);
        setBanner('#uploadStatus', 'Upload status: parsing with AI…', 'busy');
        const improved = await llmImproveFromCV(cleaned, (qs('#aiPrompt')?.value || state.prompt || ''), false);
        state.lastUploadWasPdf = true;
        state.sampleActive = false;
        state.parsedCV = ensureProjectObjects(improved);
        const pretty = state.parsedCV ? JSON.stringify(state.parsedCV, null, 2) : cleaned;
        qs('#cvText').value = pretty;
        state.cvText = pretty;
        state.rawCv = pretty;
        setCvSourceNote('PDF parsed (structured)');
        setBanner('#uploadStatus', `Upload status: PDF extracted + parsed (${String(pretty || '').length} chars)`, 'ok');
        renderPreflight();
        state.pdfParsing = false;
        if (genBtn) genBtn.disabled = false;
        return;
      } catch (err) {
        setBanner('#uploadStatus', 'Upload status: PDF parse failed', 'error');
        alert('Could not parse PDF. Please try again or paste the text manually.');
        state.pdfParsing = false;
        const genBtn = qs('#generateBtn');
        if (genBtn) genBtn.disabled = false;
        return;
      }
    }
    if (name.endsWith('.docx') || name.endsWith('.doc')) {
      setBanner('#uploadStatus', 'Upload status: DOCX not supported (please copy/paste text)', 'error');
      alert('DOCX/DOC detected. Please copy/paste the text into the box below.');
      return;
    }
    try {
      const text = await file.text();
      if (/^%PDF-/m.test(text || '')) {
        setBanner('#uploadStatus', 'Upload status: invalid text (PDF binary detected)', 'error');
        alert('This looks like a PDF binary. Please upload it as a PDF so it can be parsed properly.');
        return;
      }
      qs("#cvText").value = text;
      state.cvText = text;
      state.lastUploadWasPdf = false;
      state.parsedCV = null;
      setCvSourceNote('text (needs parse on generate)');
      setBanner('#uploadStatus', `Upload status: loaded ${file.name || 'file'} (${String(text || '').length} chars)`, 'ok');
      renderPreflight();
    } catch (err) {
      setBanner('#uploadStatus', 'Upload status: could not read file', 'error');
      alert('Could not read file. Please paste the text instead.');
    }
  };

  if (cvFile) {
    cvFile.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      await processCvFile(file);
    });
  }

  if (cvDropZone) {
    const pickCv = () => { try { cvFile?.click?.(); } catch (e) {} };

    // Important: the "Choose file" control is a <label> wrapping the hidden input.
    // Clicking it already opens the file picker natively. If we also handle the
    // drop-zone click, some browsers (notably in hosted deployments) can trigger a
    // second picker immediately after the first closes.
    cvDropZone.addEventListener('click', (e) => {
      try {
        if (e?.target?.closest?.('label') || e?.target?.closest?.('input[type="file"]')) return;
      } catch (err) {}
      pickCv();
    });

    cvDropZone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        pickCv();
      }
    });

    cvDropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      cvDropZone.classList.add('dragover');
    });
    cvDropZone.addEventListener('dragleave', () => cvDropZone.classList.remove('dragover'));
    cvDropZone.addEventListener('drop', async (e) => {
      e.preventDefault();
      cvDropZone.classList.remove('dragover');
      const file = e.dataTransfer?.files?.[0];
      await processCvFile(file);
    });
  }
  qs("#aiPrompt").addEventListener("input", (e) => { state.prompt = e.target.value; renderPreflight(); });
  qs("#layoutSelect").addEventListener("change", (e) => state.layout = e.target.value);
  qs("#layoutSelect").addEventListener("change", () => renderPreflight());
  qs("#motionSelect").addEventListener("change", (e) => state.motion = e.target.value);
  qs("#motionSelect").addEventListener("change", () => { hoverVideoControl(); observeVideos(); initInteractiveTone(); });
  const llmToggle = qs("#llmToggle");
  if (llmToggle) llmToggle.addEventListener("change", (e) => { state.useLLM = e.target.checked; checkLLMStatus(); renderPreflight(); });
  const streamToggle = qs("#streamToggle");
  if (streamToggle) streamToggle.addEventListener("change", (e) => state.useStream = e.target.checked);

  checkLLMStatus();
  setTimeout(checkLLMStatus, 1000);
  setInterval(checkLLMStatus, 15000);

  qsa("#promptChips .chip").forEach(btn => {
    btn.addEventListener("click", () => {
      // Visual selection state
      try {
        qsa('#promptChips .chip').forEach(b => {
          b.classList.toggle('is-active', b === btn);
          b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
        });
      } catch (e) {}

      qs("#aiPrompt").value = btn.dataset.prompt;
      state.prompt = btn.dataset.prompt;
      const preset = btn.dataset.preset;
      if (preset && stylePresets[preset]) {
        state.stylePreset = preset;
        state.motion = stylePresets[preset].motion;
        state.mode = stylePresets[preset].mode;
        state.palette = stylePresets[preset].palette;
      }

      renderPreflight();
    });
  });
  qsa("#revisionChips .chip").forEach(btn => {
    btn.addEventListener("click", () => {
      qs("#changeRequest").value = btn.dataset.revision;
    });
  });

  qs("#generateBtn").addEventListener("click", async () => { await renderPortfolio(); });
  qs("#applyChangeBtn").addEventListener("click", async () => {
    const change = qs("#changeRequest").value.trim();
    if (change) {
      const promptBox = qs("#aiPrompt");
      const current = (promptBox?.value || state.prompt || "").trim();
      if (promptBox) promptBox.value = current;
      state.prompt = current;
      state.revision = change;
      state.stylePreset = null;
      qs("#changeRequest").value = "";
    }
    await renderPortfolio();
  });
  qs("#regenStyleBtn").addEventListener("click", async () => { await renderPortfolio(); });
  qs("#regenContentBtn").addEventListener("click", async () => { await renderPortfolio(); });

  const exportBtn = qs("#exportBtn");
  if (exportBtn) exportBtn.addEventListener("click", async () => { await exportHTML(); });

  const exportZipBtn = qs("#exportZipBtn");
  if (exportZipBtn) exportZipBtn.addEventListener("click", async () => { await exportZIP(); });

  // Convenience: jump back to the builder controls from the generated output.
  qs('#backToBuilderBtn')?.addEventListener('click', () => {
    qs('#stepCv')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    try { qs('#cvDropZone')?.focus?.(); } catch (e) {}
  });

  const drop = qs('#dropZone');
  const picker = qs('#mediaFiles');
  const onFiles = async (fileList) => {
    const files = Array.from(fileList || []).filter(Boolean);
    if (!files.length) return;
    try {
      setBanner('#mediaStatus', 'Media: uploading…', 'busy');
      const uploaded = await uploadMediaFiles(files);
      state.assets = (state.assets || []).concat(uploaded);
      autoAssignAssetsToProjects();
      renderMediaAssignments();
      setBanner('#mediaStatus', `Media: ${state.assets.length} file(s) uploaded`, 'ok');
    } catch (e) {
      setBanner('#mediaStatus', 'Media: upload failed', 'error');
      alert('Media upload failed.');
    } finally {
      // Reset input value so selecting the same file again still triggers `change`.
      try { if (picker) picker.value = ''; } catch (e) {}
    }
  };
  if (picker) picker.addEventListener('change', (e) => onFiles(e.target.files));
  if (drop) {
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('dragover'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('dragover');
      onFiles(e.dataTransfer?.files);
    });
    // Click anywhere in the drop zone to open the picker,
    // but avoid double-opening when clicking the inner <label> (which already opens it).
    drop.addEventListener('click', (e) => {
      const t = e.target;
      if (t && (t.closest?.('label') || t.closest?.('input'))) return;
      if (!picker) return;
      try { picker.value = ''; } catch (err) {}
      picker.click();
    });
    drop.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (!picker) return;
        try { picker.value = ''; } catch (err) {}
        picker.click();
      }
    });
  }

  renderMediaAssignments();

  // GitHub import
  const ghUser = qs('#ghUser');
  // Prefill GitHub username for convenience.
  try {
    if (ghUser && !String(ghUser.value || '').trim()) ghUser.value = 'klajdi24';
  } catch (e) {}

  const ghIncludeForks = qs('#ghIncludeForks');
  const ghFetchBtn = qs('#ghFetchBtn');
  const ghImportBtn = qs('#ghImportBtn');

  ghUser?.addEventListener?.('input', () => renderPreflight());
  if (ghFetchBtn) {
    ghFetchBtn.addEventListener('click', async () => {
      try {
        const user = (ghUser?.value || '').trim();
        if (!user) {
          setBanner('#ghStatus', 'GitHub: enter a username', 'error');
          renderPreflight();
          return;
        }
        setBanner('#ghStatus', 'GitHub: fetching repos…', 'busy');
        state.ghRepos = await fetchGithubRepos(user, !!ghIncludeForks?.checked);
        renderGithubRepoList();
        setBanner('#ghStatus', `GitHub: loaded ${state.ghRepos.length} repo(s) (showing top 16)`, 'ok');
        renderPreflight();
      } catch (e) {
        setBanner('#ghStatus', `GitHub: ${String(e.message || e)}`, 'error');
        renderPreflight();
      }
    });
  }
  if (ghImportBtn) {
    ghImportBtn.addEventListener('click', async () => {
      const user = (ghUser?.value || '').trim();
      await importSelectedGithubRepos(user);
      renderPreflight();
    });
  }

  // Quality checks
  qs('#qcRunBtn')?.addEventListener('click', () => runQualityChecks());
  qs('#qcTestBtn')?.addEventListener('click', () => runCvTestSet());

  // Accessibility: keep aria-expanded in sync for native <details>/<summary> accordions.
  try {
    qsa('details').forEach(d => {
      const s = d.querySelector('summary');
      if (!s) return;
      const sync = () => s.setAttribute('aria-expanded', d.open ? 'true' : 'false');
      sync();
      d.addEventListener('toggle', sync);
    });
  } catch (e) {}

  hoverVideoControl();
  observeVideos();
  initInteractiveTone();
}

let __interactiveToneHandler = null;
function initInteractiveTone() {
  const preview = qs('#preview');
  if (!preview) return;

  if (!__interactiveToneHandler) {
    __interactiveToneHandler = () => {
      const el = qs('#preview');
      if (!el) return;
      // Only apply the cinematic "tone drift" when the generated portfolio is cinematic
      // and the user opted into stronger motion. Otherwise it reads as random/unprofessional.
      const hasCinematic = !!el.querySelector('.portfolio.cinematic');
      const motion = String(window.state?.motion || 'auto');
      const allow = hasCinematic && (motion === 'extreme');
      if (!allow) {
        el.style.removeProperty('--tone-shift');
        el.style.removeProperty('--hue-shift');
        return;
      }
      const max = Math.max(1, el.scrollHeight - el.clientHeight);
      const ratio = Math.min(1, Math.max(0, el.scrollTop / max));
      const tone = 0.88 + ratio * 0.12;
      el.style.setProperty('--tone-shift', tone.toFixed(2));
      // Keep hue locked (no colour shifting).
      el.style.setProperty('--hue-shift', `0deg`);
    };
    preview.addEventListener('scroll', __interactiveToneHandler, { passive: true });
  }

  __interactiveToneHandler();
}

// Videos in project cards should not autoplay. If the user chose a higher-motion
// profile, we can play videos on hover/focus, and pause them when off-screen.
function hoverVideoControl() {
  const preview = qs('#preview');
  if (!preview) return;
  const motion = String(window.state?.motion || 'auto');
  const allow = (motion === 'dynamic' || motion === 'playful' || motion === 'extreme');
  const cards = preview.querySelectorAll('.project-link, .hero-link');
  cards.forEach((card) => {
    if (!card || card.dataset?.hoverBound === '1') return;
    const v = card.querySelector('video.project-media, video.hero-media');
    if (!v) return;
    try { v.pause(); } catch (e) {}
    card.dataset.hoverBound = '1';
    card.addEventListener('pointerenter', async () => {
      if (!allow) return;
      try { await v.play(); } catch (e) {}
    });
    card.addEventListener('pointerleave', () => {
      try { v.pause(); } catch (e) {}
      try { v.currentTime = 0; } catch (e) {}
    });
    card.addEventListener('focusin', async () => {
      if (!allow) return;
      try { await v.play(); } catch (e) {}
    });
    card.addEventListener('focusout', () => {
      try { v.pause(); } catch (e) {}
    });
  });
}

let __videoObserver = null;
function observeVideos() {
  const preview = qs('#preview');
  if (!preview) return;
  if (!('IntersectionObserver' in window)) return;

  if (!__videoObserver) {
    __videoObserver = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const v = e.target;
        if (!v) continue;
        if (!e.isIntersecting) {
          try { v.pause(); } catch (err) {}
        }
      }
    }, { root: preview, threshold: 0.15 });
  }

  preview.querySelectorAll('video.project-media, video.hero-media').forEach(v => {
    try { __videoObserver.observe(v); } catch (e) {}
  });
}

function triggerDownload(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'download';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function downloadCV() {
  try {
    const f = state.cvOriginalFile;
    if (f && typeof File !== 'undefined' && f instanceof File) {
      const url = URL.createObjectURL(f);
      triggerDownload(url, f.name || 'cv');
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      return;
    }

    // Fall back to downloading whatever we currently have.
    if (state.parsedCV && typeof state.parsedCV === 'object') {
      const blob = new Blob([JSON.stringify(state.parsedCV, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      triggerDownload(url, 'cv.json');
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      return;
    }

    const txt = (qs('#cvText')?.value || state.cvText || '').trim();
    const blob = new Blob([txt || ''], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    triggerDownload(url, 'cv.txt');
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  } catch (e) {
    alert('Could not download CV.');
  }
}

window.downloadCV = downloadCV;

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeHref(href) {
  const h = String(href || '').trim();
  if (!h) return null;
  if (h.startsWith('#')) return h;
  if (h.startsWith('/uploads/')) return h;
  if (h.startsWith('assets/')) return h;
  if (/^https?:\/\//i.test(h)) return h;
  return null;
}

function safeMediaSrc(src) {
  const h = String(src || '').trim();
  if (!h) return null;
  if (h.startsWith('/uploads/')) return h;
  if (h.startsWith('assets/')) return h;
  if (/^https?:\/\//i.test(h)) return h;
  return null;
}

function niceRepoTitle(name = '') {
  return String(name || '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

async function fetchGithubRepos(username, includeForks = false) {
  const user = String(username || '').trim();
  if (!user) throw new Error('Missing GitHub username');
  const url = `https://api.github.com/users/${encodeURIComponent(user)}/repos?per_page=100&sort=updated`;
  const res = await fetch(url, {
    headers: {
      'Accept': 'application/vnd.github+json'
    }
  });
  if (!res.ok) throw new Error(`GitHub request failed (${res.status})`);
  const repos = await res.json();
  const cleaned = (Array.isArray(repos) ? repos : [])
    .filter(r => r && typeof r === 'object')
    .filter(r => includeForks ? true : !r.fork)
    .filter(r => !r.archived)
    .map(r => ({
      id: r.id,
      name: r.name,
      full_name: r.full_name,
      html_url: r.html_url,
      homepage: r.homepage,
      description: r.description,
      language: r.language,
      stargazers_count: r.stargazers_count || 0,
      forks_count: r.forks_count || 0,
      pushed_at: r.pushed_at || '',
      updated_at: r.updated_at || ''
    }));

  // Rank: stars first, then recency.
  cleaned.sort((a, b) => {
    if ((b.stargazers_count || 0) !== (a.stargazers_count || 0)) return (b.stargazers_count || 0) - (a.stargazers_count || 0);
    return String(b.pushed_at || b.updated_at || '').localeCompare(String(a.pushed_at || a.updated_at || ''));
  });

  // Best-effort pinned repos (server scrapes the profile page).
  try {
    const pr = await fetch(`/api/github/pinned?user=${encodeURIComponent(user)}`);
    const pj = await pr.json();
    if (pj?.ok && Array.isArray(pj.pinned) && pj.pinned.length) {
      state.ghPinned = pj.pinned;
      const pinnedSet = new Set(pj.pinned.map(n => String(n).toLowerCase()));
      const pinned = [];
      const rest = [];
      for (const r of cleaned) {
        if (pinnedSet.has(String(r.name).toLowerCase())) pinned.push(r);
        else rest.push(r);
      }
      // Preserve pinned order if possible.
      pinned.sort((a, b) => pj.pinned.indexOf(a.name) - pj.pinned.indexOf(b.name));
      return pinned.concat(rest);
    }
  } catch (e) {
    // ignore
  }

  return cleaned;
}

function renderGithubRepoList() {
  const wrap = qs('#ghRepoList');
  if (!wrap) return;
  const repos = state.ghRepos || [];
  const pinnedSet = new Set((state.ghPinned || []).map(n => String(n).toLowerCase()));
  if (!repos.length) {
    wrap.innerHTML = '<p class="help">No repos loaded yet.</p>';
    return;
  }
  wrap.innerHTML = repos.slice(0, 16).map((r, idx) => {
    const checked = (pinnedSet.has(String(r.name).toLowerCase()) || idx < 6) ? 'checked' : '';
    const meta = [
      r.language ? r.language : null,
      (r.stargazers_count ? `${r.stargazers_count}★` : null),
      (r.pushed_at ? `updated ${String(r.pushed_at).slice(0,10)}` : null),
    ].filter(Boolean).join(' · ');
    return `
      <label class="toggle" style="display:flex; gap:10px; align-items:flex-start; justify-content:space-between; padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.06);">
        <span style="display:flex; gap:10px; align-items:flex-start;">
          <input type="checkbox" data-gh-idx="${idx}" ${checked} />
          <span>
            <strong>${escapeHtml(r.name)}</strong>
            <div class="help" style="margin-top:4px;">${escapeHtml(r.description || meta || r.html_url)}</div>
          </span>
        </span>
      </label>`;
  }).join('');
}

async function fetchGithubReadmeSummary(fullName) {
  try {
    const fn = String(fullName || '').trim();
    if (!fn.includes('/')) return null;
    const res = await fetch(`https://api.github.com/repos/${fn}/readme`, {
      headers: { 'Accept': 'application/vnd.github+json' }
    });
    if (!res.ok) return null;
    const j = await res.json();
    if (j && j.download_url) {
      // Prefer UTF-8 text (avoids base64/encoding issues).
      const t = await fetch(j.download_url);
      if (!t.ok) return null;
      const txt = await t.text();
      const lines = txt.split('\n').map(l => l.trim()).filter(Boolean);
      const first = lines.find(l => !l.startsWith('#') && !/^!\[/.test(l) && !/^\[!\[/.test(l) && l.length > 20);
      if (!first) return null;
      return first.replace(/\s+/g, ' ').replace(/<[^>]+>/g, '').slice(0, 180);
    }
    const b64 = String(j.content || '').replace(/\n/g, '').trim();
    if (!b64) return null;
    const txt = atob(b64);
    const lines = txt.split('\n').map(l => l.trim()).filter(Boolean);
    // Skip headings/badges.
    const first = lines.find(l => !l.startsWith('#') && !/^!\[/.test(l) && !/^\[!\[/.test(l) && l.length > 20);
    if (!first) return null;
    return first.replace(/\s+/g, ' ').replace(/<[^>]+>/g, '').slice(0, 180);
  } catch (e) {
    return null;
  }
}

async function importSelectedGithubRepos(username) {
  const wrap = qs('#ghRepoList');
  if (!wrap) return;
  const selectedIdx = Array.from(wrap.querySelectorAll('input[type="checkbox"][data-gh-idx]'))
    .filter(cb => cb.checked)
    .map(cb => Number(cb.dataset.ghIdx))
    .filter(n => Number.isFinite(n));

  const picked = selectedIdx.map(i => state.ghRepos?.[i]).filter(Boolean);
  if (!picked.length) {
    setBanner('#ghStatus', 'GitHub: no repos selected', 'error');
    return;
  }

  setBanner('#ghStatus', 'GitHub: building projects from repos…', 'busy');

  const cv = state.parsedCV && typeof state.parsedCV === 'object'
    ? state.parsedCV
    : { name: '', title: '', location: '', summary: '', projects: [], experience: [], process: [], skills: [], tools: [], languages: [], education: [] };

  ensureProjectObjects(cv);

  const newProjects = [];
  for (const r of picked.slice(0, 12)) {
    const summary = (!r.description) ? await fetchGithubReadmeSummary(r.full_name) : null;
    const rawDesc = r.description || summary || `Built and maintained ${r.name}.`;
    const desc = String(rawDesc || '').replace(/\s+/g, ' ').trim().slice(0, 240);
    newProjects.push(normalizeProjectObject({
      title: niceRepoTitle(r.name),
      year: (r.pushed_at || r.updated_at || '').slice(0, 4),
      desc,
      tools: [r.language].filter(Boolean),
      linkUrl: r.homepage || r.html_url,
      mediaUrl: null,
      featured: false,
    }));
  }

  // Merge, dedupe by title.
  const existing = (cv.projects || []).map(normalizeProjectObject);
  const byTitle = new Map();
  for (const p of existing.concat(newProjects)) {
    const key = String(p.title || '').toLowerCase().trim();
    if (!key) continue;
    if (!byTitle.has(key)) byTitle.set(key, p);
  }
  cv.projects = Array.from(byTitle.values());

  // Curate to a portfolio-friendly number of projects.
  try {
    const { overflow } = curateCvProjects(cv, 6);
    if (overflow?.length) state.overflowProjects = overflow;
  } catch (e) {}

  state.parsedCV = cv;
  state.lastUploadWasPdf = false;
  const cvBox = qs('#cvText');
  if (cvBox && !state.manualEdit) cvBox.value = JSON.stringify(state.parsedCV, null, 2);
  renderMediaAssignments();
  const overflowCount = Array.isArray(state.overflowProjects) ? state.overflowProjects.length : 0;
  setBanner('#ghStatus', `GitHub: imported ${newProjects.length} repo(s) as projects${overflowCount ? ` (curated to 6, ${overflowCount} hidden)` : ''}`, 'ok');
  renderPreflight();

  // Collapse the repo list into a compact summary so it doesn't dominate the flow.
  try {
    const who = username ? `from @${username}` : '';
    wrap.innerHTML = `
      <div class="help" style="display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px; border:1px solid #1f2330; border-radius:12px; background: rgba(255,255,255,0.02);">
        <div><strong>Imported ${newProjects.length}</strong> repo(s) ${escapeHtml(who)}.</div>
        <button type="button" class="small-btn" id="ghChangeBtn">Change selection</button>
      </div>`;
  } catch (e) {}
}

function runQualityChecks() {
  const out = qs('#qcOut');
  const cv = state.parsedCV && typeof state.parsedCV === 'object' ? ensureProjectObjects(state.parsedCV) : null;
  if (!cv) {
    if (out) out.textContent = 'No structured CV yet. Generate once, then run checks again.';
    return;
  }
  const projects = (cv.projects || []).map(normalizeProjectObject);
  const hasSummary = (cv.summary && String(cv.summary).trim().length >= 60);
  const projectCount = projects.length;
  const withMedia = projects.filter(p => !!p.mediaUrl).length;
  const withLinks = projects.filter(p => !!p.linkUrl).length;
  const withDesc = projects.filter(p => String(p.desc || '').trim().length >= 40).length;

  const lines = [];
  const ok = (label, pass, detail='') => lines.push(`${pass ? '[OK]' : '[FIX]'} ${label}${detail ? ` — ${detail}` : ''}`);
  ok('Summary length', hasSummary, hasSummary ? 'good' : 'aim for 2–3 lines (60+ chars)');
  ok('Projects extracted', projectCount >= 3, `${projectCount} found (target 3–6)`);
  ok('Projects with descriptions', withDesc >= Math.min(3, projectCount), `${withDesc}/${projectCount} have solid desc`);
  ok('Projects with links', withLinks >= 1, `${withLinks}/${projectCount} have linkUrl`);
  ok('Projects with media', withMedia >= 1, `${withMedia}/${projectCount} have mediaUrl`);
  ok('Export ready', true, 'generate → verify modal works → export');

  if (out) out.textContent = lines.join('\n');
}

function runCvTestSet() {
  const out = qs('#qcOut');
  const tests = [
    window.sampleCV,
    `Jane Example\nUX Designer\n\nSummary\nProduct designer focused on accessibility.\n\nProjects\n- Onboarding Redesign (2024) — Increased activation by 12%. Tools: Figma, GA4\n- Design System (2023) — Built components library. Tools: Figma\n\nSkills\nFigma, Prototyping, Research`,
    `ALI SMITH\nCREATIVE DEVELOPER\n\nPROJECTS\nInteractive Music Visualiser — WebGL audio-reactive visuals. Tools: Three.js\nAR Poster — mobile AR activation. Tools: Unity\n\nEXPERIENCE\nFreelance (2022-Present)`,
    `No headings just text. Built a VR world in Unity with triggers and animation. Also made an interactive website.\nLinks: https://github.com/example/repo`,
  ];
  const rows = tests.map((t, i) => {
    const parsed = parseCV(normalizeCvText(String(t || '')));
    const projCount = (parsed.projects || []).length;
    return `Test ${i + 1}: projects=${projCount}, experience=${(parsed.experience||[]).length}, skills=${(parsed.skills||[]).length}`;
  });
  if (out) out.textContent = rows.join('\n');
}

function openProjectModal(idx) {
  const modal = qs('#projectModal');
  if (!modal) return;
  const p = (state.lastProjects || [])[idx];
  if (!p) return;

  const titleEl = qs('#modalTitle');
  const mediaEl = qs('#modalMedia');
  const metaEl = qs('#modalMeta');
  const descEl = qs('#modalDesc');
  const actionsEl = qs('#modalActions');

  if (titleEl) titleEl.textContent = p.title || 'Project';
  if (descEl) descEl.textContent = p.desc || '';

  const meta = [];
  if (p.year) meta.push(`Year: ${p.year}`);
  if (p.role) meta.push(`Role: ${p.role}`);
  if (p.tools) meta.push(`Tools: ${Array.isArray(p.tools) ? p.tools.join(', ') : p.tools}`);
  if (metaEl) metaEl.innerHTML = meta.map(m => `<span>${escapeHtml(m)}</span>`).join('');

  const mediaUrl = p.mediaUrl || p.posterUrl || '';
  const isVideo = /\.(mp4|webm|ogg|mov)(\?|#|$)/i.test(mediaUrl);
  if (mediaEl) {
    mediaEl.innerHTML = mediaUrl
      ? (isVideo
          ? `<video src="${escapeHtml(mediaUrl)}" controls playsinline preload="metadata"></video>`
          : `<img src="${escapeHtml(mediaUrl)}" alt="${escapeHtml(p.title || 'Project')}" />`)
      : `<div class="help">No media attached to this project yet.</div>`;
  }

  const actions = [];
  if (p.linkUrl) actions.push(`<a class="primary" href="${escapeHtml(p.linkUrl)}" target="_blank" rel="noopener">Open project link</a>`);
  if (p.mediaUrl) actions.push(`<a href="${escapeHtml(p.mediaUrl)}" target="_blank" rel="noopener">Open media</a>`);
  if (p.mediaUrl) actions.push(`<a href="${escapeHtml(p.mediaUrl)}" download>Download media</a>`);
  if (actionsEl) actionsEl.innerHTML = actions.join('');

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
}

function closeProjectModal() {
  const modal = qs('#projectModal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  const mediaEl = qs('#modalMedia');
  // Stop video playback when closing.
  try { mediaEl?.querySelector('video')?.pause?.(); } catch (e) {}
}



injectInlineCSS();
window.addEventListener('DOMContentLoaded', init);
if (document.readyState !== 'loading') init();
window.exportHTML = exportHTML;

// safety: delegated clicks if listeners fail
document.addEventListener('click', (e) => {
  const t = e.target;
  if (!t) return;

  if (t.id === 'ghChangeBtn') {
    renderGithubRepoList();
    e.preventDefault();
    return;
  }

  // Pre-flight actions
  const pre = t.closest?.('[data-preflight-action]');
  const pa = pre?.dataset?.preflightAction;
  if (pa) {
    if (pa === 'open-cv') {
      qs('#stepCv')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
      try { qs('#cvDropZone')?.focus?.(); } catch (e) {}
      e.preventDefault();
      return;
    }
    if (pa === 'open-prompt') {
      qs('#stepStyle')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
      try { qs('#aiPrompt')?.focus?.(); } catch (e) {}
      e.preventDefault();
      return;
    }
    if (pa === 'open-generate') {
      qs('#stepGenerate')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
      try { qs('#generateBtn')?.focus?.(); } catch (e) {}
      e.preventDefault();
      return;
    }
    if (pa === 'generate') {
      renderPortfolio();
      e.preventDefault();
      return;
    }

    const advanced = qs('#advancedPanel');
    if (advanced && advanced instanceof HTMLDetailsElement) advanced.open = true;
    if (pa === 'open-advanced') {
      advanced?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
      e.preventDefault();
      return;
    }
    if (pa === 'open-github') {
      qs('#githubPanel')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
      e.preventDefault();
      return;
    }
    if (pa === 'open-media') {
      qs('#mediaPanel')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
      e.preventDefault();
      return;
    }
  }

  // Modal close
  if (t.closest?.('[data-modal-close]')) {
    closeProjectModal();
    e.preventDefault();
    return;
  }

  // Project card click: open modal instead of navigating/downloading media.
  const projectLink = t.closest?.('.project-link');
  if (projectLink?.dataset?.projectIdx != null) {
    const idx = Number(projectLink.dataset.projectIdx);
    if (Number.isFinite(idx)) {
      openProjectModal(idx);
      e.preventDefault();
      return;
    }
  }

  // Preview actions (generated portfolio)
  const actionEl = t.closest?.('[data-action]');
  const action = actionEl?.dataset?.action;
  if (action === 'view-work') {
    const root = qs('#outputPreview') || qs('#preview');
    const anchor = root?.querySelector?.('#selected-work');
    if (anchor) anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
    e.preventDefault();
    return;
  }
  if (action === 'download-cv') {
    downloadCV();
    e.preventDefault();
    return;
  }

  if (t.id === 'useSampleBtn' || t.id === 'emptySampleBtn') {
    const cvBox = qs('#cvText');
    if (cvBox) cvBox.value = sampleCV;
    state.cvText = sampleCV;
    state.rawCv = sampleCV;
    state.usedSample = true;
    state.sampleActive = true;
  }
  if (t.classList?.contains('chip') && t.dataset?.prompt) {
    qs('#aiPrompt').value = t.dataset.prompt;
    state.prompt = t.dataset.prompt;
  }
  if (t.id === 'generateBtn') {
    renderPortfolio();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeProjectModal();
});
