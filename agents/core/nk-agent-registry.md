# Nova Kingdom Rentals — Agent Registry

Use this registry to select the right agent. Do not use agents randomly.

## 00-system

| Agent/File | Use when |
|---|---|
| nk-source-of-truth | Need official prices, rules, products, policies |
| nk-business-orchestrator | Any multi-step business workflow |
| nk-workflow-playbooks | Need exact step-by-step process |
| nk-quality-gate-system | Before sending messages, quotes, invoices, website edits, or event plans |
| nk-approval-matrix | Need to know whether owner approval is required |
| nk-agent-security-rules | Connecting AI to Gmail, CRM, website, payments, or private data |
| nk-feedback-loop | When correcting a recurring AI/business mistake |
| nk-agent-test-cases | Testing whether agents follow business rules |

## Sales / booking

| Agent | Use when |
|---|---|
| nk-lead-intake-agent | New inquiry arrives |
| nk-package-recommender | Customer needs help choosing item/package |
| nk-quote-builder | Price, deposit, balance, travel, staffing calculation |
| nk-quote-quality-checker | Before quote goes to customer |
| nk-objection-handler | Too expensive, competitor quote, payment delay, reference request |
| nk-booking-pipeline-manager | Track lead status and next action |
| nk-deposit-chaser | Quote sent but deposit not paid |

## Operations / dispatch

| Agent | Use when |
|---|---|
| nk-availability-manager | Check inventory/calendar/staff availability |
| nk-dispatch-route-manager | Confirmed booking needs delivery plan |
| nk-load-checklist-agent | Before loading vehicle/trailer |
| nk-staffing-calculator | Public event, school, multi-unit setup, attendant quote |

## Safety / compliance

| Agent | Use when |
|---|---|
| nk-safety-compliance-officer | Any safety-sensitive booking |
| nk-public-event-risk-checker | Schools, festivals, churches, community events, large crowds |
| nk-incident-report-manager | Injury, damage, complaint, weather shutdown, equipment issue |
| nk-damage-cleaning-manager | Cleaning fee, damage claim, missing item, blocked pickup |

## Customer experience

| Agent | Use when |
|---|---|
| nk-customer-experience-designer | Design full customer journey |
| nk-reference-request-response | Customer asks for references/past clients |
| nk-review-growth-system | After event review/testimonial/photo capture |
| nk-complaint-recovery-agent | Angry or disappointed customer |

## Website / SEO

| Agent | Use when |
|---|---|
| nk-website-conversion-optimizer | Improve website sales flow |
| nk-product-page-builder | Product detail page improvements |
| nk-package-page-builder | Package card/details and upgrade logic |
| nk-local-seo-builder | Service-area pages and local keywords |
| nk-website-quality-checker | Before pushing website changes |

## Finance / strategy

| Agent | Use when |
|---|---|
| nk-margin-protection-agent | Quote profitability, minimum order, discount control |
| nk-equipment-roi-brain | Buy/avoid equipment decisions |
| nk-weekly-business-review-agent | Weekly CEO dashboard and priorities |
| nk-competitor-war-room | Competitor pricing/SEO/reviews/ad tracking |

---

# Manager-Led Hierarchy Added

## CEO Orchestrator
- `00-system/nk-business-ceo-orchestrator.md` — top-level router, conflict resolver, owner-ready output controller.

## Department Managers
- `01-sales-booking/nk-sales-booking-manager.md` — lead-to-deposit pipeline.
- `04-customer-experience/nk-customer-experience-manager.md` — customer journey and message tone.
- `02-operations-dispatch/nk-operations-dispatch-manager.md` — availability, route, staff, load, setup, pickup.
- `03-safety-compliance/nk-safety-compliance-manager.md` — weather, risk, incidents, compliance, safety override.
- `07-marketing-growth/nk-marketing-growth-manager.md` — ads, content, GBP, reviews, campaigns.
- `05-website-seo/nk-website-seo-manager.md` — website conversion, SEO, product/package pages.
- `06-finance-strategy/nk-finance-revenue-manager.md` — margin, ROI, cash, pricing discipline.
- `08-documents-legal/nk-documents-legal-manager.md` — invoices, agreements, waivers, insurance, documents.
- `09-quality-control/nk-quality-control-manager.md` — final QA and reality check.
- `10-tech-automation/nk-tech-automation-manager.md` — CRM/Gmail/Calendar/GitHub/Hostinger automation boundaries.

## Rule
Use managers for workflows. Use employee agents for focused subtasks only.



## Merge-final additions

| Agent | Use when | Manager |
|---|---|---|
| nk-waitlist-manager | Date/item is unavailable or uncertain; convert demand instead of losing lead | Sales & Booking |
| nk-nps-feedback-system | After event, before public review ask, to collect 0–10 satisfaction score | Customer Experience |
| nk-7-stage-customer-journey | Designing end-to-end premium experience from DM to repeat booking | Customer Experience |
| nk-loyalty-royal-court | Repeat customer, referral, school/community loyalty perks | Customer Experience |
| nk-crown-rush-42-launch-campaign | Pre-launch/launch campaign for Crown Rush 42 arriving June 2026 | Marketing & Growth |
| nk-launch-mode-agent | First-season priorities: reviews, photos, trust, operations discipline | Marketing & Growth |
| nk-kling-ai-video-prompts | Product-specific AI video/reel prompts | Marketing & Growth |
| nk-partnership-referral-network | Build warm referrals with local vendors/venues/partners | Marketing & Growth |
| nk-annual-business-planner | Annual revenue/equipment/seasonality/cashflow planning | Finance & Revenue |
