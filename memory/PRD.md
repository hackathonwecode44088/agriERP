# Potato Management Software (ERP) — PRD

## Original Problem Statement
"I want to build ERP in that PDF all Requirement we can satisfied in that" — attached PDF: *Potato - Management Software* (website module + admin module: login, dashboard, vendor/farmer/company masters, seeds / leno bag / potato products, purchases, sales, stock, godown & cold storage, farmer ledger, invoices with cash/online/cheque, credit notes, reports, logout; masters need add / update / delete / temporary close / view).

## User Choices (accumulated)
- Auth: JWT username/password, seeded admin · Language: English · Invoices: PDF download · Payments: record entry only (no gateway)
- Iteration 7 (user-directed refactor): merge Vendor/Farmer/Company into ONE party entity with roles so anyone can buy and sell; single editable product-category master + one products table; one Purchase / Sale / Stock screen each; universal ledger for all parties; **old data discarded, fresh start**

## Architecture
- Backend: FastAPI (`server.py`, `core.py`, `mailer.py`), MongoDB via Motor, JWT + bcrypt, all routes under `/api`, `register_master()` / `register_txn()` factories
- Frontend: React 19 + React Router, Tailwind + shadcn/ui, generic `CrudPage` (filters, multiselect, dependent option lists), recharts, jsPDF, SheetJS
- Scheduling: platform crons in `.emergent/crons.yml` → secret-protected, idempotent background endpoints
- Email: Emergent-managed Resend (`mailer.py` with the safe-email guardrail gate)

## Data Model (current)
- `parties` — one record per person/business, `roles: ["farmer","vendor","customer"]`; any party can buy and sell
- `product_categories` — editable master (`unit`, `tracks_lot`, `gst_default`); Seeds / Leno Bag / Potato seeded
- `products` — single table linked by `category_id`
- `purchases` / `sales` — `party_id` + `category_id`, lot/vehicle, bags/weight, rate basis, GST, payment type/mode/status
- `ledger` — universal per `party_id`; **debit = party owes you, credit = you owe the party**
- `receipts`, `credit_notes`, `godowns`, `users`, `settings`, `counters`, `cron_runs`

## Personas
- **Admin / Owner** — every screen, all accounts and settings
- **Operator** — entry screens only (parties, categories, products, godowns, purchases, sales, stock, lot traceability)

## Implemented
- **It. 1** Landing page, JWT login, dashboard, masters CRUD + temporary close, purchases/sales/stock per category, farmer ledger, credit notes, invoices with PDF, reports
- **It. 2** Company profile, payments & receipts with outstanding, Excel export everywhere, lot traceability
- **It. 3** GST (CGST/SGST) breakup on invoices, staff logins with admin/operator RBAC, rate alerts
- **It. 4** Configurable rate-alert threshold, WhatsApp + email statements, season comparison, sale stock validation
- **It. 5** Invoice payment status with auto-settlement, month-by-month season chart, low-stock warnings, monthly statement cron
- **It. 6** Partial payments against invoices, schedule history with recipients, reorder suggestions, balance-reminder cron
- **It. 7 (2026-06)** Unified `parties` with multi-role buy+sell netting into one ledger; editable category master + single Products / Purchases / Sales / Stock / Lot screens; universal receivable/payable outstanding; partial payments on purchase vouchers too; obsolete farmer/vendor/company endpoints removed; data reset via `reset_data.py`
- Verified: backend 42/42 (`backend/tests/test_iteration7.py`, run with `-n 0`), full frontend smoke incl. role gating

## Backlog
- P2: Split `server.py` (~1,200 lines) into a `routers/` package
- P2: `/api/outstanding` via an aggregation pipeline instead of Python loops
- P2: Test flipping a paid cash sale back to unpaid (ledger counter-entry removal)
- P2: GSTIN/email format validation on Company Profile; DialogDescription for Radix a11y warning
- P3: Lot trace groups blank lot numbers under "(no lot)"

## Next Tasks
1. Router split for maintainability
2. Per-category custom fields (e.g. cold-storage rent, grading)
3. Party-wise price lists / default rates
