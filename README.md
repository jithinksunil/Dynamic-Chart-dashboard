# Dynamic Dashboard — Backend

NestJS backend for the Dynamic Dashboard. Users upload CSV files, configure charts from the data, and chat with an AI assistant about their charts. Built with TypeScript, Prisma ORM, PostgreSQL, and the OpenAI API. Package manager: **Bun**.

## Prerequisites

- [Bun](https://bun.sh) >= 1.x
- PostgreSQL database
- `.env` file with the variables listed below

## Environment variables

```env
DATABASE_URL=postgresql://user:password@host:5432/db_name
JWT_ACCESS_SECRET=your-access-secret
JWT_REFRESH_SECRET=your-refresh-secret
CORS_ORIGIN="http://localhost:5173"
OPENAI_API_KEY="sk-proj-xxxx"
PORT=3000
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

## Database

```bash
bunx prisma migrate dev    # create and apply a new migration
bunx prisma generate       # regenerate client after schema changes
bunx prisma studio         # open Prisma Studio GUI
```

## API reference

### Auth — `POST /auth/sign-up` · `POST /auth/sign-in`

Public endpoints (no token required). Both return `{ accessToken, role }` in the response body and set a `refreshToken` `httpOnly` cookie.

| Method | Path             | Auth   | Description                            |
| ------ | ---------------- | ------ | -------------------------------------- |
| POST   | `/auth/sign-up`  | Public | Register a new user                    |
| POST   | `/auth/sign-in`  | Public | Sign in and receive tokens             |
| POST   | `/auth/refresh`  | Public | Rotate access token via refresh cookie |
| GET    | `/auth/me`       | JWT    | Return the current user's profile      |
| POST   | `/auth/sign-out` | JWT    | Clear the refresh token cookie         |

> Auth endpoints are rate-limited: 10 requests per minute per IP.

### CSV uploads — `csv-upload`

Requires JWT + `USER` role.

| Method | Path              | Description                                    |
| ------ | ----------------- | ---------------------------------------------- |
| POST   | `/csv-upload`     | Upload a CSV file (multipart `file` field)     |
| GET    | `/csv-upload`     | List all CSV uploads owned by the current user |
| DELETE | `/csv-upload/:id` | Delete a CSV upload and all its charts         |

The upload endpoint parses the CSV, infers column data types (`TEXT`, `NUMBER`, `DATE_ISO`), and stores every row as JSON in the database.

### Charts — `chart`

Requires JWT + `USER` role.

| Method | Path                               | Description                                             |
| ------ | ---------------------------------- | ------------------------------------------------------- |
| GET    | `/chart/:csvUploadId/meta`         | Return available x/y axis columns for the chart builder |
| GET    | `/chart/:csvUploadId/chart-values` | Return all saved charts with their data points          |
| POST   | `/chart/:csvUploadId/build-chart`  | Create a new chart for a CSV upload                     |
| PATCH  | `/chart/:chartMetaDataId`          | Update an existing chart's configuration                |
| DELETE | `/chart/:chartMetaDataId`          | Delete a chart                                          |
| GET    | `/chart/:chartMetaDataId/chat`     | Retrieve chat message history for a chart               |
| POST   | `/chart/:chartMetaDataId/chat`     | Send a message to the AI assistant about the chart      |

Supported chart types: `BAR`, `LINE`, `PIE`. The y-axis must be a `NUMBER` column.

When a chart is created (or its axes are updated), the relevant data slice is uploaded to OpenAI's Files API and the file ID is stored on the chart record. This file is used as context when the AI assistant answers questions about the chart.

> Chat endpoint is rate-limited: 10 messages per minute per user.

## AI chat

Each chart has a conversational AI assistant powered by `gpt-4o-mini`. The full message history is sent with every request so the model can answer follow-up questions. Responses are formatted as HTML fragments (no `<html>`/`<body>` wrapper) ready to be injected into the frontend.

## Project structure

```
src/
  auth/           sign-up, sign-in, refresh, JWT strategy
  charts/         chart CRUD, axis validation, OpenAI file management, AI chat
  csv-upload/     CSV parsing, column type inference, upload management
  guards/         JwtAuthGuard (global), RolesGuard, @Public(), @Roles(), @UserId()
  prisma/         PrismaService (global)
  common/         Shared exception filter
  utility/        Shared constants and helpers
  generated/      Prisma client (do not edit manually)
prisma/
  schema.prisma
  migrations/
```

## Data model

```
User
 └── CsvUpload (many)
      ├── ColumnMetaData (many)  — column names + inferred types
      ├── CSVRow (many)          — raw row data as JSON
      └── ChartMetaData (many)
           └── ChatMessage (many) — USER / AGENT turns
```
