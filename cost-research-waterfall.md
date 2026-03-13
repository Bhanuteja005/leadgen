# Waterfall Email Cost Research (Clay-style)

Date: 2026-03-13
Scope: estimate cost per contact when email enrichment runs through multiple providers in sequence.

## 1) Inputs from your screenshot

Your waterfall sequence shows these per-row credit costs (in Clay UI):

- Findymail: 2 / row
- Hunter: 2 / row
- Prospeo: 2 / row
- Kitt: 1 / row
- Datagma: 2 / row
- Wiza: 2 / row
- Icypeas: 0.5 / row
- Enrow: 1 / row
- Dropcontact: 2 / row
- LeadMagic: 1 / row
- SMARTe: 6 / row

Worst-case total credits if all steps are hit:

2 + 2 + 2 + 1 + 2 + 2 + 0.5 + 1 + 2 + 1 + 6 = 21.5 credits per contact

## 2) Clay platform pricing references

From Clay pricing page:

- Free: 500 actions / month
- Launch: starts at $167/mo and 15,000 actions
- Growth: starts at $446/mo and 40,000 actions
- Data credits are separate from actions
- Data credits start around $0.05 each (published statement; exact effective rate depends on plan and usage)

Practical formula:

- Waterfall data cost/contact = (credits used) x (your effective $/credit)
- Platform action cost/contact = (actions used) x (your effective $/action)
- Total cost/contact = data cost + action cost

## 3) Example cost ranges for 1 contact

Assume effective data-credit rates in the range $0.03 to $0.05 and action cost below $0.01.

- Best case (provider 1 hits): 2 credits
  - Data cost: $0.06 to $0.10
- Medium case (hit by step 5): 9 credits
  - Data cost: $0.27 to $0.45
- Deep fallback (hit by step 10): 15.5 credits
  - Data cost: $0.47 to $0.78
- Worst case (all 11 steps): 21.5 credits
  - Data cost: $0.65 to $1.08

Action costs add a small amount on top, but still matter at scale.

## 4) External provider reference points (public pages sampled)

- Wiza pricing page currently advertises unlimited emails on paid plans; free includes limited monthly credits.
- Findymail pricing page currently advertises Starter at $99/mo with 5,000 finder credits and 5,000 verifier credits.

Important: each provider frequently changes packaging and unit economics. Use your live Clay calculator for exact current spend.

## 5) How to reduce spend without reducing match rate

1. Keep a pattern-first strategy:
   - Wiza probe once per domain, then test only detected pattern first.
2. Short-circuit unknown loops:
   - If pattern is proven and verifier returns unknown on enterprise domains, trust pattern at lower confidence instead of running 10+ extra providers.
3. Add strict fallback gates:
   - Only call expensive providers if previous providers returned no email (not just unknown verification).
4. Cache by company + role filter + max contacts:
   - Re-run should return DB result, not re-enrichment.
5. Prefer providers with no-charge-on-miss in early tiers.
6. Add domain-level behavior memory:
   - If domain historically blocks SMTP checks, skip redundant verifier rounds.

## 6) Cost model for your current backend

Current leadgen flow (after latest optimizations):

1. Scrape once via Apify
2. Wiza probe: 1 profile per company
3. Email pattern round-1 with verifier
4. If Wiza pattern is proven and verifier is unknown, trust pattern early
5. Wiza bulk fallback only for unresolved contacts
6. Cache completed jobs for 7 days

This is already materially cheaper than full waterfall because it avoids provider fan-out on every contact.

## 7) Recommended monitoring metrics

Track these per company search job:

- verifier_calls_count
- wiza_probe_count
- wiza_bulk_count
- pattern_trust_count
- contacts_confirmed_count
- cost_estimate_usd

Then set alerts when:

- Wiza bulk ratio > 25%
- cost per verified contact crosses threshold
- same domain repeatedly forces deep fallback
