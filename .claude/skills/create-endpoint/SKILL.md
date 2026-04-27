---
name: create-endpoint
description: Scaffold a new NestJS endpoint — DTO with whitelist validation, auth guard, service method, HTTP exceptions for edge cases, and clean response.
---

You are scaffolding a new NestJS endpoint in this project. Follow the conventions below exactly.

## What to ask the user (if not already provided)

Before writing any code, confirm:
1. **HTTP method** — GET / POST / PATCH / PUT / DELETE
2. **Route path** — e.g. `users/:id/profile`
3. **Module name** — which feature module this belongs to (create it if it does not exist)
4. **Request data** — what fields the body / params / query carry and their types
5. **Auth requirement** — is this endpoint public (no auth), protected (any authenticated user), or role-restricted (`ADMIN` only, etc.)?
6. **Business logic summary** — what the service method should do (create, read, update, delete, etc.)
7. **Success response shape** — what the controller returns on the happy path

If the user already supplied this in their message, skip asking and proceed.

---

## Code to generate

### 1. DTO (`src/<module>/dto/<action>-<resource>.dto.ts`)

- Import `class-validator` decorators (`@IsString`, `@IsEmail`, `@IsOptional`, etc.)
- Every field that must be present gets a `@IsNotEmpty()` or similar constraint
- Optional fields get `@IsOptional()` first, then the type decorator
- Never include fields that are not part of the request contract
- Do **not** add a `ValidationPipe` here — it is applied globally or per-controller

```ts
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ExampleDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}
```

### 2. Auth / public access / RBAC

`JwtAuthGuard` is registered **globally** — every endpoint is protected by default. Three patterns:

**Protected endpoint (any authenticated user)** — no decorator needed.

**Public endpoint** — add `@Public()` from `src/guards/public.decorator.ts`. The global guard reads this metadata and skips JWT validation.

```ts
import { Public } from '../guards/public.decorator';

@Public()
@Post('register')
async register(@Body() dto: CreateUserDto) {
  return this.authService.register(dto);
}
```

**Role-restricted endpoint** — add `@UseGuards(RolesGuard)` and `@Roles(Role.ADMIN)` (or any combination of roles). `RolesGuard` is **not** global, so it must be applied explicitly. It reads `request.user.role` (injected by `JwtAuthGuard`) and throws `ForbiddenException` if the role is not in the allowed list.

```ts
import { UseGuards } from '@nestjs/common';
import { Role } from '../generated/prisma/client';
import { Roles } from '../guards/roles.decorator';
import { RolesGuard } from '../guards/roles.guard';

@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
@Get('admin/stats')
getStats() {
  return this.exampleService.getStats();
}
```

Rules:
- Never use `@UseGuards(JwtAuthGuard)` on individual methods — the global guard already covers it.
- `@Public()` and `@Roles(...)` are mutually exclusive — a public endpoint has no authenticated user, so role-checking makes no sense.
- Apply `@UseGuards(RolesGuard)` at the method level (or controller level if every method on that controller is role-restricted).

### 3. Service method (`src/<module>/<module>.service.ts`)

- Inject `PrismaService` (it is global — no need to import `PrismaModule`)
- Each edge case must throw the appropriate NestJS `HttpException` subclass:
  - Resource not found → `NotFoundException`
  - Duplicate / conflict → `ConflictException`
  - Caller lacks permission → `ForbiddenException`
  - Bad caller-supplied data → `BadRequestException`
  - Unexpected failure → let it bubble (the `AllExceptionsFilter` catches it)
- Return plain data (no `Response` injection)

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ExampleService {
  constructor(private readonly prisma: PrismaService) {}

  async findOne(id: string) {
    const record = await this.prisma.example.findUnique({ where: { id } });
    if (!record) throw new NotFoundException(`Example ${id} not found`);
    return record;
  }
}
```

### 4. Controller method (`src/<module>/<module>.controller.ts`)

- `JwtAuthGuard` is **global** — do **not** add `@UseGuards(JwtAuthGuard)` on individual methods
- For **public** endpoints, add `@Public()` (imported from `src/guards/public.decorator.ts`)
- For **role-restricted** endpoints, add `@UseGuards(RolesGuard)` + `@Roles(Role.ADMIN)` (or whichever roles apply)
- **Do NOT add `@UsePipes` or `ValidationPipe` here** — `ValidationPipe({ whitelist: true })` is registered globally in `main.ts`
- Use the correct param decorators: `@Body()`, `@Param()`, `@Query()`
- Delegate all logic to the service — zero business logic in the controller
- Decorate with `@HttpCode(HttpStatus.CREATED)` for POST 201, or leave default (200)

```ts
import {
  Body, Controller, Get, HttpCode, HttpStatus,
  Param, Post, UseGuards,
} from '@nestjs/common';
import { Role } from '../generated/prisma/client';
import { ExampleDto } from './dto/example.dto';
import { Public } from '../guards/public.decorator';
import { Roles } from '../guards/roles.decorator';
import { RolesGuard } from '../guards/roles.guard';
import { ExampleService } from './example.service';

@Controller('examples')
export class ExampleController {
  constructor(private readonly exampleService: ExampleService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Public()
  async create(@Body() dto: ExampleDto) {
    return this.exampleService.create(dto);
  }

  @Get(':id')
  // no decorator needed — JwtAuthGuard is global and protects this by default
  async findOne(@Param('id') id: string) {
    return this.exampleService.findOne(id);
  }

  @Get('admin/all')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async findAll() {
    return this.exampleService.findAll();
  }
}
```

### 5. Module wiring (`src/<module>/<module>.module.ts`)

- Declare the controller in `controllers` and the service in `providers`
- Import the module in `AppModule` if it is new
- Do **not** re-import `PrismaModule` — it is global

```ts
import { Module } from '@nestjs/common';
import { ExampleController } from './example.controller';
import { ExampleService } from './example.service';

@Module({
  controllers: [ExampleController],
  providers: [ExampleService],
})
export class ExampleModule {}
```

---

## Checklist before finishing

- [ ] DTO uses `class-validator` decorators; optional fields have `@IsOptional()` first
- [ ] No `@UsePipes` on the controller — global `ValidationPipe({ whitelist: true })` in `main.ts` covers it
- [ ] No `@UseGuards(JwtAuthGuard)` on individual methods — `JwtAuthGuard` is global
- [ ] Public endpoints have `@Public()`; protected endpoints have no auth decorator; role-restricted endpoints have `@UseGuards(RolesGuard)` + `@Roles(...)`
- [ ] `@Public()` and `@Roles(...)` are never combined on the same method
- [ ] Service throws typed NestJS exceptions (`NotFoundException`, `ConflictException`, etc.) — not raw `Error`
- [ ] No business logic sits in the controller
- [ ] New module is imported in `AppModule` (if applicable)
- [ ] Run `bun run check` mentally — camelCase vars, PascalCase types, no spelling errors for new words (add to `cspell.json` if needed)

After generating all files, list every file created or modified and the exact line where the new endpoint is registered.
