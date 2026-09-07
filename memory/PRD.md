# AgriERP — Product Requirements & Status

Multi-tenant SaaS ERP for agri traders and cold-storage operators (formerly "Potato ERP").
Stack: React (CRA + Tailwind + shadcn/ui) · FastAPI · MongoDB (Motor) · JWT auth · Resend (email).

## Original problem statement
"I want to build ERP — in that PDF all requirements we can satisfy."
Complete trading ERP: Purchase, Sale, Stock, Party Ledger, Invoices, Godowns, Lot traceability,
with a unified `Parties` model, data-driven `Product Categories`, and multi-tenant SaaS architecture
(business → many companies → separate books).

## Architecture
```
/app/backend
  server.py     FastAPI app + all routes (~1400 lines)
  scoping.py    tenant isolation + RBAC (`require_perm`, `is_admin`)
  core.py, mailer.py
/app/frontend/src
  App.js
  context/AuthContext.jsx     user, tenant, companies, perms, isAdmin
  lib/api.js  pdf.js  excel.js  validate.js
  components/ AdminLayout.jsx  Shell.jsx  CrudPage.jsx  SearchableSelect.jsx
              Logo.jsx  FormField.jsx  DashboardInsights.jsx  SeasonComparison.jsx
  pages/      Login, Signup, Dashboard, Parties, Companies, Categories, Products,
              PriceLists, PartyMerge, Godowns, TxnPage (purchases/sales), Receipts,
              CreditNotes, DebitNotes, Stock, LotTrace, Ledger, Invoices, Reports,
              Users, Roles, Settings, ScheduleHistory, Platform (super admin)
```

## Data model (key collections)
- tenants: { _id, name, plan, status, plan_expires, created_at }
- companies: { _id, tenant_id, name, gstin, phone, email, address }
- users: { _id, tenant_id, email, password, role (owner/admin/operator/custom), role_id }
- roles: { _id, tenant_id, name, permissions: { feature: [view, create, edit, delete] } }
- parties: { _id, tenant_id, name, roles[], phone, gstin, bank fields }
- product_categories: { _id, tenant_id, name, unit, custom_fields[] }
- products, godowns, purchases, sales, receipts, credit_notes, debit_notes, price_lists, ledger

## Implemented

### Earlier iterations
- Multi-tenant SaaS: signup wizard, tenant/company scoping, plans + limits, platform console
- Masters: parties (unified roles), companies, categories with custom fields, products, godowns
- Transactions: purchases, sales (GST, rate alerts), receipts, credit notes, debit notes
- Inventory: bag/weight stock, godown-wise, lot traceability
- Accounts: party ledger (+ email statement), invoices with payment recording, PDF/Excel export
- Reports + dashboard insights + season comparison
- Party price lists, party merge tool, searchable/autocomplete dropdowns
- Custom roles / RBAC with per-feature View/Create/Edit/Delete, enforced backend + frontend
- Lot number hidden on sale bills (kept in records)

### 2026-06 — Rebrand + UI/UX overhaul + validation layer (iteration 13)
- Rebrand "Potato ERP" → **AgriERP** everywhere (UI, PDF exports, page title, API title,
  favicon); "Workspace" → **Business** in all UI copy and backend messages
- New `Logo.jsx`: SVG icon-mark (grid + sprout) + wordmark, light/dark tones; `public/favicon.svg`
- Redesigned **Login**: split-screen brand panel, inline validation, password show/hide
- Redesigned **Signup onboarding**: 3 steps (Business → Company → Account) with per-step
  validation, progress indicator; GSTIN now persisted on the first company
- Redesigned **AdminLayout**: collapsible sidebar groups (Dashboard, Masters, Transactions,
  Inventory, Accounts, Reports, Settings), auto-expand of the active group, sticky topbar with
  page title + user popover, mobile drawer; RBAC-aware nav filtering + access-restricted screen
- **Validation layer** `lib/validate.js` + `FormField.jsx`: rules for email, phone, gstin, ifsc,
  aadhaar, hsn, bank_account, pincode, positive, nonneg, percent, date, notFuture, min/max length.
  Wired into CrudPage (all master/transaction forms), Login, Signup, Users, Companies, Settings,
  Roles, Ledger, Invoices payment dialog
- Redesigned **Super Admin console** (`/platform`): left nav (Overview / Businesses / Plans),
  stat cards, search + status filter, validated plan dialog, mobile drawer
- Mobile (iPhone 390px): drawer nav, symmetric spacing, all wide tables scroll internally
  (verified document.scrollWidth === 390 on dashboard, sales, ledger, reports)
- Tested: `/app/test_reports/iteration_13.json` — ~97% pass; the one reported bug (mobile
  dashboard horizontal overflow) was fixed and re-verified

## Backlog
- P0 **Quick Entry Mode** — keyboard-only fast entry screen for busy season days
- P1 **Role cloning** — duplicate an existing role as a starting point
- P2 **Router split** — break `server.py` into routers (platform, cron, masters, txns)
- P2 **Billing self-serve** — customers upgrade their own plan in-app
- P2 **Plan downgrade guard** — block downgrades when limits are exceeded
- P2 Backend-side validation mirroring the new frontend rules (currently boundary-only)

## Credentials
See `/app/memory/test_credentials.md`.
