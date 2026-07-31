# lede Project Board

This repo uses a **GitHub Project (v2)** board to track work. GitHub Projects
can only be created through the GitHub UI or the GraphQL API (there's no REST
endpoint), so the board object itself is created once by a maintainer. This
document is the source of truth for how the board is set up so it can be
recreated or kept consistent.

## Create the board (one-time)

**Via the UI (easiest):**

1. Go to <https://github.com/rorystandley/lede> → **Projects** tab → **New project**.
2. Choose the **Board** template, name it `lede`, and create it.
3. Link it to the repository: **⋯ → Settings → Manage access / linked repositories**,
   or from the repo's Projects tab click **Link a project**.

**Via the `gh` CLI (scriptable):**

```bash
# Requires: gh auth login  with the "project" scope
gh project create --owner rorystandley --title "lede"

# Then link issues as you triage them, e.g.:
gh project item-add <project-number> --owner rorystandley \
  --url https://github.com/rorystandley/lede/issues/1
```

## Fields

| Field        | Type          | Options |
|--------------|---------------|---------|
| **Status**   | Single select | `Triage`, `Ready`, `In progress`, `In review`, `Done` |
| **Priority** | Single select | `High`, `Medium`, `Low` |
| **Area**     | Single select | `Backend`, `Frontend`, `MCP`, `AI`, `Infra`, `Auth` |
| **Estimate** | Number        | Rough effort in points (optional) |

The `Status`, `Priority`, and `Area` fields mirror the repo labels defined in
[`labels.yml`](./labels.yml), so an issue's labels tell you where it belongs on
the board even before it's added.

## Columns (Status)

- **Triage** — newly filed, not yet scoped. New issues land here (label
  `status: triage`).
- **Ready** — scoped and ready to pick up (`status: ready`).
- **In progress** — actively being worked (`status: in progress`).
- **In review** — PR open, awaiting review.
- **Done** — merged / closed.

## Suggested views

- **Board** grouped by `Status` — the default working view.
- **Table** grouped by `Area` — for planning across the stack.
- **Priority** — table filtered to `Priority: High`, sorted by `Status`.

## Built-in automations to enable

In the project's **Workflows** settings, turn on:

- *Item added to project* → set **Status = Triage**
- *Item reopened* → set **Status = In progress**
- *Pull request merged* → set **Status = Done**
- *Item closed* → set **Status = Done**
- Auto-add: items in `rorystandley/lede` with any open issue → add to project

## Labels

Labels are managed as code in [`labels.yml`](./labels.yml) and synced by the
[`labels` workflow](./workflows/labels.yml). Edit the YAML and push to `main` to
change them — don't edit labels by hand in the UI, they'll be overwritten.

## Starter backlog

A seed backlog of issues is filed in the repo (see the
[open issues](https://github.com/rorystandley/lede/issues)). Add them to the
board and drag them into columns as you triage. These were derived from the
production readiness checklist and follow-up hardening items in
[`PRODUCTION_REVIEW.md`](../PRODUCTION_REVIEW.md).
