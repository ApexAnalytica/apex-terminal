# Warm-Intro Mapping — Finance Track

**Owners:** Junaid (lead), Georgios, Jeremy, Brynna, Daniel
**Goal:** Produce a single ranked list of 30-50 named humans that one of us has a real path to. This list is the entire input to the Finance outreach pipeline — nothing leaves the building until it exists.
**Deadline:** First fill complete by end of week 1. Iterated thereafter.

---

## How to fill this in

Each row is **one human** at one institution. If the same person fits two paths (e.g., HSBC alum now at JPM that both Junaid and Georgios know), put them on one row and list both team members.

Don't pre-filter for "likely buyer." Get every plausible name down first; we rank afterward. A weak warm contact who can forward us to the right buyer is more valuable than a strong cold target.

### Where to look

- **HSBC** (Junaid, Georgios, Jeremy): current employees, recent leavers, anyone we shipped models alongside. AI/quant teams, counterparty risk, financial stability, treasury.
- **HSBC alumni now elsewhere** (same): JPM, Citi, Barclays, Standard Chartered, MUFG, Société Générale, Nomura. Quant funds (Two Sigma, Citadel, Marshall Wace). The diaspora is broad.
- **Goldman Sachs alumni** (Brynna): Capital Reporting team, Risk, anyone she worked with. GS alumni at hedge funds, family offices, regulators.
- **Pareto Technologies / MARK LABS / Emerita network** (Junaid): co-founders, board members, prior clients in finance.
- **Daniel's finance work history**: name the firms, then the humans.
- **Academic adjacencies**: anyone who collaborated with Georgios on quantum collateral optimization, anyone in Igusa or Pita's network with a finance hat. Ratings agency methodology teams (S&P, Moody's, Fitch). Central bank research-side contacts.

---

## The schema

Use whatever tool the team prefers (Notion table, Airtable, Google Sheet, Linear, even a shared markdown). The columns are non-negotiable; the tool is fungible.

| Column | Type | Notes |
|---|---|---|
| `name` | text | Full name. |
| `current_org` | text | Current employer. If unknown, mark `?` and a teammate to verify on LinkedIn. |
| `current_title` | text | As specific as you can. "MD, Counterparty Credit Risk" beats "MD". |
| `team_or_desk` | text | Group within the org. "Equity Derivatives Risk" / "Macro PM Pod" / "Financial Stability Research". |
| `seniority` | enum | `IC` / `Manager` / `Director/MD` / `Head/Partner` / `C-suite` |
| `our_contact` | enum (multi) | Who knows them: `Junaid` / `Georgios` / `Jeremy` / `Brynna` / `Daniel` / `Igusa` / `Pita` / `Telukdarie` |
| `relationship_strength` | 1–5 | See rubric below. |
| `last_contact` | date | When did our_contact last actually speak with this person? |
| `analyst_tier_buyer` | bool | Could this person personally green-light a $24k expense without going to procurement? |
| `enterprise_path` | bool | Could this person introduce or champion a $150k+ Enterprise sale to their org? |
| `status` | enum | `not_yet_contacted` / `intro_drafted` / `intro_sent` / `replied` / `meeting_booked` / `met` / `proposal_out` / `closed_won` / `closed_lost` / `nurture` |
| `next_action` | text | One sentence: what's the next move and who owns it. |
| `notes` | text | Anything qualitative. Their pet topic, current project, why they'd care about ΩF, etc. |

### `relationship_strength` rubric

- **5 — Coffee-tomorrow.** Friend. Will reply within hours. Picks up the phone.
- **4 — Worked closely.** Shared a manager or shipped a project together. Will reply within 1-2 days. Comfortable asking for 30 min.
- **3 — Worked adjacent.** Same firm, knows the name and face, occasional Slack/email. Will reply but may need a reminder of who you are.
- **2 — Mutual acquaintance.** We can name a person who'd vouch for us. Cold-with-warm-cover.
- **1 — Cold.** No relationship; only on the list because they're the right buyer profile and we have nothing better.

**Cut-off:** First-wave outreach goes to 4s and 5s only. 3s after we have one reference customer. 1s and 2s never, unless paired with content marketing or a conference touchpoint.

### `analyst_tier_buyer` test

Yes if all of: (a) individual contributor or first-line manager, (b) has a discretionary tools/data budget or knows their team-lead well enough to get one approved in a single conversation, (c) personally evaluates tools rather than handing evaluation to a junior. A senior quant, a desk head, a research director — yes. An MD running a 200-person division — almost always no.

### `enterprise_path` test

Yes if the person is either (a) the buyer themselves at MD/Partner level for a $150k+ tools spend, or (b) reports directly to that buyer and would champion the introduction.

---

## Prioritization rule (for first sends)

Once the list exists, sort by:
1. `relationship_strength` desc (5s first)
2. `analyst_tier_buyer = true` (these are first-quarter wins)
3. `last_contact` recency desc (warmer if recent)

The first 5-8 rows that pass this sort are who we email in week 2. Everyone else stays in the system; nothing gets deleted.

---

## Anti-patterns — don't do these

- **Don't add anyone you don't actually know.** "I've heard of him" is not a warm intro. The whole point of the list is that we have a path; cold-with-reach-fantasy belongs on a different list.
- **Don't ask for a meeting in the first email.** Ask if they'd take a look at a 1-pager. The 1-pager qualifies them in or out without burning a calendar slot.
- **Don't bulk-send.** Each email is from the team member who knows them, in that team member's voice, referencing something specific. The whole asset of warm outreach is that it's not template spam.
- **Don't put the `/pricing` link in until the website is pushed live.** Until then, pricing is verbal in the call, or a PDF attachment.
- **Don't try to land a $150k Enterprise deal as the first sale.** First sale = a single $24k Analyst seat. Land-and-expand. The 1-pager should pitch personal evaluation, not procurement.

---

## Working session — how to actually do this

**Block 90 minutes on the team calendar.** Junaid runs the meeting. Format:

- **0-10 min:** Recap of the playbook above. No re-litigation; questions only.
- **10-50 min:** Silent fill. Each person opens the shared sheet, fills in their own contacts. No discussion. No looking at each other's lists.
- **50-70 min:** Round-robin walk-through. Each person presents their top 5. Other team members add context, fix titles, flag duplicates, suggest who else the contact knows.
- **70-90 min:** Sort by the prioritization rule. Pick the top 5-8 to send to in week 2. Assign owner per row.

**Output of the meeting:** the sorted top-of-list, with owners. That's what gates week 2.

---

## Async additions

After the working session, anyone who remembers more contacts adds them to the bottom of the sheet with full schema fields. New high-strength contacts (4s, 5s) trigger a Slack ping to Junaid for triage; everyone else goes into the nurture pool.

---

## Status tracking

Update `status` and `next_action` weekly. Brynna owns the rollup — every Monday morning she posts:
- New rows added this week
- Status changes this week
- Stale rows (no `next_action` movement in 14 days)
- Top 3 candidates for next-wave outreach

This becomes the standing input to the weekly outreach review.
