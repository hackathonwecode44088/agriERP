# Potato Management Software (ERP) — PRD

## Original Problem Statement
"I want to build ERP in that PDF all Requirement we can satisfied in that" — attached PDF: *Potato - Management Software*.
Spec: Website Module (landing page with company info) + Admin Module with Login, Dashboard (Total Seeds / Purchased Potatoes / Leno Bag summaries), Vendor Manage, Product/Purchase/Stock for Seeds, Godown & Cold Storage Manage, Farmer Manage, Farmer Ledger, Product/Purchase/Stock for Leno Bag, Sell Seeds & Leno Bag to Farmer, Product/Purchase/Stock for Potato (Lot No., Vehicle No., Bag/Katta, Weight), Company Manage, Sell Potato to Company, Invoices (Cash/Online/Cheque), Credit Notes, Reports, Logout. Masters need Add / Update / Delete / Temporary Close / View.

## User Choices
- Auth: JWT username/password, seeded admin
- Language: English only
- Invoices: PDF generate + download
- Payments: record entry only (no gateway)
- Scope: everything in phase 1

## Architecture
- Backend: FastAPI (`/app/backend/server.py`, `core.py`), MongoDB via Motor, JWT (PyJWT) + bcrypt, all routes under `/api`
- Frontend: React 19 + React Router, Tailwind + shadcn/ui, generic `CrudPage` component driving all master/transaction screens, jsPDF for invoice/ledger/report PDFs
- Collections: users, vendors, farmers, companies, godowns, products, purchases, sales, credit_notes, ledger, counters, settings

## Personas
- **Admin / Owner** — sole role. Manages masters, records purchases & sales, tracks farmer ledgers, stock and reports.

## Core Requirements (static)
1. Public landing page with company information + admin login entry
2. Seeded-admin JWT login/logout with protected admin area
3. Masters with full CRUD + temporary close: vendors, farmers, companies, godowns, products (per category)
4. Purchases & sales for seeds / leno bag / potato with Lot No., Vehicle No., bags, weight, rate basis, Cash (રોકડા) / Credit (ઉધાર), payment mode Cash/Online/Cheque
5. Stock: product-wise, godown-wise and lot-wise balances
6. Farmer ledger with auto entries from sales, potato purchases and credit notes + running balance
7. Invoices/vouchers with sequential numbering and PDF download
8. Credit notes
9. Filterable reports with PDF export
10. Dashboard summaries

## Implemented (2026-06)
- All 10 core requirements above, verified by testing agent (backend 25/25, frontend 11/11)
- Auto invoice numbering (INV-/PUR-/CN-), auto ledger sync on create/update/delete of source transactions
- PDF: invoice/voucher, farmer ledger statement, transaction report

## Implemented — Iteration 2 (2026-06)
- **Company Profile** (`/admin/settings`): edit name, tagline, about, phone, email, GSTIN, address; reflected on the public website and all PDFs
- **Payments & Receipts** (`/admin/receipts`): receipt entries (received / paid out) for farmers and companies with auto receipt numbers; farmer receipts auto-post to the ledger (received = credit, paid = debit) and sync on edit/delete; Farmer & Company Outstanding tables via `/api/outstanding`
- **Excel export** (SheetJS): Reports, Farmer Ledger, Stock and Lot Traceability, alongside existing PDF export
- **Lot Traceability** (`/admin/lots`): expandable lot cards joining each potato purchase with its company sales by lot no., showing sold/balance bags and gross margin
- Verified by testing agent: backend 36/36, frontend all new-feature + regression checks passed

## Implemented — Iteration 3 (2026-06)
- **GST breakup**: sale entry takes a GST rate (0/5/12/18/28); backend stores taxable amount, CGST, SGST and GST-inclusive total; shown in the entry preview, sales/invoice tables and on the invoice PDF
- **Staff logins & roles**: admin-only `/admin/users` CRUD (create/edit role/reset password, self-demotion and self-delete blocked); roles `admin` and `operator`; operators see only entry screens — Accounts/Settings nav hidden, restricted routes show an "Access restricted" panel, and 8 backend endpoint groups enforce 403 via a `require_admin` dependency; dashboard hides farmer balance for operators
- **Rate alerts**: `/api/rate-stats` returns avg/min/max/last rate over the last 20 entries per product; purchase and sale dialogs warn when the entered rate deviates more than 20% from the recent average
- Verified by testing agent: backend 65/65 (29 new + 36 regression), all frontend iteration-3 flows passed

## Implemented — Iteration 4 (2026-06)
- **Configurable rate-alert threshold**: `rate_alert_threshold` on the company profile (default 20%), edited in Company Profile and honoured by purchase/sale entry warnings
- **Farmer statement sharing**: WhatsApp deep-link share of the statement summary and one-tap email of the full statement via the Emergent-managed Resend integration (`POST /api/ledger/{farmer_id}/email-statement`, admin-only, recipient from the farmer record, guardrail gate in `mailer.py`); farmers master gained an email field
- **Season comparison**: `/api/dashboard/seasons` (season = 1 Nov – 31 Oct) with current vs previous purchases, sales, margin, bags and % change, shown on the dashboard
- **Entry validation**: sales are blocked with a clear 400 when bags exceed product or lot availability (and kg when the sale is weight-based); edits exclude their own quantity from the check
- Verified by testing agent: 12/12 new backend tests and all frontend flows passed (4 legacy iteration-2/3 tests now fail only because they created sales without purchases — test artefacts, not app bugs)

## Backlog
- P1: Auto-settle company outstanding when a potato sale is recorded as already paid on the invoice
- P2: Refresh the rate threshold on entry screens without a page reload
- P2: Show an error banner if the season-comparison widget fails to load
- P2: GSTIN/email format validation on Company Profile; DialogDescription for Radix a11y warning
- P3: Update legacy tests in test_iteration2/3 to seed a purchase before creating sales
- P3: Lot trace edge case — purchases with a blank lot no. group under "(no lot)"

## Next Tasks
1. Payment status on invoices with auto-settlement
2. Season-over-season charts on the dashboard
3. Legacy test seed updates
