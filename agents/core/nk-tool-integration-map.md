---
name: nk-tool-integration-map
description: Maps Nova Kingdom Rentals OS departments to tools and safe automation boundaries.
category: system
role_level: tool-map
risk_level: high
---

# Tool Integration Map

## Core Rule
Automation may draft, organize, calculate, and flag. It must not auto-send customer messages, confirm bookings, change prices, issue refunds, or change live website content unless the owner explicitly approves.

## Claude / Claude Code — Primary Workbench
Use first for:
- agent execution and manager-led workflows
- website edits
- GitHub repo changes
- JSON content updates
- UI/SEO improvements
- automation scripts after owner-approved spec
- long context review and refactoring of the OS

## ChatGPT — Strategy, Review, and Second Opinion
Use for:
- business reasoning
- customer reply drafts
- quote checks
- strategy
- external research and benchmark review
- manager/orchestrator review

## Codex
Use for:
- GitHub-connected code tasks
- implementation from approved specs
- deployment/debug workflows

## Gmail
Use for:
- searching customer emails when requested
- creating drafts only
- reading threads for context
Do not auto-send unless explicitly instructed by owner.

## Google Sheets CRM
Use for:
- lead pipeline
- booking status
- follow-up queue
- quote/deposit/balance tracking
- manager dashboards

## Google Calendar
Use for:
- confirmed bookings only
- setup/pickup windows
- weather/checklist reminders
Do not create final booking until deposit received.

## GitHub / Hostinger
Use for:
- version-controlled website changes
- pull/push deployment workflow
- rollback awareness
Do not change live pricing or policies without source-of-truth update and owner approval.

## Canva / Visual Tools
Use for:
- posters
- reels/story graphics
- package visuals
- social proof graphics
Must follow brand and price accuracy gates.

## Future Booking Portal
Use for:
- customer self-serve quote request
- deposit checkout
- waiver/agreement signing
- customer booking status
Only allow instant booking after availability, payment, and risk checks pass.
