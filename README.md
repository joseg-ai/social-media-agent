# **TrendWise: AI Social Media Agent for Organic Growth**

## **One‑liner (value prop)**
An AI agent that turns your RSS feeds and URLs into **trend‑aligned, platform‑ready, scheduled posts**—driving **organic reach** across LinkedIn, X, Facebook, and more.

---

## **Problem**
Entrepreneurs and small teams struggle to keep up with fast-moving trends, curate quality content, and maintain a consistent posting cadence across multiple platforms. Manual research, drafting, and scheduling are time-consuming and inconsistent—hurting organic growth.

---

## **Solution**
**TrendWise** automates the content workflow end‑to‑end:
1. **Ingests** content sources (RSS feeds, URLs) and maps them to your niche.  
2. **Discovers trends** relevant to your audience and brand positioning.  
3. **Generates post ideas** and drafts tailored to each platform’s norms.  
4. **Schedules** posts for optimal times and cadence.  
5. **Learns** from engagement signals to improve future recommendations.

---

## **Core Features (MVP)**
- **Source Ingestion**: Add RSS feeds and URLs; fetch, clean, summarize content; deduplicate and extract key insights.  
- **Trend Mining**: Identify trending topics within the user’s interest graph (e.g., with embeddings + lightweight trend signals).  
- **Post Generation**: Create platform‑specific variants (LinkedIn, X, Facebook)—tone, length, hooks, CTAs, and optional hashtags.  
- **Smart Scheduling**: Recommend publish times and frequency; auto-generate a weekly calendar; allow one‑click approve/edit.  
- **Value Scoring**: Score each post for “usefulness” (educational, actionable, thought leadership) and predicted attention.  
- **Compliance & Brand Guardrails**: Enforce brand voice, banned claims, and safe content filters.  
- **Feedback Loop**: Let users approve, nudge tone, or regenerate; learn from engagement to refine future drafts.

---

## **User Flow**
1. **Connect Sources** → Paste URLs / add RSS feeds → pick topic interests.  
2. **Configure Voice** → Select tone (e.g., expert, friendly, bold), audience, CTA style.  
3. **Preview Queue** → Agent proposes 10–20 post candidates with scores + scheduled times.  
4. **Approve & Schedule** → One‑click approve/edit; bulk approve; auto-schedule queue.  
5. **Measure & Learn** → Track engagement; agent adjusts topics, times, and style.

---

## **Technical Architecture (hackathon‑friendly)**
- **Ingestion Layer**:  
  - Fetch RSS/HTML → parse → summarize → extract entities/keywords.  
- **Trend Engine**:  
  - Embedding similarity to user interests; light trend signals (e.g., frequency spikes across sources, velocity).  
- **Content Engine**:  
  - Prompted LLM templates per platform; includes hooks, angles, CTAs, hashtags (optional).  
  - Guardrails: toxicity, sensitive topics, fact check against source summary.  
- **Scheduler**:  
  - Heuristic based on historical norms, user‑preferred windows, and platform pacing.  
- **Storage**:  
  - Content items, topics, embeddings, schedule, engagement metrics.  
- **Delivery**:  
  - Direct API post where available; otherwise export to CSV/ICS/Buffer/Zapier webhook for scheduling.  
- **Telemetry**:  
  - Post performance, approval actions, regeneration counts.

**Suggested stack (swappable):**
- **Backend**: Python/Node (FastAPI/Express) + queue for jobs  
- **AI**: Azure OpenAI for summarization and generation; embeddings for topic mapping  
- **Data**: Cosmos DB / Postgres; Blob Storage for caches  
- **Pipelines**: Azure Functions/Container Apps for ingestion & generation; Logic Apps for scheduled sends  
- **Observability**: App Insights dashboards

---

## **AI/Prompt Strategy**
- **Summarization Prompt**: Extract key facts, claims, statistics, and author POV from each source.  
- **Idea Generation Prompt**: “Given summary + audience + voice, propose 10 post angles with value tags (educational, contrarian, tactical).”  
- **Platform Templates**:  
  - **LinkedIn**: hook + insight + example + CTA; ~120–200 words; optional bullets.  
  - **X**: punchy 1–2 tweets; hooks and stats; optional hashtag set.  
  - **Facebook**: conversational, value-driven; 100–150 words; CTA to comments.  
- **Guardrails**: No unverified claims; detect sensitive topics; remove clickbait promises; ensure original framing over copy‑paste.

---

## **Scheduling Logic (MVP Heuristics)**
- Respect user‑defined windows (e.g., weekdays 8–5 local time).  
- Avoid clustering similar topics back‑to‑back.  
- Balance content types (thought leadership, tactical tip, curated link, question).  
- Start with platform norms (e.g., 3–5/week LinkedIn, daily X), refine later with engagement.

---

## **Metrics & Success Criteria**
- **Content Quality**: approval rate, regeneration rate, average value score.  
- **Efficiency**: time saved vs. manual drafting; posts scheduled per session.  
- **Engagement**: impressions/engagement rate per platform/post type.  
- **Learning**: uplift in engagement after 2–3 feedback cycles.

---

## **Risks & Mitigations**
- **API Access/Rate Limits**: Support export & 3rd‑party schedulers (Buffer, Zapier) as fallback to platform APIs.  
- **Content Authenticity**: Always cite/ground to source summaries; highlight quotes; avoid plagiarism.  
- **Brand Safety**: Use moderation + banned phrases list; require approval for first N posts.  
- **Hallucinations**: Ground generation strictly to ingested content + trend summaries.

---

## **Demo Plan (10 minutes)**
1. Add two RSS feeds and a product URL.  
2. Show extracted insights and trending topics map.  
3. Generate 10 posts across platforms; show value scores.  
4. Approve 5 posts → auto‑schedule calendar.  
5. Edit tone for 1 post; regenerate; approve.  
6. Show mock engagement dashboard and how it adapts next week’s plan.

---

## **Stretch Goals (if time permits)**
- Multi‑language support and cross‑language trend discovery.  
- Image generation (brand‑safe templates).  
- Community prompts (questions/polls) and DM outreach drafts.  
- Competitor topic gap analysis.  
- Team collaboration with approval workflows.

---

## **What I need from you to finalize**
1. **Target users**: Solo founders only, or also small marketing teams/agencies?  
2. **Platforms**: Confirm launch set (LinkedIn, X, Facebook). Any others (Instagram Threads, YouTube Shorts, TikTok)?  
3. **Voice & constraints**: Preferred tones, banned topics/phrases, compliance needs (industry/regional)?  
4. **Posting method**: Are we okay with **export/Zapier/Buffer** as a fallback, or do you require direct posting via each platform’s API at MVP?  
5. **Scheduling rules**: Any time windows, frequency caps, or blackout dates?  
6. **Metrics focus**: Which KPI matters most for demo (approval rate, engagement rate, reach, time saved)?  
7. **Data & privacy**: Any PII, customer data, or private URLs? Need encryption or tenant isolation?  
8. **Tech preferences**: Any required cloud/services or libraries you want me to use?  
9. **Geography & language**: English only for MVP, or multi‑language generation?  
10. **Branding**: Keep the name **TrendWise** or do you have a preferred name/colors?
