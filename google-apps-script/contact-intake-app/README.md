# NK Contact Intake — Apps Script Deploy Folder

> **⚠ Safety note:** This workflow deploys code only. It does **not** run the
> intake processor, does not search Gmail, and does not create drafts by itself.
> The `processContactIntake()` function only runs when called explicitly (manual
> run from the Apps Script editor) or when a time-based trigger fires inside
> the Apps Script project. Deploying new code does not trigger it.

---

## How the CI/CD Works

```
Claude Code edits repo
  → commit / push to main
    → GitHub Actions runs deploy-contact-intake-apps-script.yml
      → clasp copies Code.gs + CoreBundle.gs into the Apps Script project
        → Apps Script project updated (code only, no execution)
```

**Canonical source files** (edit these, never the deploy copies):

| Canonical source | Deployed as |
|-----------------|-------------|
| `google-apps-script/nk-contact-intake.js` | `Code.gs` |
| `google-apps-script/CoreBundle.gs` | `CoreBundle.gs` |

`Code.gs` and `CoreBundle.gs` inside this folder are **generated at deploy time**
by the workflow — they are not tracked in git. Do not edit them directly.

---

## One-Time Setup

### Step 1 — Get the Apps Script Project Script ID

1. Open [script.google.com](https://script.google.com) and open the
   **NK Contact Intake** project (or create it if it doesn't exist yet —
   see the main `google-apps-script/README.md` for deploy instructions).
2. Click **Project Settings** (gear icon in the left sidebar).
3. Under **IDs**, copy the **Script ID** — it looks like:
   `1BxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxGas`

### Step 2 — Get CLASPRC_JSON from Your Local Machine

`clasp` stores OAuth credentials in `~/.clasprc.json` after you log in.

On your local machine (where you have already run `clasp login` with
`booknovakingdom@gmail.com`):

```bash
cat ~/.clasprc.json
```

Copy the entire JSON output. It looks like:

```json
{
  "token": {
    "access_token": "ya29.xxx",
    "refresh_token": "1//xxx",
    "scope": "...",
    "token_type": "Bearer",
    "expiry_date": 1234567890123
  },
  "oauth2ClientSettings": { ... },
  "isLocalCreds": false
}
```

If you have **not** run `clasp login` locally yet:

```bash
npm install -g @google/clasp
clasp login
# Opens browser — sign in with booknovakingdom@gmail.com
cat ~/.clasprc.json
```

### Step 3 — Add GitHub Secrets

Go to the GitHub repo →
**Settings → Secrets and variables → Actions → New repository secret**

Add two secrets:

| Secret name | Value |
|-------------|-------|
| `CLASPRC_JSON` | The full JSON from `~/.clasprc.json` |
| `CONTACT_INTAKE_SCRIPT_ID` | The Script ID from Step 1 |

Both are required. The workflow will fail with a clear error if either is missing.

---

## Running the Workflow

### Automatic (on push to main)

The workflow triggers automatically when any of these files change on `main`:

- `google-apps-script/nk-contact-intake.js`
- `google-apps-script/CoreBundle.gs`
- `google-apps-script/contact-intake-app/**`
- `.github/workflows/deploy-contact-intake-apps-script.yml`

No action needed — push to main and the deploy runs.

### Manual (workflow_dispatch)

1. Go to the GitHub repo → **Actions** tab.
2. Select **Deploy NK Contact Intake to Apps Script**.
3. Click **Run workflow** → select branch `main` → click **Run workflow**.

Use this to re-deploy without making a code change, or to test the workflow
after adding secrets.

---

## Confirming the Apps Script Was Updated

After the workflow completes (green checkmark in Actions):

1. Open [script.google.com](https://script.google.com) → NK Contact Intake project.
2. Open `Code.gs` and `CoreBundle.gs` in the editor.
3. Verify the file contents match the canonical source files in the repo.
4. Check **Project history** (clock icon) — a new version will show the clasp push timestamp.

You can also run `TestHarness.testAll()` inside the Apps Script editor to confirm
the updated library passes all unit tests.

---

## Rollback Procedure

### Option A — Revert via Git (recommended)

```bash
# Find the last good commit
git log --oneline google-apps-script/nk-contact-intake.js google-apps-script/CoreBundle.gs

# Revert to it
git revert <bad-commit-hash>
git push origin main
# Workflow re-runs automatically and re-deploys the reverted code
```

### Option B — Revert inside Apps Script (immediate)

1. Open the Apps Script project → **Project history** (clock icon).
2. Find the last known-good version.
3. Click **Deploy from this version** (or manually paste the old source).

### Option C — Re-deploy from a specific git commit

```bash
git checkout <good-commit-hash> -- google-apps-script/nk-contact-intake.js google-apps-script/CoreBundle.gs
git commit -m "revert: restore known-good contact intake source"
git push origin main
```

---

## What the Workflow Does NOT Do

- Does **not** run `processContactIntake()` or any other function
- Does **not** create or modify Gmail drafts
- Does **not** create or modify triggers inside the Apps Script project
- Does **not** change Script Properties (Anthropic API key is stored there safely)
- Does **not** touch the CRM spreadsheet, Cloudflare Worker, delivery API,
  quote intake script (`nk-quote-intake.js`), or website files
- Does **not** commit secrets or the `.clasp.json` file to the repository

---

## File Reference

| File | Tracked in git | Purpose |
|------|---------------|---------|
| `appsscript.json` | ✅ Yes | Apps Script project manifest (timezone, scopes, runtime) |
| `README.md` | ✅ Yes | This file |
| `Code.gs` | ❌ No (generated) | Copied from `nk-contact-intake.js` at deploy time |
| `CoreBundle.gs` | ❌ No (generated) | Copied from `CoreBundle.gs` at deploy time |
| `.clasp.json` | ❌ No (generated) | Written from `CONTACT_INTAKE_SCRIPT_ID` secret at deploy time |
