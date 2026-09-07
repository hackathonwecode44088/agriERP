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

- **It. 8 (2026-06) — Multi-tenant SaaS pivot**: landing page removed (`/` → Login), 3-step signup onboarding (workspace → first company → owner account), `scoping.py` `ScopedDB` stamping/filtering `tenant_id` + `company_id` on every data collection (parties & counters are tenant-wide, everything else company-scoped), multiple companies per tenant with sidebar switcher (`X-Company-Id` header), plans (trial 1co/3users free · basic 2/5 ₹999 · pro 5/20 ₹2499) with 402 upgrade prompts, super-admin Platform Console at `/platform` (stats, MRR, plan/expiry edit, extend days, suspend/reactivate, delete tenant), suspension & expiry blocking with 402, superadmin↔tenant cross-access blocked (403)
- Verified It. 8: backend 26/26 (`backend/tests/test_saas_multitenant.py`, run with `-n 0`) + frontend smoke (signup→dashboard, company switcher, plan cap, platform console). Obsolete `test_iteration7.py` removed (pre-SaaS creds no longer seeded)

- **It. 9 (2026-06) — Price Lists, Category Custom Fields, Party Merge**: `price-lists` master (party+product+kind agreed rate) with `GET /api/price-lists/lookup` auto-filling rate/rate_basis on NEW purchase/sale entry; per-category `custom_fields` (`parse_custom_fields` → `{key,label,type}`, text/number types) that render dynamically on purchase/sale entry and save into the txn `custom` dict; manual Party Merge (`GET /api/parties/duplicates`, `POST /api/parties/merge`) with a UI to auto-detect duplicates + manually pick keep/source, moving all history. Verified: iteration_9.json 7/7 flows pass.
- **It. 10 (2026-06) — Lot hidden on sale bill, Debit Notes, Searchable dropdowns**: sale invoice PDF no longer prints Lot No (kept on purchase voucher + still stored); `debit_notes` collection + CRUD posting a DEBIT to the party ledger (mirror of credit notes); `SearchableSelect` (cmdk + popover) combobox replaces all CrudPage form + filter selects for type-to-search. Verified: iteration_10.json 100%.
- **It. 11–12 (2026-06) — Custom Roles + RBAC**: per-tenant `roles` collection with feature×operation permissions (`ALL_FEATURES`, ops view/create/edit/delete); `roles` CRUD (`GET /api/roles`, `GET /api/roles/features`, POST/PUT/DELETE, admin-only) + a permission-matrix builder page (`Roles.jsx`); staff users can be assigned `role="custom"` + `role_id`; **server-side deny-by-default enforcement** via `compute_perms`/`ensure_perm`/`require_perm` in `scoping.py` — `register_master`/`register_txn` and ledger/receipts/credit-notes/debit-notes/invoices/reports endpoints all gated; owner/admin = full, legacy operator = entry screens, custom = assigned perms; `/auth/me` returns `perms`+`is_admin`; frontend gates sidebar nav, CrudPage + Ledger action buttons, and shows Access Restricted on direct nav. Verified: iteration_11.json (backend 12/12, frontend ~95%) + iteration_12.json (Ledger gating fix 100%).

## Personas (updated)
- **Admin / Owner** — every screen, all accounts, settings, roles & staff management
- **Operator** — legacy entry-screens-only role
- **Custom role** — any tenant-defined role with feature×operation (view/create/edit/delete) permissions

## Backlog
- P2: Split `server.py` (~1,200 lines) into a `routers/` package
- P2: `/api/outstanding` via an aggregation pipeline instead of Python loops
- P2: Test flipping a paid cash sale back to unpaid (ledger counter-entry removal)
- P2: GSTIN/email format validation on Company Profile; DialogDescription for Radix a11y warning
- P3: Lot trace groups blank lot numbers under "(no lot)"

## Next Tasks
1. P1 Quick entry mode — keyboard-only fast entry screen for busy season
2. P2 Router split (`server.py` ~1,400 lines → `routers/platform.py`, `routers/cron.py`, `routers/accounts.py`)
3. P2 Plan downgrade guard; drop the unused login cookie; self-heal default categories
4. P2 Billing self-serve — let tenants upgrade their own plan in-app
5. P3 Seed a couple of default custom roles (Accountant, Counter Staff) on new tenants
