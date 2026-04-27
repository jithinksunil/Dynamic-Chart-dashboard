# Skill Squad — API

NestJS backend for the Skill Squad platform. Built with TypeScript, Prisma ORM, and PostgreSQL. Package manager: **Bun**.

## Prerequisites

- [Bun](https://bun.sh) >= 1.x
- PostgreSQL database
- `.env` file with the variables listed below

## Environment variables

```env
DATABASE_URL=postgresql://user:password@host:5432/db_name
JWT_ACCESS_SECRET=your-access-secret
JWT_REFRESH_SECRET=your-refresh-secret
```

## Setup

```bash
bun install
bunx prisma migrate dev   # apply migrations and generate client
```

## Running the server

```bash
bun run start:dev   # watch mode (development)
bun run build       # compile to dist/
```

## Code quality

```bash
bun run check       # spellcheck + format check + typecheck + lint (run all at once)
bun run lint:fix    # auto-fix lint issues
bun run format      # auto-fix formatting
```

## Tests

```bash
bun run test        # unit tests
bun run test:e2e    # end-to-end tests
```

## Database

```bash
bunx prisma migrate dev    # create and apply a new migration
bunx prisma generate       # regenerate client after schema changes
bunx prisma studio         # open Prisma Studio GUI
```

## Auth

All endpoints are JWT-protected by default (`JwtAuthGuard` is registered globally).

| Decorator | Effect |
|---|---|
| _(none)_ | Protected — valid JWT required |
| `@Public()` | Public — no token required |
| `@UseGuards(RolesGuard)` + `@Roles(Role.ADMIN)` | Role-restricted — valid JWT + matching role required |

Roles: `USER` (default on sign-up), `ADMIN`.

Tokens are issued on `POST /auth/sign-up` and `POST /auth/sign-in`. The access token is returned in the response body; the refresh token is set as an `httpOnly` cookie.

## Project structure

```
src/
  auth/           sign-up, sign-in, JWT strategy
  guards/         JwtAuthGuard, RolesGuard, @Public(), @Roles()
  prisma/         PrismaService (global)
  generated/      Prisma client (do not edit manually)
  common/         Shared filters, pipes, interceptors
prisma/
  schema.prisma
  migrations/
```
