# QA checklist (prototype)

Use this to prove reliability + capture evidence for marking.

## Happy path
- [ ] Paste CV text, click Generate, portfolio renders
- [ ] Click a project card, modal opens, Escape closes it
- [ ] Export HTML: downloads + opens in new tab, modal still works
- [ ] Export ZIP: downloads, unzip, open index.html, assets load

## Enrichment
- [ ] GitHub fetch: username → repo list renders
- [ ] GitHub import: selected repos become projects (dedupe works)
- [ ] After import, pre-flight updates and tells you if project count is too high (target 3–6)

## Media
- [ ] Upload image(s), pre-flight “media” turns OK
- [ ] Auto-assignment matches at least 1 project correctly
- [ ] Manual assignment override works (dropdown)

## LLM status + fallbacks
- [ ] LLM status shows connected when key present
- [ ] Turn LLM off → baseline still generates a usable portfolio
- [ ] Messy CV still yields >= 3 projects via fallback parsing

## Edge cases
- [ ] CV with no headings: still extracts at least 1–3 projects/skills
- [ ] GitHub repo with junk description: doesn’t become a 1-word project card
- [ ] Very long CV: app stays responsive (no freeze)

## Accessibility
- [ ] Tab navigation reaches buttons/inputs
- [ ] Focus visible on key controls
- [ ] Details panels are keyboard operable
