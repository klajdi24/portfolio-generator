# Design rationale (use as notes for Report 2)

> Use this as *your* talking points. Rephrase in your own voice for the report.

## Core UX decisions

- **Split layout (AI Studio left, live preview right):** reduces context switching. Users can change inputs and instantly validate the outcome, which is critical in a generator workflow.
- **Stepper navigation + numbered steps:** makes the workflow legible for first-time users and assessors (clear “happy path”), without reading instructions.
- **Progressive disclosure via `<details>` for “Enrich” and “Refine”:** keeps the default flow simple (CV → Style → Generate → Export), while still offering advanced features for stronger results.
- **Sticky header controls (Demo/Baseline/Export):** keeps the key actions reachable during long forms and reduces scroll fatigue.

## Functionality + robustness decisions

- **Pre-flight checklist:** prevents common failure states (no projects, weak summary, missing links/media). This is a reliability feature, not just UI.
- **Demo mode:** provides a repeatable, assessor-friendly run that works even under time pressure.
- **Baseline mode (no-LLM):** enables critical comparison between AI-assisted and deterministic outputs (supports evaluation in the report).
- **Deterministic rendering of CV content:** AI is used for *planning/structuring* and style decisions, but the app places CV fields consistently. This reduces hallucination risk and keeps the output explainable.
- **Fallback parsing pipeline:** heuristic parsing + mergeFallback helps messy inputs remain usable, improving success rate.

## Generative AI usage (what the AI does, and why)

- **LLM as a “style planner” (palette/layout/motion/visualPlan):** keeps AI’s role bounded and inspectable. The prototype can show what came from AI vs what is deterministic.
- **LLM as a “CV repair” step for PDFs:** PDF extraction is noisy; the improve pass focuses on fixing spacing/structure and extracting project objects.

## Enrichment features (why they exist)

- **GitHub import:** turns real public repos into project entries (with dedupe) to increase authenticity and reduce manual data entry.
- **Media upload + auto-assignment + manual override:** makes project cards feel real. Auto-assignment speeds up the workflow, manual controls keep it trustworthy.

## Export decisions

- **Export HTML:** proves the generator produces a portable artifact.
- **Export ZIP (assets rewritten to local paths):** supports static hosting (GitHub Pages) and avoids broken media links.
