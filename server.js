const http = require('http');
const fs = require('fs');
const path = require('path');
const { Buffer } = require('buffer');
const { spawn, spawnSync } = require('child_process');
const { Readable } = require('stream');
const Busboy = require('busboy');

function loadEnv() {
  const candidates = [
    path.join(__dirname, '.env.local'),
    path.join(__dirname, '..', '.env.local'),
    path.join(process.cwd(), '.env.local')
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, 'utf8');
      content.split('\n').forEach(line => {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m) {
          const key = m[1];
          let val = m[2] || '';
          if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
          if (!process.env[key]) process.env[key] = val;
        }
      });
      return;
    }
  }
}

loadEnv();


function repairJson(str) {
  const match = str.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let s = match[0];
  s = s.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
  return s;
}

// Very small multipart/form-data parser.
function parseMultipart(req, boundary) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try {
        const buf = Buffer.concat(chunks);
        const b = Buffer.from(`--${boundary}`);
        const parts = [];
        let start = buf.indexOf(b);
        while (start !== -1) {
          start += b.length;
          // end boundary
          if (buf[start] === 45 && buf[start + 1] === 45) break;
          // skip leading CRLF
          if (buf[start] === 13 && buf[start + 1] === 10) start += 2;
          const end = buf.indexOf(b, start);
          if (end === -1) break;
          const part = buf.slice(start, end - 2); // strip trailing CRLF
          parts.push(part);
          start = end;
        }
        const out = {};
        for (const part of parts) {
          const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));
          if (headerEnd === -1) continue;
          const header = part.slice(0, headerEnd).toString('utf8');
          const body = part.slice(headerEnd + 4);
          const nameMatch = header.match(/name="([^"]+)"/);
          const filenameMatch = header.match(/filename="([^"]*)"/);
          const ctMatch = header.match(/Content-Type:\s*([^\r\n]+)/i);
          const name = nameMatch ? nameMatch[1] : null;
          if (!name) continue;
          if (filenameMatch) {
            const entry = { filename: filenameMatch[1], contentType: ctMatch ? ctMatch[1].trim() : 'application/octet-stream', data: body };
            if (out[name]) {
              out[name] = Array.isArray(out[name]) ? out[name].concat([entry]) : [out[name], entry];
            } else {
              out[name] = entry;
            }
          } else {
            out[name] = body.toString('utf8');
          }
        }
        resolve(out);
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function parseIntSafe(v, fallback) {
  const n = parseInt(String(v || ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

const MAX_UPLOAD_BYTES = parseIntSafe(process.env.MAX_UPLOAD_BYTES, 25 * 1024 * 1024); // 25MB
const MAX_PDF_BYTES = parseIntSafe(process.env.MAX_PDF_BYTES, 12 * 1024 * 1024); // 12MB

function streamMultipartToDisk(req, { maxFileBytes, maxFiles = 12 } = {}) {
  return new Promise((resolve, reject) => {
    const bb = Busboy({
      headers: req.headers,
      limits: {
        files: maxFiles,
        fileSize: maxFileBytes,
        fields: 50,
        fieldSize: 256 * 1024
      }
    });

    const files = [];
    const fields = {};
    const tasks = [];
    let sizeLimited = false;
    let filesLimited = false;
    let errored = false;

    bb.on('field', (name, val) => {
      // Keep only small fields; Busboy already enforces fieldSize.
      fields[name] = val;
    });

    bb.on('file', (fieldname, file, info) => {
      const filename = info?.filename || '';
      const mimeType = info?.mimeType || info?.mime || 'application/octet-stream';
      if (!filename) {
        file.resume();
        return;
      }

      const fname = safeFilename(filename);
      const id = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
      const storedName = `${id}-${fname}`;
      const outPath = path.join(UPLOADS_DIR, storedName);

      const ws = fs.createWriteStream(outPath);

      const t = new Promise((resolveTask) => {
        let done = false;

        const finishOk = () => {
          if (done) return;
          done = true;
          resolveTask({ ok: true, storedName, outPath, filename: fname, originalFilename: filename, mimeType });
        };
        const finishErr = (err) => {
          if (done) return;
          done = true;
          try { ws.destroy(); } catch (e) {}
          try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch (e) {}
          resolveTask({ ok: false, error: err ? String(err) : 'write_failed' });
        };

        file.on('limit', () => {
          sizeLimited = true;
          finishErr('file_too_large');
        });
        file.on('error', finishErr);
        ws.on('error', finishErr);
        ws.on('close', finishOk);

        file.pipe(ws);
      });

      tasks.push(t);
      files.push({ fieldname, storedName, outPath, mimeType, originalFilename: filename, safeOriginal: fname });
    });

    bb.on('filesLimit', () => { filesLimited = true; });
    bb.on('error', (e) => {
      errored = true;
      reject(e);
    });
    bb.on('finish', async () => {
      if (errored) return;
      const results = await Promise.all(tasks);
      const okFiles = results.filter(r => r && r.ok);
      const bad = results.find(r => r && !r.ok);

      if (sizeLimited) {
        return resolve({ ok: false, status: 413, error: `File too large. Max ${(maxFileBytes / (1024 * 1024)).toFixed(0)}MB.` });
      }
      if (filesLimited) {
        return resolve({ ok: false, status: 400, error: `Too many files. Max ${maxFiles}.` });
      }
      if (bad) {
        return resolve({ ok: false, status: 500, error: 'Upload failed.' });
      }
      return resolve({ ok: true, fields, files: okFiles });
    });

    req.pipe(bb);
  });
}

async function openaiChat({ apiKey, model, system, user, temperature = 0.2 }) {
  const payload = {
    model,
    temperature,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ]
  };
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content || '';
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    const repaired = repairJson(content);
    parsed = repaired ? JSON.parse(repaired) : null;
  }
  return { parsed, raw: content };
}

function safeFilename(name = 'file') {
  const base = path.basename(String(name || 'file'));
  const cleaned = base
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .replace(/-+/g, '-');
  const ext = path.extname(cleaned).slice(0, 16);
  const stem = cleaned.slice(0, Math.max(1, 80 - ext.length)).replace(/\.+$/g, '') || 'file';
  return `${stem}${ext || ''}`;
}

function contentTypeForExt(ext) {
  switch (ext) {
    case '.js': return 'text/javascript';
    case '.css': return 'text/css';
    case '.html': return 'text/html';
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.webp': return 'image/webp';
    case '.gif': return 'image/gif';
    case '.svg': return 'image/svg+xml';
    case '.mp4': return 'video/mp4';
    case '.webm': return 'video/webm';
    case '.mov': return 'video/quicktime';
    default: return 'application/octet-stream';
  }
}


const PORT = process.env.PORT || 5174;
const PUBLIC_DIR = __dirname;
const BUILD_ID = process.env.BUILD_ID || `dev-${Date.now()}`;
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads');

let HAS_FFMPEG = false;
try {
  const r = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  HAS_FFMPEG = r.status === 0;
} catch (e) {
  HAS_FFMPEG = false;
}

function isMovFile(filename = '') {
  return /\.mov$/i.test(String(filename || ''));
}

async function transcodeMovToMp4(inPath, outPath) {
  if (!HAS_FFMPEG) return false;
  return await new Promise((resolve) => {
    const args = [
      '-y',
      '-i', inPath,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      '-c:a', 'aac',
      '-b:a', '128k',
      outPath
    ];
    const p = spawn('ffmpeg', args, { stdio: 'ignore' });
    p.on('error', () => resolve(false));
    p.on('close', (code) => resolve(code === 0));
  });
}

try {
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
} catch (e) {}

const server = http.createServer(async (req, res) => {
  const parsedUrl = (() => {
    try { return new URL(req.url, 'http://127.0.0.1'); } catch (e) { return null; }
  })();
  const pathname = parsedUrl?.pathname || req.url;

  if (req.method === 'GET' && pathname === '/api/version') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ ok: true, build: BUILD_ID }));
  }
  if (req.method === 'GET' && pathname === '/api/status') {
    const hasKey = !!process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ ok: hasKey, hasKey, model }));
  }

  // GitHub helpers (public-only): pinned repos scraper.
  // This lets us approximate "pinned" without requiring auth/GraphQL.
  if (req.method === 'GET' && req.url.startsWith('/api/github/pinned')) {
    try {
      const u = new URL(req.url, 'http://127.0.0.1');
      const user = (u.searchParams.get('user') || '').trim();
      if (!user) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        return res.end(JSON.stringify({ ok: false, error: 'Missing user' }));
      }
      const resp = await fetch(`https://github.com/${encodeURIComponent(user)}`, {
        headers: { 'User-Agent': 'portfolio-generator' }
      });
      const html = await resp.text();
      // Heuristic: look for repo links in the "Pinned" section.
      const pinnedSection = html.split('Pinned').slice(1).join('Pinned').slice(0, 60_000);
      const re = new RegExp(`href=\"\\/${user}\\/([^\"\\/]+)\"`, 'gi');
      const names = [];
      let m;
      while ((m = re.exec(pinnedSection))) {
        const repo = m[1];
        if (!repo) continue;
        if (!names.includes(repo)) names.push(repo);
        if (names.length >= 12) break;
      }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify({ ok: true, user, pinned: names }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify({ ok: false, error: String(e) }));
    }
  }

  if (req.method === 'POST' && req.url.startsWith('/api/upload')) {
    try {
      const parsed = await streamMultipartToDisk(req, { maxFileBytes: MAX_UPLOAD_BYTES, maxFiles: 12 });
      if (!parsed.ok) {
        res.writeHead(parsed.status || 400, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        return res.end(JSON.stringify({ ok: false, error: parsed.error || 'Upload failed' }));
      }
      if (!parsed.files?.length) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        return res.end(JSON.stringify({ ok: false, error: 'Missing files' }));
      }

      const saved = [];
      for (const f of parsed.files) {
        const finalName = f.storedName;
        const outPath = f.outPath;

        let url = `/uploads/${finalName}`;
        let contentType = f.mimeType || contentTypeForExt(path.extname(finalName).toLowerCase());
        let originalUrl = null;
        let displayName = finalName;

        // Best-effort: convert .mov to .mp4 for wider browser support.
        // Limit transcoding to small files to avoid OOM on small instances.
        try {
          const stat = fs.statSync(outPath);
          const isSmallEnough = stat?.size && stat.size <= 25 * 1024 * 1024;
          if (isMovFile(finalName) && HAS_FFMPEG && isSmallEnough) {
            const mp4Name = finalName.replace(/\.mov$/i, '.mp4');
            const mp4Path = path.join(UPLOADS_DIR, mp4Name);
            const ok = await transcodeMovToMp4(outPath, mp4Path);
            if (ok && fs.existsSync(mp4Path)) {
              originalUrl = url;
              url = `/uploads/${mp4Name}`;
              contentType = 'video/mp4';
              displayName = mp4Name;
            }
          }
        } catch (e) {}

        saved.push({ name: displayName, originalName: finalName, url, originalUrl, contentType });
      }

      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify({ ok: true, files: saved }));
    } catch (err) {
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      if (!res.writableEnded) return res.end(JSON.stringify({ ok: false, error: String(err) }));
    }
  }

  if (req.method === 'POST' && req.url.startsWith('/api/parse')) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { rawText = '' } = JSON.parse(body || '{}');
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'OPENAI_API_KEY missing in .env.local' }));
        }
        const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
        const system = `You are a CV parser. Return ONLY valid JSON with fields: name, title, location, summary, projects, experience, skills, tools, languages, education, process.
IMPORTANT:
- projects must be an array of objects: { title, year, desc, tools, linkUrl, mediaUrl, featured }.
- If a PROJECTS/PORTFOLIO section exists, you MUST extract each project as a separate object in projects[]. Do not leave projects empty if projects are present.
- experience/skills/tools/languages/education/process are arrays of strings.
- If a section is missing, return an empty array.
- Do NOT hallucinate placeholders.
- mediaUrl should be null (media is uploaded separately).`;
        const user = `Raw CV text:\n${rawText}\n\nParse into clean structured JSON.`;
        const payload = {
          model,
          temperature: 0.2,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user }
          ]
        };
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify(payload)
        });
        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content || '';
        let parsed;
        try {
          parsed = JSON.parse(content);
        } catch (e) {
          const repaired = repairJson(content);
          parsed = repaired ? JSON.parse(repaired) : null;
        }
        if (!parsed) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Failed to parse LLM JSON', raw: content }));
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, data: parsed }));
      } catch (err) {
        if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
        if (!res.writableEnded) return res.end(JSON.stringify({ error: String(err) }));
      }
    });
    return;
  }

  // PDF upload -> extract text with LLM, then return structured JSON.
  if (req.method === 'POST' && req.url.startsWith('/api/pdf')) {
    try {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: 'OPENAI_API_KEY missing in .env.local' }));
      }
      const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
      const parsed = await streamMultipartToDisk(req, { maxFileBytes: MAX_PDF_BYTES, maxFiles: 1 });
      if (!parsed.ok) {
        res.writeHead(parsed.status || 400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: parsed.error || 'Upload failed' }));
      }
      const prompt = (parsed.fields?.prompt || '').toString();
      const fileInfo = parsed.files?.[0];
      if (!fileInfo?.outPath) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: 'Missing file field' }));
      }
      const buf = fs.readFileSync(fileInfo.outPath);
      const b64 = buf.toString('base64');

      // 1) Convert PDF directly into structured CV JSON.
      const improveSystem = `You repair extracted CV text.
Return ONLY valid JSON with fields:
name, title, location, summary,
projects (array of objects),
experience (array of strings),
process (array of strings),
skills (array of strings),
tools (array of strings),
languages (array of strings),
education (array of strings).

projects[] object schema:
{ title: string, year: string, desc: string, tools: string[], linkUrl: string|null, mediaUrl: string|null, featured: boolean }

Rules:
- Fix spacing/word splits.
- Do NOT invent companies, dates, awards, or project names.
- Strongly prefer extracting projects from a PROJECTS/SELECTED WORK section.
- If projects are described in paragraphs, split them into distinct project objects.
- Each project must be portfolio-ready: a clear title and a concise outcome/what you built in desc.
- Put software/tools (e.g. "Adobe Illustrator") in tools/skills, not as standalone projects.
- If you find URLs, put them in linkUrl (demo/repo) when they refer to the project. Otherwise leave null.
- mediaUrl should be null (media is uploaded separately in the app).`;
      const improveUser = `Style context (optional):\n${prompt}\n\nPDF base64:\n${b64}`;
      const improved = await openaiChat({ apiKey, model, system: improveSystem, user: improveUser, temperature: 0.2 });
      try { fs.unlinkSync(fileInfo.outPath); } catch (e) {}
      if (!improved.parsed) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: 'Failed to parse improved CV JSON', raw: improved.raw }));
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      // We keep `text` for transparency by reusing the model summary field in UI; the UI can show JSON instead.
      return res.end(JSON.stringify({ ok: true, text: '', data: improved.parsed }));
    } catch (err) {
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
      if (!res.writableEnded) return res.end(JSON.stringify({ ok: false, error: String(err) }));
    }
  }

  // Improve/repair messy PDF text into clean, portfolio-friendly structured JSON.
  if (req.method === 'POST' && req.url.startsWith('/api/improve')) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { rawText = '', prompt = '', strict = false } = JSON.parse(body || '{}');
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: false, error: 'OPENAI_API_KEY missing in .env.local' }));
        }
        const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
        const system = `You repair extracted CV text.
Return ONLY valid JSON with fields:
name, title, location, summary,
projects (array of objects),
experience (array of strings),
process (array of strings),
skills (array of strings),
tools (array of strings),
languages (array of strings),
education (array of strings).

projects[] object schema:
{ title: string, year: string, desc: string, tools: string[], linkUrl: string|null, mediaUrl: string|null, featured: boolean }

Rules:
- Fix missing spaces/word splits and reflow into readable lines.
- Do NOT invent companies, dates, awards, or project names.
- Location should be a city/region/country (e.g., London, UK). Do NOT put phone country codes like "+44" in location.
- Phone numbers must not be treated as location.
- Strongly prefer extracting projects from a PROJECTS/SELECTED WORK section.
- If projects are described in paragraphs, split them into distinct project objects.
- Each project must be portfolio-ready: a clear title and a concise outcome/what you built in desc.
- Put software/tools (e.g. "Adobe Illustrator") in tools/skills, not as standalone projects.
- If you find URLs, put them in linkUrl when they refer to the project. Otherwise leave null.
- mediaUrl should be null (media is uploaded separately in the app).
- Keep it detailed enough for a portfolio, but still concise.`;

        const strictAddendum = strict ? `\n\nSTRICT MODE:\n- If the CV contains a PROJECTS section (or project-like paragraphs), you MUST output at least 3 project objects in projects[].\n- Each project must have a non-empty title and desc.\n- Do not leave name/title empty if present anywhere in the text.\n- Keep each project grounded in provided text. No generic filler.` : '';

        const user = `Style context (optional):\n${prompt}${strictAddendum}\n\nRaw extracted CV text:\n${rawText}`;
        const payload = {
          model,
          temperature: 0.2,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user }
          ]
        };
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify(payload)
        });
        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content || '';
        let parsed;
        try {
          parsed = JSON.parse(content);
        } catch (e) {
          const repaired = repairJson(content);
          parsed = repaired ? JSON.parse(repaired) : null;
        }
        if (!parsed) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: false, error: 'Failed to parse LLM JSON', raw: content }));
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, data: parsed }));
      } catch (err) {
        if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
        if (!res.writableEnded) return res.end(JSON.stringify({ ok: false, error: String(err) }));
      }
    });
    return;
  }

  if (req.method === 'POST' && req.url.startsWith('/api/generate')) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { cvText = '', prompt = '', previousPlan = null } = JSON.parse(body || '{}');
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'OPENAI_API_KEY missing in .env.local' }));
        }

        const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
        const system = `You are a portfolio style planner.

Return ONLY valid JSON with fields:
motion, palette, sectionOrder, layout, contentPlan, visualPlan, fontPair.

You are NOT generating or rewriting the CV content. The application will place CV fields deterministically.

Constraints:
- motion must be one of: subtle, dynamic, playful, cinematic, extreme.
- layout can be: auto, recruiter, showcase, case-study.
- sectionOrder is an array like ["selected","process","experience","skills","education"].
- palette must include keys: base, surface, surfaceAlt, steel, amber, text, textMuted, border, glow.
- contentPlan: { sectionOrder, heroLabel, heroSubtitle, selectedIntro, processIntro, experienceIntro, skillsIntro, educationIntro }
- visualPlan: { family, mood, layout, heroTreatment, cardTreatment, spacing, background:{grain, grid} }

Font rules:
- You MUST set fontPair to one of the provided fontPair keys (you will be given a list in the user prompt).
- Choose a fontPair appropriate to the prompt and the CV title/role.

Palette rules:
- Default to a dark, premium portfolio palette (base/background dark).
- Only choose a light/white background if the user explicitly asks for light/white/bright.

Quality rules:
- Be specific to the style prompt.
- Ensure high contrast and readable typography.

Revision handling:
- If the style prompt includes a line starting with "Revision request:", treat it as highest priority and apply it.
- If a "previous plan" is provided, treat it as the baseline and apply the revision as a minimal PATCH:
  - Do NOT change the page/background/base colour unless the revision explicitly asks to change the background.
  - If the revision asks to change highlight/text/accent colour (e.g. "make some words yellow"), update the accent (amber) only.
  - Preserve unrelated choices (layout, section order, motion, spacing) unless the revision explicitly requests changes.
- If revision asks for "more artistic/artsy/editorial", prefer: visualPlan.cardTreatment="gallery", visualPlan.heroTreatment="poster", visualPlan.spacing="spacious", visualPlan.background.grain=true.
`;

        const prev = (previousPlan && typeof previousPlan === 'object')
          ? `\n\nPrevious style plan (baseline JSON):\n${JSON.stringify(previousPlan)}`
          : '';

        const user = `CV JSON (for context only, do not rewrite):\n${cvText}\n\nStyle prompt:\n${prompt}${prev}\n\nPlan the style + layout only.`;

        const isStream = req.url.includes('stream=1');
        const payload = {
          model,
          temperature: 0.6,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user }
          ],
          stream: isStream
        };

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify(payload)
        });

        if (isStream) {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
          });
          const body = response.body;
          if (!body) return;
          // Node fetch returns a Web ReadableStream; convert to Node stream when needed.
          if (typeof body.pipe === 'function') {
            body.pipe(res);
            return;
          }
          if (Readable?.fromWeb) {
            Readable.fromWeb(body).pipe(res);
            return;
          }
          // Fallback: manual pump.
          if (body.getReader) {
            const reader = body.getReader();
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              if (value) res.write(Buffer.from(value));
            }
          }
          res.end();
          return;
        }

        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content || '';
        let parsed;
        try {
          parsed = JSON.parse(content);
        } catch (e) {
          const match = content.match(/\{[\s\S]*\}/);
          const repaired = repairJson(content);
          parsed = repaired ? JSON.parse(repaired) : null;
        }

        if (!parsed) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Failed to parse LLM JSON', raw: content }));
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, data: parsed }));
      } catch (err) {
        if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
        if (!res.writableEnded) return res.end(JSON.stringify({ error: String(err) }));
      }
    });
    return;
  }

  // static file serve
  let filePath = req.url.split('?')[0];
  if (filePath === '/' || filePath === '') filePath = '/index.html';
  const fullPath = path.join(PUBLIC_DIR, filePath);
  if (!fullPath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.stat(fullPath, (err, stat) => {
    if (err || !stat) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(fullPath);
    const type = contentTypeForExt(ext);
    const range = req.headers.range;
    const headersBase = {
      'Content-Type': type,
      // Avoid stale frontend during rapid iteration.
      'Cache-Control': 'no-store, max-age=0'
    };

    // Support range requests for video/audio (helps playback and seeking).
    if (range && /^bytes=\d*-\d*/.test(range) && (type.startsWith('video/') || type.startsWith('audio/'))) {
      const size = stat.size;
      const m = range.replace(/bytes=/, '').split('-');
      const start = m[0] ? parseInt(m[0], 10) : 0;
      const end = m[1] ? parseInt(m[1], 10) : (size - 1);
      const safeStart = Number.isFinite(start) ? Math.max(0, start) : 0;
      const safeEnd = Number.isFinite(end) ? Math.min(size - 1, end) : (size - 1);
      if (safeStart > safeEnd) {
        res.writeHead(416, { ...headersBase, 'Content-Range': `bytes */${size}`, 'Accept-Ranges': 'bytes' });
        return res.end();
      }
      const chunkSize = (safeEnd - safeStart) + 1;
      res.writeHead(206, {
        ...headersBase,
        'Accept-Ranges': 'bytes',
        'Content-Range': `bytes ${safeStart}-${safeEnd}/${size}`,
        'Content-Length': chunkSize,
      });
      return fs.createReadStream(fullPath, { start: safeStart, end: safeEnd }).pipe(res);
    }

    // Stream large binaries instead of buffering into memory.
    if (type.startsWith('video/') || type.startsWith('audio/') || stat.size > 2_000_000) {
      res.writeHead(200, { ...headersBase, 'Content-Length': stat.size, 'Accept-Ranges': 'bytes' });
      return fs.createReadStream(fullPath).pipe(res);
    }

    fs.readFile(fullPath, (err2, data) => {
      if (err2) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, headersBase);
      res.end(data);
    });
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
