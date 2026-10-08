# JobAI — API

Backend for JobAI, an assistant that removes the repetitive work from job hunting: it
collects postings, tailors a résumé and cover letter to each one, and tracks every
application in one place.

> **Status — early development.** Infrastructure, data model and module architecture are
> settled; feature modules are being implemented. See [Roadmap](#roadmap) for what works today.

## Why this exists

Applying to a job means repeating the same four steps: find the posting, read it, rewrite
your résumé for it, fill the form. JobAI does the first three and hands you a complete,
reviewable application.

It deliberately does **not** submit applications on your behalf. That is a design decision,
not a missing feature — see [Design decisions](#design-decisions).

## Stack

| Layer      | Choice                            |
| ---------- | --------------------------------- |
| Runtime    | Node.js 22 (ESM)                  |
| Framework  | NestJS + TypeScript               |
| Database   | PostgreSQL 17 + TypeORM           |
| Queue      | Redis + BullMQ                    |
| Validation | Zod                               |
| Tests      | Vitest, Supertest, Testcontainers |
| Hosting    | Render                            |

## Getting started

**Prerequisites:** Node.js 22+, Docker.

```bash
npm install
cp .env.example .env          # adjust values if needed
docker compose up -d          # PostgreSQL + Redis
npm run migration:run
npm run start:dev
```

The API listens on `http://localhost:3000`.

Check that the database is actually ready, not merely started:

```bash
docker compose ps             # database should report "healthy"
```

## Deploying to Render

The app runs on Render; the database is [Neon](https://neon.tech), not a Render Postgres
add-on.

- Set `DATABASE_URL` on the Render service to Neon's **direct** connection string
  (not the pooled one — see below), with `?sslmode=require` kept in the query string. Never
  set it in the repo; only `.env.example` carries a placeholder.
- No `ssl` option is configured in `data-source.ts`, and none is needed: TypeORM hands the
  full connection string to `pg`, which parses `sslmode` out of the URL itself and builds
  the TLS config from it. Adding an explicit `ssl` option would just override what the URL
  already says — don't.
- `env.validation.ts` still rejects a `DATABASE_URL` that parses as a valid URL but uses the
  wrong scheme (e.g. pasted from the wrong field), so a misconfigured value is caught at
  boot instead of surfacing as a connection error after deploy.
- **Migrations are run from a developer's machine, not from Render.** Render's Pre-Deploy
  Command — the feature that would run `npm run migration:run` automatically before each
  deploy — is a paid-plan feature. Until that's worth paying for, point `DATABASE_URL` at
  Neon locally and run `npm run migration:run` by hand before deploying code that depends
  on the new schema.
- Neon's free tier suspends its compute after a period of inactivity; the first query after
  that takes a cold-start hit (roughly 1-5s), which `GET /health` will surface directly
  since it does a real `SELECT 1`. Render's own health-check polling keeps the compute warm
  in practice, but a manual request right after a long idle period can be slow.

## Architecture

A modular monolith in three layers. **Dependencies only point downward — there are no
cycles.** That constraint is what makes each module testable in isolation and extractable
later if load ever requires it.

```
LAYER 3   orchestration
  applications          → offers, documents, autoapply, events

LAYER 2   business domains
  offers                → platforms, llm, profiles
  documents             → llm, profiles, storage, events
  autoapply             → platforms, events

LAYER 1   leaves — called by everyone, call no one
  auth   profiles   platforms   llm   storage   events
```

The orchestrator carries data between modules rather than letting them call each other.
`autoapply` needs generated documents but never imports `documents`: `applications`
fetches them and passes them in. That is the mechanism keeping the arrows one-way.

Each module exports its service and nothing else — never its repositories or entities.

## Design decisions

Every structural decision is recorded with its rationale and what was rejected. The ones
that shape the codebase most:

- **The product prepares, the user sends.** No ATS examined (Greenhouse, Lever, Ashby,
  SmartRecruiters) offers a candidate-side authorization flow — the submission key belongs
  to the employer. Combined with the measured unreliability of web agents on real forms,
  automated submission is neither available nor defensible.
- **No third-party credentials, ever.** Holding a user's credentials for a service we don't
  control turns a breach here into account theft there.
- **Screening questions are never generated.** Work authorization, salary expectations and
  diversity questions come from the profile or are asked of the user. An invented answer
  binds the user, not the software.
- **Generated documents are immutable.** Regenerating creates a new row, so "what exactly
  did I send six months ago" always has an answer. That is why `generated_documents` has
  no `updated_at`.
- **`synchronize` stays `false`.** It drops columns without asking. Every generated
  migration is read before it is run.
- **`UNIQUE(source, external_id)` does not deduplicate pasted offers** (2026-10).
  `external_id` is `NULL` for every `manual_paste` offer, and `NULL` is never equal to
  `NULL` under a Postgres unique constraint — a user can paste the same posting any
  number of times. Not fixed now: telling "the same offer" apart from raw pasted text
  needs a rule this project can't write correctly until the LLM module can extract a
  stable identifier (title + company + a normalized description hash, most likely).
  Revisit once that extraction exists.

## Project structure

```
src/
  config/        environment validation, TypeORM data source
  migrations/    versioned schema changes
  modules/       ten modules, three layers (see Architecture)
```

## Scripts

| Command                                               | Purpose                        |
| ----------------------------------------------------- | ------------------------------ |
| `npm run start:dev`                                   | Development server with reload |
| `npm run build`                                       | Production build               |
| `npm test`                                            | Unit tests                     |
| `npm run test:e2e`                                    | End-to-end tests               |
| `npm run lint`                                        | Lint and autofix               |
| `npm run migration:generate -- src/migrations/<Name>` | Generate a migration           |
| `npm run migration:run`                               | Apply pending migrations       |
| `npm run migration:revert`                            | Roll back the last migration   |

## Roadmap

- [x] Module architecture and data model
- [x] Local environment (PostgreSQL, Redis, health checks)
- [ ] Authentication (JWT, argon2)
- [ ] Paste a posting → tailored résumé and cover letter, with grounding checks
- [ ] Application dashboard
- [ ] Posting aggregation from public ATS job-board APIs
- [ ] Prepared applications handed back to the user

## Related

- [jobai-web](../jobai-web) — the front end

## License

MIT

# jobAi-api
