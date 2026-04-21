# Portfolio Generator (Prototype)

Local AI-assisted portfolio builder that turns CV text (and optional GitHub repos + media) into a portfolio draft you can export as HTML/ZIP.

## Run locally

```bash
cd portfolio-generator
node server.js
```

Open: http://127.0.0.1:5174

## Notes

- **GitHub Pages cannot host this full app** because it needs a Node server for:
  - `/api/*` endpoints (LLM proxy/status/version)
  - uploads (media)
  - GitHub pinned repo helper
- You *can* still put the code on GitHub and deploy it via a Node host that pulls from GitHub.

## Recommended deployment (GitHub → Render)

1. Create a GitHub repo (e.g. `portfolio-generator`) and push this folder.
2. On Render: **New Web Service** → connect the repo.
3. Settings:
   - Build command: *(none)*
   - Start command: `npm start`
4. Environment variables:
   - `OPENAI_API_KEY` = your key (Render secret)
   - `OPENAI_MODEL` (optional) e.g. `gpt-4o-mini`
5. Deploy. Render will assign you a public URL.

### If you want GitHub Pages too

Use Pages only as a landing page, or as a limited no-server demo. The “Baseline” mode still works, but uploads/LLM features will not.

## Demo buttons

- **Demo mode**: reliable assessor-friendly run (sample CV → professional prompt → subtle motion).
- **Baseline**: no-LLM baseline generation for comparison.
