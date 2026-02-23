# CLAUDE.md

This file provides guidance to Claude when working in this repository.

## Project Overview

Fullstack/backend web application built with TypeScript/JavaScript.

## Tech Stack

- **Language:** TypeScript / JavaScript (Node.js)
- **Database:** Microsoft SQL Server (MS SQL) — always use MS SQL as the data store; do not substitute SQLite, PostgreSQL, or other databases

## Development Principles

- Prefer TypeScript over plain JavaScript for all new files
- Keep business logic and data access separated (e.g. service layer vs repository/query layer)
- Use parameterized queries or an ORM — never concatenate user input directly into SQL strings
- Validate inputs at system boundaries (HTTP handlers, external API responses)

## Database

- **Always use MS SQL Server** for all database work
- Use the `mssql` package (or a compatible ORM like Prisma with the `sqlserver` provider) for queries
- Never use raw string interpolation in SQL; always use parameterized queries to prevent injection

### Local connection

| Setting | Value |
|---|---|
| Instance | `localhost\SQLEXPRESS` |
| Database | `tax-paladin` |
| Auth | SQL Server Authentication (`sa`) |

Connection is managed through `src/db.ts` (`getPool()` / `closePool()`).
Config is read from `.env` — copy `.env.example` to `.env` to get started.

### Schema summary

| Table | Purpose |
|---|---|
| `people` | Tax clients (`sui` PK) |
| `people_entity` | Client entities / filing units (`suie` PK, FK→`people.sui`) |
| `ero` | Electronic Return Originators |
| `sb_ero` | Service bureau ↔ ERO junction |
| `service_bureau` | Service bureaus |
| `offices` | ERO office locations |
| `employee` | Staff / preparers |
| `invoice` | Invoices per filing unit |
| `payment` | Payments against invoices |
| `payment_type` | Payment method lookup |
| `file_info` | Uploaded documents per filing unit |
| `file_type` | Document type lookup |
| `season` | Tax seasons with fee schedules |
| `entity_type` | Entity type lookup (individual, corp, etc.) |
| `msg_queue` | Internal messaging |
| `sent_by` | Message sender type lookup |
| `ptin_list_full` | PTIN registry data |
| `vw_ptin` | View over PTIN list |

## Code Style

- Prefer `async/await` over raw Promise chains
- Use `const` by default; `let` only when reassignment is needed
- No `any` types unless absolutely unavoidable — prefer explicit types or `unknown`

## What Claude Should Not Do Without Asking

- Change the database engine away from MS SQL
- Auto-commit changes to git
- Add dependencies that haven't been discussed
