# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Skill-Squad** is a NestJS backend API using TypeScript, Prisma ORM, and PostgreSQL. The package manager is **Bun**.

## Commands

```bash
# Development
bun run start:dev        # Watch mode with hot reload

# Build
bun run build            # Compile to dist/

# Code quality (run all at once)
bun run check            # spellcheck + format check + typecheck + lint

# Individual checks
bun run lint             # ESLint
bun run lint:fix         # ESLint with auto-fix
bun run format           # Prettier write
bun run format:check     # Prettier check only
bun run typecheck        # tsc --noEmit
bun run spellcheck       # cspell

# Tests
bun run test             # Jest unit tests
bun run test:e2e         # End-to-end tests
```

## Architecture

**Modules:**
- `AppModule` (root) — imports `ConfigModule` (global) and `PrismaModule`
- `PrismaModule` — global module; exposes `PrismaService` to every feature module without re-importing
- `AuthModule` — sign-up / sign-in, JWT issuance, Passport strategy

**PrismaService** (`src/prisma/`) — extends `PrismaClient`, uses the `PrismaPg` adapter, reads `DATABASE_URL` from `ConfigService`. Handles `onModuleInit` / `onModuleDestroy` lifecycle.

**Generated client** — Prisma generates the client into `src/generated/prisma` (CommonJS). Never edit these files manually; regenerate with `bunx prisma generate`. Import types (e.g. `Role`) from `src/generated/prisma/client`.

## Auth & Authorization

**Guards** live in `src/guards/`:

| File | Purpose |
|---|---|
| `jwt-auth.guard.ts` | **Global** — protects every endpoint by default via `APP_GUARD` |
| `public.decorator.ts` | `@Public()` — opts a method/controller out of JWT validation |
| `roles.guard.ts` | `RolesGuard` — **not** global; apply with `@UseGuards(RolesGuard)` |
| `roles.decorator.ts` | `@Roles(Role.ADMIN, …)` — declares which roles may access a method |

**Three access patterns — pick exactly one per endpoint:**

```ts
// 1. Public — no token required
@Public()
@Post('register')
register() { ... }

// 2. Protected — any authenticated user (no decorator needed)
@Get('profile')
getProfile() { ... }

// 3. Role-restricted — authenticated + specific role
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
@Get('admin/stats')
getStats() { ... }
```

Rules:
- Never add `@UseGuards(JwtAuthGuard)` on individual methods — the global guard already covers it.
- `@Public()` and `@Roles(...)` are mutually exclusive.
- `role` is embedded in the JWT payload at sign-in/sign-up and read by `JwtStrategy.validate()`.

**Roles** (`Role` enum in `prisma/schema.prisma`): `USER` (default), `ADMIN`.

## Database

Schema: `prisma/schema.prisma`, migrations in `prisma/migrations/`.

```bash
bunx prisma migrate dev      # Apply migrations in development
bunx prisma generate         # Regenerate client after schema changes
bunx prisma studio           # Open Prisma Studio GUI
```

`DATABASE_URL` must be set in `.env` (PostgreSQL connection string).

## Session Rules

- **End of session**: Always run `bun run check` before ending a session. Fix any errors it reports before stopping.

## Code Conventions

- ESLint enforces **camelCase** variables/functions and **PascalCase** types/classes (see `eslint.config.mjs`).
- Prettier config in `.prettierrc`; import order is enforced.
- Spell checking via `cspell`; add project-specific words to `cspell.json`.
- Strict TypeScript (`strict: true`, `strictNullChecks: true`).
- **Object arguments**: All user-defined functions with more than one parameter MUST accept a single typed object argument (destructured at the call site). Never use multiple positional parameters.

  ```typescript
  // Bad
  function createUser(name: string, email: string, role: string) { ... }
  createUser('Alice', 'alice@example.com', 'admin');

  // Good
  function createUser({ name, email, role }: { name: string; email: string; role: string }) { ... }
  createUser({ name: 'Alice', email: 'alice@example.com', role: 'admin' });
  ```

  Define a named interface or type for the parameter object when it is used in more than one place.

- **No single-letter variables**: Variable, parameter, and property names must be descriptive — never a single character. This applies everywhere: loop indices, callbacks, destructured values, type parameters, etc.

  ```typescript
  // Bad
  const d = new Date(raw);
  lines.forEach((l) => l.trim());
  headers.forEach((h, j) => { ... });

  // Good
  const parsedDate = new Date(raw);
  lines.forEach((line) => line.trim());
  headers.forEach((header, headerIndex) => { ... });
  ```
