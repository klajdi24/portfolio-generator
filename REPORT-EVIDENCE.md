# Evidence checklist (screenshots + notes for your report)

## Prototype objective
AI-assisted workflow to generate a usable portfolio website draft from a CV, with optional GitHub import + media attachment, and export.

## Screenshots to capture

1) **Step flow**
- Stepper visible (CV → Enrich → Style → Generate → Refine)
- Advanced/Refine collapsed by default (optional features don’t overwhelm)
- Split layout: AI Studio left + live preview right

2) **Pre-flight checklist**
- Show it flagging missing projects/media/links
- Then show it improving after GitHub import / media upload

3) **Baseline vs AI comparison**
- Baseline button output
- AI-generated output with a different style prompt
- Short notes: differences in hierarchy, motion, readability

4) **Export proof**
- Export HTML link opens a standalone portfolio
- Export ZIP downloads

5) **Edge case**
- Messy CV / PDF extracted text → still produces 3+ projects after repair/fallback

## Mapping to marking criteria

### Functionality (25%)
- Guided happy-path + demo mode
- Pre-flight checklist reduces failure states
- Export produces portable artifacts (HTML/ZIP)

### Technical innovation (40%)
- Pipeline: CV extraction → structured CV → style plan (palette/layout/motion/visualPlan) → renderer
- Optional data sources: GitHub repo import
- Media processing + auto assignment

### Creative innovation (35%)
- “AI Studio” experience, not just a prompt box
- Baseline comparison feature supports critical evaluation
- Motion profiles (subtle/dynamic/cinematic/extreme) designed intentionally

## Short user test idea (fast)
Ask 2 people to do:
- Create a draft in 3 minutes
- Rate: professional (1–5), clarity (1–5)
- Compare baseline vs AI result preference

Capture 2–3 quotes for the report.
