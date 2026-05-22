# Tax Paladin — Employee/Admin Portal

## Project Overview
The Employee Portal is the admin-facing side of Tax Paladin. Employees (tax preparers) log in to search and manage their assigned clients, view and edit invoices, record payments, manage files, and message clients. Built with Node/Express + vanilla JS + Microsoft SQL Server.

## Related Project
The **Client Portal** lives in the `frosty-dubinsky` worktree (`C:\projects\ACE\.claude\worktrees\frosty-dubinsky`), runs on port 3000, and shares the same database. Both portals use the same `.env` file and the same `repository` folder for file storage.

## Worktree / Repo Layout
- Main repo: `C:\projects\ACE`
- **All code lives here**: `C:\projects\ACE\.claude\worktrees\elegant-mclean` (this directory)
- GitHub remote: `https://github.com/HondaST/ACE.git` (branch: `claude/elegant-mclean`)
- File uploads stored at: `C:\projects\ace\repository\{sui}\{suie}\{file_info_id}-{filename}`

## Running the Server
Port **3001** (env var: `EMP_PORT`). The `.env` file is three levels up (`C:\projects\ACE\.env`).

```powershell
cd C:\projects\ACE\.claude\worktrees\elegant-mclean
node server.js
```

Shortcut: **`Tax Paladin Admin.bat`** on the desktop — starts the server and opens the browser. If port 3001 is already in use it just opens the browser.

If you need to kill the server manually:
```powershell
Stop-Process -Id (Get-NetTCPConnection -LocalPort 3001 -State Listen).OwningProcess -Force
```

## Environment Variables (`.env` at repo root — shared with client portal)
| Variable | Purpose |
|---|---|
| `DB_SERVER` | SQL Server host, e.g. `localhost,1433` |
| `DB_DATABASE` | Database name |
| `DB_USER` | SQL login |
| `DB_PASSWORD` | SQL password |
| `DB_ENCRYPT` | `true` / `false` |
| `DB_TRUST_SERVER_CERT` | `true` / `false` |
| `JWT_SECRET` | Secret for signing JWTs (shared with client portal) |
| `EMP_PORT` | Server port (default 3001) |

## Key Files
| File | Purpose |
|---|---|
| `server.js` | Entry point — Express setup, route mounting |
| `db/index.js` | MSSQL connection pool (`mssql` / `tedious`) |
| `middleware/auth.js` | JWT Bearer token validation; checks `role === 'employee'` |
| `routes/auth.js` | `POST /api/auth/login` (authenticates against `employee` table) |
| `routes/employee.js` | All employee-facing API routes (protected) |
| `public/login.html` | Login page (served at `/`) — has dev credentials pre-filled, remove before production |
| `public/employee-dashboard.html` | Main dashboard shell |
| `public/js/dashboard.js` | All dashboard JavaScript (single file) |
| `scripts/set-password.js` | CLI utility to set an employee's password hash |

## Authentication Flow
- Login: `POST /api/auth/login` with `{ username, password }` → returns JWT token (8h expiry)
- JWT payload: `{ emp_id, username, name, role: 'employee' }`
- Authenticates against the `employee` table (needs `username` and `password_hash` columns)
- All `/api/employee/*` routes require `Authorization: Bearer <token>`
- Token stored in `localStorage` under key `token`
- `emp_id` is normalized to a string in middleware (DB may return it as integer)

## Database Tables
Shared with the client portal. Key tables for this app:

