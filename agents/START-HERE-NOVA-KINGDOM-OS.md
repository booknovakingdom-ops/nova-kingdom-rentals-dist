# START HERE — Nova Kingdom Rentals OS

## What This Is
This is a manager-led AI operating system for Nova Kingdom Rentals.

It is designed to work like:
```text
Owner → CEO Agent → Department Managers → Employee Agents → Quality Control
```

The goal is not to have more prompts. The goal is to run leads, quotes, bookings, dispatch, safety, customer experience, marketing, website, finance, and documents through one controlled system.

## First Files to Read
1. `00-system/nk-source-of-truth.md`
2. `00-system/nk-business-ceo-orchestrator.md`
3. `00-system/nk-company-org-chart.md`
4. `00-system/nk-manager-communication-protocol.md`
5. `00-system/nk-department-workflow-map.md`
6. `00-system/nk-quality-gate-system.md`
7. `00-system/nk-approval-matrix.md`

## How To Use It
For any serious task, start with:

```text
Use nk-business-ceo-orchestrator. Route this through the right department managers and quality gates. Use nk-source-of-truth. Do not auto-send anything. Give me the final owner-ready output.
```

## Examples

### Customer asks for price
CEO → Sales Manager → Quote Builder → Finance if needed → Customer Experience → Quality Control.

### School asks for invoice
CEO → Sales Manager → Documents Legal Manager → Operations if staffing/setup needed → Quality Control.

### Website update
CEO → Website SEO Manager → Finance if pricing changes → Tech Automation Manager → Quality Control.

### Complaint/refund/damage
CEO → Customer Experience → Safety → Documents Legal → Finance → Quality Control → Owner approval.

## Important
The 64 employee/specialist agents are still useful. But they now sit under managers. Do not let random agents make final decisions alone.


## Merged Final Review Fixes Added

This version includes the final content-injection pass:

- Correct lawn game pricing: 5 standalone = $150, upgrade 5→12 = +$100, all 12 when no games included = $250.
- Insurance/trust details: $2M liability, Broker Link 1408, April 28 renewal/key date.
- Reference language now says launched in May 2026.
- Google Review link added: https://g.page/r/CZXOs7GUjxR5EBI/review.
- Tool map changed to Claude-first, with ChatGPT as strategy/review/second opinion.
- Short-event pricing must be [TO BE CONFIRMED] unless approved.
- Added Crown Rush 42 launch campaign, Royal Court loyalty, NPS feedback, waitlist manager, Kling AI prompts, 7-stage customer journey, annual business planner, launch mode, and partnership/referral network.

Current markdown file count: 104.
