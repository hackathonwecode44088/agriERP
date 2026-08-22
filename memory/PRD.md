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

## Backlog
- P1: Editable company profile screen in admin (API `PUT /api/company-profile` exists, no UI yet)
- P1: Payment receipt entries against farmer/company outstanding balances
- P1: Validate `party_id` / `product_id` references on purchase & sale creation
- P2: Multi-user roles (accountant/operator), Excel export, GST tax breakup on invoices
- P2: DialogDescription for Radix a11y warning

## Next Tasks
1. Company profile settings screen
2. Payments/receipts module with outstanding tracking
3. Excel export alongside PDF for reports
