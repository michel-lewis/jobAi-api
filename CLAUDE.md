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

## Definition of done

- `npm run verify` passes
- Tests cover the nominal case **and** at least one error path
- Any non-obvious decision is written down; structural ones become an ADR in the
  README
- No secret reached git history