| Table | Key Columns |
|---|---|
| `employee` | `emp_id`, `username`, `password_hash`, `first_name`, `last_name`, `ero_id` |
| `people` | `sui` (PK), `username`, `password_hash`, `first_name`, `last_name`, `cell`, `email` |
| `people_entity` | `suie` (PK), `sui` (FK→people), `entity_type`, `taxidnumber`, `first_name`, `last_name`, `entityname`, `street`, `city`, `state`, `zipcode`, `cell`, `email`, `assigned_prep` (FK→employee.emp_id), `created_date` |
| `entity_type` | `et_id`, `et_desc` |
| `offices` | `office_id`, `office_desc`, `ero_id` |
| `invoice` | `invoice_no`, `suie`, `sui`, `emp_id`, `office_id`, `tax_year`, `inv_desc`, `inv_full_amount`, `inv_discount`, `inv_final_amount`, `inv_date`, `rt_ind` (Y/N), `void_ind` (Y/N) |
| `payment` | `invoice_no`, `sequence_no`, `payment_amount`, `payment_type_id`, `payment_date` |
| `payment_type` | `payment_type_id`, `payment_type_desc` |
| `file_info` | `file_info_id`, `suie`, `tax_year`, `file_type_id`, `file_info_name`, `file_size`, `file_notes`, `created_dt` |
| `file_type` | `file_type_id`, `file_type_desc` |
| `msg_queue` | `msg_id`, `suie`, `msg_subject`, `msg_text`, `sent_by_id` ('E'=employee, 'C'=client), `to_id`, `from_id`, `msg_create_dt` |

**Important notes:**
- Table is `offices` (not `office`)
- `suie` is `NVarChar(50)` — always cast to string when passing as a parameter
- `rt_ind` and `void_ind` are stored as `'Y'`/`'N'` single characters (not 'Yes'/'No')
- Employees only see entities where `people_entity.assigned_prep = emp_id`

## API Routes (`/api/employee/*` — all require JWT)

### Employee Info
- `GET /info` — employee name from `employee` table

### Search (main grid)
- `GET /search` — filtered search across assigned entities + their invoices. Query params: `client`, `tax_id`, `invoice_no`, `tax_year`, `email`, `date_from`, `date_to`, `cell`, `balance_due`, `preparer`, `office_id`
- Returns entities LEFT JOINed with invoices (entities with no invoices still appear)
- Right-click on Tax Number cell in grid → context menu to search by that tax ID

### Clients (entities)
- `GET /clients` — all entities assigned to this employee
- `GET /clients/:suie` — single entity detail
- `PUT /clients/:suie` — update entity info

### Invoices
- `GET /clients/:suie/invoices` — all invoices for entity, includes `bal_due`
- `POST /invoices` — create invoice `{ suie, tax_year, inv_desc, inv_full_amount, inv_discount, office_id, rt_ind }` — verifies entity is assigned to employee; auto-populates `sui` via subquery
- `PUT /invoices/:invoice_no` — update invoice — scoped to `emp_id`

### Payments
- `GET /payments/:invoice_no` — payments for invoice, includes `inv_final_amount` for paid-in-full detection
- `POST /payments` — record payment `{ invoice_no, payment_amount, payment_type }`
- Record Payment button is disabled when `totalPaid >= inv_final_amount`

### Files
- `GET /clients/:suie/files?year=` — files for entity, optional year filter
- `GET /files/:fileInfoId/open` — serve file bytes (scoped to employee's assigned entities)
- `POST /upload/:suie?file_type_id=&tax_year=&filename=` — upload file (raw octet-stream body)

### Messages
- `GET /clients/:suie/messages` — message thread for entity
- `POST /messages` — send message to client `{ subject, text, suie }` — `sent_by_id = 'E'`

### Lookups
- `GET /entity-types` — `et_id`, `et_desc`
- `GET /file-types` — `file_type_id`, `file_type_desc`
- `GET /payment-types` — `payment_type_id`, `payment_type_desc`
- `GET /offices` — offices for this employee's ERO (`ero_id` join)
- `GET /preparers` — all employees (for search filter dropdown)

### Profile
- `GET /profile` — employee name
- `PUT /profile/password` — change password (bcrypt, min 6 chars)

## Frontend Patterns
- Single-page dashboard with a search/results grid as the main view
- Clicking a row in the grid opens a detail panel with tabs: Details, Invoices, Payments, Files, Messages
- `apiFetch(url, options)` — wrapper that injects Bearer token; returns `null` on error
- `getToken()` — reads `localStorage.token`
- `redirectLogin()` — clears token, redirects to `/`
- `fmt$(n)` — formats a number as USD currency

## Entity Type Logic
- `entity_type === 'PERS'` → personal return; uses `first_name` + `last_name`; `display_name` = `"Last, First"`
- All other types → business; uses `entityname`; `display_name` = `entityname`
- `entityname` always stored as `"Last, First"` for PERS, raw name for business types
