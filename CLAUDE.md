# JobAI API — working notes

Backend for JobAI: collects job postings, tailors a résumé and cover letter to each
one, and tracks every application. Early development — architecture and data model
are settled, feature modules are being implemented.

The full rationale behind every structural choice lives in the README under
"Design decisions". Read it before proposing an alternative to anything below.

## Commands

```bash
npm run start:dev        # dev server
npm run verify           # format:check + lint + typecheck + test — the gate
npm run typecheck        # tsc --noEmit (the linter does NOT check types)
npm run migration:generate -- src/migrations/<Name>
npm run migration:run
docker compose up -d     # PostgreSQL + Redis
docker compose ps        # database must read "healthy", not just "running"
```

Run `npm run verify` before declaring anything done. CI runs exactly this.

## Never do these

- **Never set `synchronize: true`.** It drops columns without asking.
- **Never run a generated migration without reading it first.** TypeORM sometimes
  emits destructive or misordered DDL.
- **Never add `updatedAt` to `generated_documents`.** Those rows are immutable by
  design: regenerating creates a new row, which is what makes "show me exactly what
  I sent six months ago" answerable.
- **Never store third-party credentials or session tokens.** No ATS offers a
  candidate-side authorization flow; holding a user's credentials for a service we
  don't control turns a breach here into account theft there.
- **Never generate answers to screening questions** — work authorization, salary
  expectations, diversity. They come from the profile or are asked of the user. An
  invented answer binds the user, not the software.
- **Never commit `.env`.** Only `.env.example`, with fake values.

## Architecture

Modular monolith, three layers. **Dependencies only point downward — no cycles.**

```
LAYER 3  applications          → offers, documents, autoapply, events
LAYER 2  offers                → platforms, llm, profiles
         documents             → llm, profiles, storage, events
         autoapply             → platforms, events
LAYER 1  auth  profiles  platforms  llm  storage  events   (call no one)
```

The orchestrator carries data between modules rather than letting them call each
other: `autoapply` needs generated documents but never imports `documents` —
`applications` fetches them and passes them in.

Each module exports its service only. Never its repositories or entities.

**One documented exception to layer 1.** `auth` imports `profiles`, so that a profile
row is created in the same transaction as the user at registration. Without it there is
a window where a user exists with no profile, and every read path needs a "maybe
missing" branch. It is safe because `profiles` is a leaf: it takes the user id from
`JwtAuthGuard` in `common/`, never from `auth`, so no cycle can form. Any other layer-1
to layer-1 import needs its own ADR — this one is not a precedent to cite.

## Conventions

- Entities: `src/modules/<module>/entities/<name>.entity.ts`, class `User` (no
  `Entity` suffix), explicit table name in `@Entity('users')`
- TypeScript properties in camelCase; `SnakeNamingStrategy` maps them to snake_case
  columns. Never write snake_case property names.
- Column type `text`, not `varchar(n)`, unless a length limit is a business rule
- All timestamps `timestamptz`, never bare `timestamp`
- Enums as `text` + a **named** `@Check` — not Postgres native `ENUM`, which is
  painful to extend
- Name every constraint and index (`uq_`, `chk_`, `idx_` prefixes)
- Nullable columns typed `T | null`, not `T?`
- Commits: conventional commits (`type: description`), imperative present

## Environment traps

This project is **ESM** (`"type": "module"`, `module: nodenext`):

- Relative imports **must** carry the `.js` extension, even from `.ts` files —
  TypeScript does not rewrite specifiers, so the string must name what exists at
  runtime
- `__dirname` does not exist; use `import.meta.dirname`
- Entities are listed explicitly in `data-source.ts`, not globbed

Other traps:

- **TypeScript is pinned to 6.x** — the Nest CLI cannot drive TypeScript 7 yet
- The linter is **oxlint**, not ESLint. The test runner is **Vitest**, not Jest.
- `data-source.ts` is the single config, shared by Nest and the migration CLI.
  Never duplicate it.

## Tooling — read these before working, not after

The ticket flow lives in `.claude/commands/ticket.md`. It is the single source of
truth for how a ticket is delivered; this file does not restate it.

| | |
|---|---|
| `/ticket` | The 12-step flow. Decides **mode A** (tests written and committed red before the code) or **mode B** (proof list frozen before the plan, tests after the code). |
| `/commit` | Atomic splitting, English, the *why* in the body. |
| agent `test-writer` | Writes the tests of a feature **before** it exists, from the proof list and the agreed interface. Mode A only. |
| agent `senior-reviewer` | Reviews a diff adversarially. Run before every commit. |
| skill `test-policy` | The three test levels, the rule that picks one, the existing harnesses and fixtures, and what disqualifies a test. |
| skill `migration-review` | Checklist before running any migration. Testcontainers start from an empty table, so this is the bug class tests cannot catch. |
| skill `adr` | ADR format, location and acceptance criterion. Required for any exception to a rule in this file. |

**Every ticket carries a proof list** — one sentence per behaviour to demonstrate,
written before the plan. A test that answers no line of that list is a test shaped
by the code it was meant to constrain.

## Definition of done

- `npm run verify` passes
- Tests cover the nominal case **and** at least one error path
- **Every route added or changed is reflected in `requests/*.http`, in the same
  commit.** One file per module (`requests/profiles.http`), covering each status
  the route can return — not only the happy path. These files are the manual
  counterpart to the automated suite: they are how a human, or the next
  developer, exercises the API by hand without rebuilding a Postman collection.
  A commit that changes a controller without touching them is incomplete.
- Any non-obvious decision is written down; structural ones become an ADR under
  `docs/adr/` (skill `adr`)
- No secret reached git history
