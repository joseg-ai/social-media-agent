# Squad Team

> social-media-agent

## Coordinator

| Name | Role | Notes |
|------|------|-------|
| Squad | Coordinator | Routes work, enforces handoffs and reviewer gates. |

## Members

| Name | Role | Charter | Status |
|------|------|---------|--------|
| Morpheus | Lead | agents/morpheus/charter.md | 🏗️ Active |
| Trinity | Frontend Dev | agents/trinity/charter.md | ⚛️ Active |
| Tank | Backend Dev | agents/tank/charter.md | 🔧 Active |
| Oracle | AI/Agent Dev | agents/oracle/charter.md | 🧠 Active |
| Switch | Tester | agents/switch/charter.md | 🧪 Active |
| @copilot | Coding Agent | .github/copilot-instructions.md | 🤖 Active |
| Scribe | Session Logger | agents/scribe/charter.md | 📋 Silent |
| Ralph | Work Monitor | — | 🔄 Monitor |

<!-- copilot-auto-assign: false -->

## Coding Agent — @copilot

**Capability profile** (Lead consults this during triage):

| Capability | Fit | Notes |
|------------|-----|-------|
| Bug fixes with clear repro | 🟢 | Good fit — well-scoped, testable |
| Small features in existing patterns | 🟢 | Good fit when conventions are established |
| Tailwind/UI tweaks | 🟢 | Good fit |
| Test additions for existing code | 🟢 | Good fit |
| Net-new architecture | 🔴 | Not suitable — Morpheus owns this |
| Agent logic / ranking / timing model | 🔴 | Not suitable — Oracle owns the brain |
| LinkedIn API integration (first pass) | 🟡 | Needs Tank's review before merge |
| LLM prompt design | 🔴 | Not suitable — Oracle owns prompts |
| Documentation updates | 🟢 | Good fit |
| Refactors with no behavior change | 🟡 | Needs review |

Auto-assign is **OFF** — Morpheus triages every `squad`-labeled issue and decides whether @copilot picks it up via `squad:copilot`.

## Project Context

- **Owner:** Jose Guajardo
- **Project:** social-media-agent — agentic LinkedIn auto-poster. Curates content from Microsoft RSS feeds and learn.microsoft.com knowledge articles, then posts to LinkedIn at intelligently chosen times for best engagement.
- **Stack:** Next.js 15 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS 4, ESLint 9.
- **Casting Universe:** The Matrix
- **Created:** 2026-05-04
