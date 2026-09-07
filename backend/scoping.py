"""Tenant/company scoping. Every data collection is filtered and stamped automatically."""
from typing import Optional

from fastapi import Depends, HTTPException, Request

from core import db, get_current_user, oid, now_iso

# Collections that hold tenant data (scoped). Others (users, tenants, settings) are handled explicitly.
SCOPED = {
    "parties", "product_categories", "products", "godowns", "price_lists",
    "purchases", "sales", "ledger", "receipts", "credit_notes", "debit_notes", "counters", "roles",
}
# Tenant-wide (shared across the tenant's companies)
TENANT_ONLY = {"parties", "counters", "roles"}

# Assignable features (feature key -> operations that make sense for it). Used by the role builder
# and enforced server-side. users/settings/companies/party-merge/roles stay owner/admin only.
ALL_FEATURES = {
    "dashboard": ["view"],
    "parties": ["view", "create", "edit", "delete"],
    "product-categories": ["view", "create", "edit", "delete"],
    "products": ["view", "create", "edit", "delete"],
    "price-lists": ["view", "create", "edit", "delete"],
    "godowns": ["view", "create", "edit", "delete"],
    "purchases": ["view", "create", "edit", "delete"],
    "sales": ["view", "create", "edit", "delete"],
    "stock": ["view"],
    "lots": ["view"],
    "ledger": ["view", "create", "edit", "delete"],
    "receipts": ["view", "create", "edit", "delete"],
    "credit-notes": ["view", "create", "edit", "delete"],
    "debit-notes": ["view", "create", "edit", "delete"],
    "invoices": ["view"],
    "reports": ["view"],
}
# Legacy "operator" role — entry screens only (matches the historical operator access).
OPERATOR_PERMS = {
    "dashboard": ["view"],
    "parties": ["view", "create", "edit", "delete"],
    "product-categories": ["view", "create", "edit", "delete"],
    "products": ["view", "create", "edit", "delete"],
    "godowns": ["view", "create", "edit", "delete"],
    "price-lists": ["view", "create", "edit", "delete"],
    "purchases": ["view", "create", "edit", "delete"],
    "sales": ["view", "create", "edit", "delete"],
    "stock": ["view"],
    "lots": ["view"],
}


async def compute_perms(user: dict) -> dict:
    """Server-derived effective permissions for a tenant user. Never trust client-sent perms."""
    role = user.get("role")
    if role in ("owner", "admin"):
        return {f: list(ops) for f, ops in ALL_FEATURES.items()}
    if role == "custom" and user.get("role_id"):
        rdoc = await db.roles.find_one({"_id": oid(user["role_id"]), "tenant_id": user.get("tenant_id")})
        raw = (rdoc or {}).get("permissions", {}) or {}
        return {f: [o for o in (raw.get(f) or []) if o in ALL_FEATURES.get(f, [])]
                for f in ALL_FEATURES if raw.get(f)}
    return {f: list(ops) for f, ops in OPERATOR_PERMS.items()}


def has_perm(scope: dict, feature: str, op: str) -> bool:
    return op in (scope.get("perms", {}).get(feature) or [])


def ensure_perm(scope: dict, feature: str, op: str) -> None:
    if not has_perm(scope, feature, op):
        raise HTTPException(status_code=403, detail="You don't have permission for this action")


class ScopedCollection:
    def __init__(self, coll, tenant_id: str, company_id: Optional[str], company_scoped: bool):
        self._c = coll
        self._tenant = tenant_id
        self._company = company_id
        self._company_scoped = company_scoped

    def _filter(self, flt: Optional[dict] = None) -> dict:
        out = dict(flt or {})
        out["tenant_id"] = self._tenant
        if self._company_scoped and self._company:
            out["company_id"] = self._company
        return out

    def _stamp(self, doc: dict) -> dict:
        out = dict(doc)
        out["tenant_id"] = self._tenant
        if self._company_scoped:
            out["company_id"] = self._company
        return out

    def find(self, flt=None, *a, **kw):
        return self._c.find(self._filter(flt), *a, **kw)

    async def find_one(self, flt=None, *a, **kw):
        return await self._c.find_one(self._filter(flt), *a, **kw)

    async def count_documents(self, flt=None, *a, **kw):
        return await self._c.count_documents(self._filter(flt), *a, **kw)

    async def insert_one(self, doc, *a, **kw):
        return await self._c.insert_one(self._stamp(doc), *a, **kw)

    async def update_one(self, flt, update, *a, **kw):
        if "$set" in update:
            update = {**update, "$set": self._stamp(update["$set"])}
        return await self._c.update_one(self._filter(flt), update, *a, **kw)

    async def delete_one(self, flt, *a, **kw):
        return await self._c.delete_one(self._filter(flt), *a, **kw)

    async def delete_many(self, flt, *a, **kw):
        return await self._c.delete_many(self._filter(flt), *a, **kw)

    async def find_one_and_update(self, flt, update, *a, **kw):
        if "$inc" in update:
            kw.setdefault("upsert", True)
        return await self._c.find_one_and_update(self._filter(flt), update, *a, **kw)


class ScopedDB:
    def __init__(self, tenant_id: str, company_id: Optional[str]):
        self.tenant_id = tenant_id
        self.company_id = company_id

    def __getattr__(self, name):
        coll = getattr(db, name)
        if name not in SCOPED:
            return coll
        return ScopedCollection(coll, self.tenant_id, self.company_id, name not in TENANT_ONLY)

    def __getitem__(self, name):
        return self.__getattr__(name)


async def get_scope(request: Request, user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") == "superadmin":
        raise HTTPException(status_code=403, detail="Platform accounts cannot access tenant data")
    tenant_id = user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No workspace linked to this account")
    tenant = await db.tenants.find_one({"_id": oid(tenant_id)})
    if not tenant:
        raise HTTPException(status_code=403, detail="Workspace not found")
    if tenant.get("status") == "suspended":
        raise HTTPException(status_code=402, detail="This workspace is suspended. Contact support to reactivate.")
    if tenant.get("plan_expires") and tenant["plan_expires"] < now_iso()[:10]:
        raise HTTPException(status_code=402, detail="Your subscription has expired. Renew to continue.")

    company_id = request.headers.get("X-Company-Id") or user.get("default_company_id")
    company = None
    if company_id:
        company = await db.companies.find_one({"_id": oid(company_id), "tenant_id": tenant_id})
    if not company:
        company = await db.companies.find_one({"tenant_id": tenant_id})
    if not company:
        raise HTTPException(status_code=400, detail="Create a company first")

    perms = await compute_perms(user)
    return {
        "user": user,
        "tenant": {"id": tenant_id, "name": tenant.get("name"), "plan": tenant.get("plan"),
                   "status": tenant.get("status")},
        "company_id": str(company["_id"]),
        "company": {"id": str(company["_id"]), "name": company.get("name")},
        "perms": perms,
        "is_admin": user.get("role") in ("owner", "admin"),
        "db": ScopedDB(tenant_id, str(company["_id"])),
    }


def require_perm(feature: str, op: str):
    async def dep(scope: dict = Depends(get_scope)) -> dict:
        ensure_perm(scope, feature, op)
        return scope
    return dep


async def require_admin_scope(scope: dict = Depends(get_scope)) -> dict:
    if scope["user"].get("role") not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return scope


async def require_superadmin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "superadmin":
        raise HTTPException(status_code=403, detail="Platform admin access required")
    return user
