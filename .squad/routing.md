# Work Routing

How to decide who handles what.

## Routing Table

| Work Type | Route To | Examples |
|-----------|----------|----------|
| Architecture / scope | Morpheus | "How should ingestion + scheduling fit together?" |
| UI / dashboard / components | Trinity | "Build the post queue view", Tailwind work, Next.js pages |
| RSS / feed ingestion | Tank | "Pull Microsoft blog feed", parse Atom/RSS, dedupe |
| LinkedIn API / OAuth / posting | Tank | Token refresh, post endpoint, rate-limit handling |
| Persistence / queue / scheduler infra | Tank | Job runner, DB schema, server actions |
| Agent logic / ranking / scoring | Oracle | "Rank these articles for relevance" |
| Timing / "when to post" intelligence | Oracle | Engagement timing, cadence, audience-fit |
| Draft generation / prompt design | Oracle | Turn an article into a LinkedIn post |
| Tests / edge cases / posting safety | Switch | Idempotency tests, dry-run mode, double-post checks |
| Code review | Morpheus | Review PRs, enforce reviewer gates |
| Scope & priorities | Morpheus | What to build next |
| Session logging | Scribe | Automatic — never needs routing |
| Work queue / backlog monitoring | Ralph | "Ralph, go" / "What's on the board?" |

## Issue Routing

| Label | Action | Who |
|-------|--------|-----|
| `squad` | Triage: analyze issue, assign `squad:{member}` label | Morpheus |
| `squad:morpheus` | Architecture / scope work | Morpheus |
| `squad:trinity` | UI / frontend work | Trinity |
| `squad:tank` | Backend / API / ingestion / LinkedIn | Tank |
| `squad:oracle` | Agent logic / ranking / timing | Oracle |
| `squad:switch` | Tests / quality | Switch |

### How Issue Assignment Works

1. When a GitHub issue gets the `squad` label, **Morpheus** triages it — analyzing content, assigning the right `squad:{member}` label, commenting with triage notes.
2. When a `squad:{member}` label is applied, that member picks up the issue in their next session.
3. Members can reassign by swapping labels.
4. The `squad` label is the inbox.

## Rules

1. **Eager by default** — spawn all agents who could usefully start work, including anticipatory downstream work.
2. **Scribe always runs** after substantial work, always `mode: "background"`. Never blocks.
3. **Quick facts → coordinator answers directly.** No spawn for "what port does dev run on?"
4. **When two agents could handle it**, pick the one whose domain is the primary concern.
5. **"Team, ..." → fan-out.** Spawn all relevant agents in parallel.
6. **Anticipate downstream work.** If Tank is building an endpoint, spawn Switch to write tests from the contract simultaneously.
