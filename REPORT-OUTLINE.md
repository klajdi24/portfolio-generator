# Report 2 outline (1750 words, adapt to the template)

## Title
AI-assisted portfolio website generation: a bounded, explainable workflow for rapid draft creation

## Abstract (150–200)
Problem, approach, prototype, brief evaluation, findings.

## 1. Introduction (200–300)
- Why portfolios matter, why they’re hard to build well
- How generative AI can help, and the risks (hallucination, inconsistency)
- Your project aim: AI-assisted portfolio generator with bounded AI roles

## 2. Background / related work (350–450)
- Website builders + AI (Wix/Framer/Figma Make) as context
- CV parsing/extraction issues (PDF noise)
- Human factors: usability, information hierarchy, trust

## 3. Methodology (250–350)
- Requirements you set (must export static HTML, must be usable with/without AI, must support enrichment)
- Design approach: iterative prototyping, tutor/peer feedback, small user test

## 4. Prototype design & implementation (450–600)
Break down the pipeline:
- Input: CV (txt/md/pdf)
- Extraction: PDF.js → cleanup → structured JSON
- Enrichment: GitHub import + media upload + auto-assignment
- AI planning: style/layout/motion plan (palette, section order)
- Rendering: deterministic template (CV fields placed consistently)
- QA: pre-flight checklist, demo mode, baseline comparison
- Export: HTML + ZIP

Include 2–4 annotated screenshots.

## 5. Evaluation (250–350)
- Baseline vs AI comparison (what improves, what doesn’t)
- 2–3 quick user test results (ratings/quotes)
- Reliability notes: edge cases that failed and how you mitigated

## 6. Conclusion & future work (150–250)
- What worked, what you learned
- Next steps: better project curation, stronger media workflows, safer parsing, accessibility polish

## References
Add citations for tools and any papers/articles you used.

## Integrity note
State clearly what AI was used for (research/inspiration), and what was written/implemented by you.
