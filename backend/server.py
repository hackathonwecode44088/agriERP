from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Body, Depends, FastAPI, HTTPException, Request, Response
from starlette.middleware.cors import CORSMiddleware

from core import (
    create_access_token, db, get_current_user, hash_password, now_iso, oid, ser, verify_password,
)
from mailer import reminder_html, send_email, statement_html
from scoping import (
    ALL_FEATURES, ScopedDB, compute_perms, ensure_perm, get_scope,
    has_perm, require_admin_scope, require_perm, require_superadmin,
)
from notify import GENERAL, notify, purge

app = FastAPI(title="AgriERP")
api = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)

ROLES = ("farmer", "vendor", "customer")
PLANS = {
    "trial": {"label": "Trial", "max_companies": 1, "max_users": 3, "price": 0},
    "basic": {"label": "Basic", "max_companies": 2, "max_users": 5, "price": 999},
    "pro": {"label": "Pro", "max_companies": 5, "max_users": 20, "price": 2499},
    "enterprise": {"label": "Enterprise", "max_companies": 50, "max_users": 200, "price": 7999},
}
DEFAULT_CATEGORIES = []


def num(v) -> float:
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def as_list(v) -> list:
    if isinstance(v, list):
        return [str(x) for x in v if str(x) in ROLES]
    return [v] if isinstance(v, str) and v in ROLES else []


def parse_custom_fields(value) -> list:
    raw = value if isinstance(value, list) else str(value or "").split(",")
    out, seen = [], set()
    for item in raw:
        if isinstance(item, dict):
            label = str(item.get("label") or item.get("key") or "").strip()
            ftype = item.get("type") if item.get("type") in ("text", "number") else "text"
        else:
            label, ftype = str(item).strip(), "text"
        key = "".join(ch if ch.isalnum() else "_" for ch in label.lower()).strip("_")
        if label and key and key not in seen:
            seen.add(key)
            out.append({"key": key, "label": label, "type": ftype})
    return out


async def next_number(sdb: ScopedDB, prefix: str) -> str:
    doc = await sdb.counters.find_one_and_update(
        {"prefix": prefix}, {"$inc": {"seq": 1}}, upsert=True, return_document=True)
    return f"{prefix}-{doc['seq']:05d}"


async def company_profile(sdb: ScopedDB) -> dict:
    doc = await db.companies.find_one({"_id": oid(sdb.company_id)})
    out = ser(doc) or {}
    out.setdefault("rate_alert_threshold", 20)
    out.setdefault("low_stock_threshold", 10)
    return out


# ---------------------------------------------------------------- auth & onboarding
@api.post("/auth/signup")
async def signup(payload: dict = Body(...)):
    email = str(payload.get("email", "")).strip().lower()
    password = str(payload.get("password", ""))
    workspace = str(payload.get("workspace_name", "")).strip()
    company_name = str(payload.get("company_name", "")).strip() or workspace
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Enter a valid email address")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    if not workspace:
        raise HTTPException(status_code=400, detail="Business name is required")
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="An account with this email already exists")

    trial_end = (datetime.now(timezone.utc) + timedelta(days=14)).date().isoformat()
    tenant = await db.tenants.insert_one({
        "name": workspace, "plan": "trial", "status": "active", "plan_expires": trial_end,
        "owner_email": email, "created_at": now_iso(),
    })
    tenant_id = str(tenant.inserted_id)
    company = await db.companies.insert_one({
        "tenant_id": tenant_id, "name": company_name, "tagline": "", "about": "",
        "phone": payload.get("phone", ""), "email": email, "address": "",
        "gstin": str(payload.get("gstin", "")).strip().upper(),
        "rate_alert_threshold": 20, "low_stock_threshold": 10, "created_at": now_iso(),
    })
    company_id = str(company.inserted_id)
    user = await db.users.insert_one({
        "email": email, "name": payload.get("name") or email.split("@")[0], "role": "owner",
        "tenant_id": tenant_id, "default_company_id": company_id,
        "password_hash": hash_password(password), "created_at": now_iso(),
    })
    sdb = ScopedDB(tenant_id, company_id)
    await notify(sdb, feature=GENERAL, kind="welcome", title=f"Welcome to AgriERP, {workspace}",
                 body="Start by adding your product categories, then parties and your first purchase.")
    token = create_access_token(str(user.inserted_id), email)
    return {"access_token": token, "user": ser(await db.users.find_one({"_id": user.inserted_id})),
            "tenant_id": tenant_id, "company_id": company_id}


@api.post("/auth/login")
async def login(response: Response, payload: dict = Body(...)):
    email = str(payload.get("email", "")).strip().lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(str(payload.get("password", "")), user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(str(user["_id"]), email)
    response.set_cookie("access_token", token, httponly=True, secure=True,
                        samesite="none", max_age=604800, path="/")
    return {"user": ser(user), "access_token": token}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    out = {"user": user, "companies": [], "tenant": None}
    if user.get("role") == "superadmin":
        return out
    tenant = await db.tenants.find_one({"_id": oid(user["tenant_id"])}) if user.get("tenant_id") else None
    if tenant:
        out["tenant"] = {**ser(tenant), "plan_label": PLANS.get(tenant.get("plan"), {}).get("label", "—")}
        out["companies"] = [ser(c) for c in
                            await db.companies.find({"tenant_id": user["tenant_id"]}).sort("name", 1).to_list(100)]
        out["perms"] = await compute_perms(user)
        out["is_admin"] = user.get("role") in ("owner", "admin")
    return out


@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


# ---------------------------------------------------------------- companies (per tenant)
@api.get("/companies")
async def list_companies(user: dict = Depends(get_current_user)):
    if not user.get("tenant_id"):
        raise HTTPException(status_code=403, detail="No business linked to this account")
    return [ser(c) for c in
            await db.companies.find({"tenant_id": user["tenant_id"]}).sort("name", 1).to_list(100)]


@api.post("/companies")
async def create_company(payload: dict = Body(...), scope: dict = Depends(require_admin_scope)):
    tenant_id = scope["tenant"]["id"]
    plan = PLANS.get(scope["tenant"].get("plan"), PLANS["trial"])
    count = await db.companies.count_documents({"tenant_id": tenant_id})
    if count >= plan["max_companies"]:
        raise HTTPException(status_code=402,
                            detail=f"Your {plan['label']} plan allows {plan['max_companies']} company(ies). Upgrade to add more.")
    name = str(payload.get("name", "")).strip()
    if not name:
        raise HTTPException(status_code=400, detail="Company name is required")
    doc = {k: payload.get(k, "") for k in ("tagline", "about", "phone", "email", "address", "gstin")}
    doc.update({"name": name, "tenant_id": tenant_id, "rate_alert_threshold": 20,
                "low_stock_threshold": 10, "created_at": now_iso()})
    res = await db.companies.insert_one(doc)
    company_id = str(res.inserted_id)
    await notify(ScopedDB(tenant_id, company_id), feature=GENERAL, kind="company-created",
                 title=f"Company '{name}' created",
                 body="It starts with empty books — add categories and products to begin.")
    return ser(await db.companies.find_one({"_id": res.inserted_id}))


@api.get("/company-profile")
async def get_profile(scope: dict = Depends(get_scope)):
    return await company_profile(scope["db"])


@api.put("/company-profile")
async def put_profile(payload: dict = Body(...), scope: dict = Depends(require_admin_scope)):
    allowed = ("name", "tagline", "about", "phone", "email", "address", "gstin",
               "rate_alert_threshold", "low_stock_threshold")
    doc = {k: v for k, v in payload.items() if k in allowed}
    await db.companies.update_one({"_id": oid(scope["company_id"]), "tenant_id": scope["tenant"]["id"]},
                                  {"$set": doc})
    return await company_profile(scope["db"])


@api.delete("/companies/{company_id}")
async def delete_company(company_id: str, scope: dict = Depends(require_admin_scope)):
    tenant_id = scope["tenant"]["id"]
    if await db.companies.count_documents({"tenant_id": tenant_id}) <= 1:
        raise HTTPException(status_code=400, detail="A business needs at least one company")
    res = await db.companies.delete_one({"_id": oid(company_id), "tenant_id": tenant_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Company not found")
    for coll in ("products", "product_categories", "purchases", "sales", "ledger",
                 "receipts", "credit_notes", "debit_notes", "godowns", "price_lists", "counters"):
        await db[coll].delete_many({"tenant_id": tenant_id, "company_id": company_id})
    return {"ok": True}


# ---------------------------------------------------------------- masters
MASTERS = {
    "parties": ["name", "roles", "phone", "email", "village", "city", "address", "gstin",
                "aadhaar", "bank_account", "ifsc", "contact_person", "notes", "status"],
    "product-categories": ["name", "unit", "tracks_lot", "gst_default", "custom_fields", "notes", "status"],
    "products": ["category_id", "name", "variety", "unit", "hsn", "opening_qty", "notes", "status"],
    "godowns": ["name", "kind", "location", "capacity_bags", "manager", "phone", "notes", "status"],
    "price-lists": ["party_id", "product_id", "kind", "rate", "rate_basis", "valid_from", "notes", "status"],
}
COLLECTION = {"parties": "parties", "product-categories": "product_categories", "products": "products",
              "godowns": "godowns", "price-lists": "price_lists"}


def normalise_master(name: str, doc: dict, creating: bool) -> dict:
    if name == "price-lists":
        if creating and (not doc.get("party_id") or not doc.get("product_id")):
            raise HTTPException(status_code=400, detail="Party and product are required")
        doc["rate"] = num(doc.get("rate"))
        doc["kind"] = doc.get("kind") or "sales"
        doc["rate_basis"] = doc.get("rate_basis") or "bag"
    elif creating and not str(doc.get("name", "")).strip():
        raise HTTPException(status_code=400, detail="Name is required")
    if name == "parties" and (creating or "roles" in doc):
        doc["roles"] = as_list(doc.get("roles"))
        if not doc["roles"]:
            raise HTTPException(status_code=400, detail="Pick at least one role (farmer, vendor or customer)")
    if name == "product-categories":
        if creating or "tracks_lot" in doc:
            doc["tracks_lot"] = str(doc.get("tracks_lot")).lower() in ("true", "1", "yes")
        if creating or "custom_fields" in doc:
            doc["custom_fields"] = parse_custom_fields(doc.get("custom_fields"))
    if name == "products" and creating and not doc.get("category_id"):
        raise HTTPException(status_code=400, detail="Category is required")
    return doc


def register_master(name: str, allowed: list):
    coll = COLLECTION[name]

    async def list_items(status: Optional[str] = None, role: Optional[str] = None,
                         category_id: Optional[str] = None, party_id: Optional[str] = None,
                         product_id: Optional[str] = None, kind: Optional[str] = None,
                         scope: dict = Depends(get_scope)):
        ensure_perm(scope, name, "view")
        q = {}
        for key, val in (("status", status), ("roles", role), ("category_id", category_id),
                         ("party_id", party_id), ("product_id", product_id), ("kind", kind)):
            if val:
                q[key] = val
        sort_key = "created_at" if name == "price-lists" else "name"
        return [ser(d) for d in await scope["db"][coll].find(q).sort(sort_key, 1).to_list(5000)]

    async def create_item(payload: dict = Body(...), scope: dict = Depends(get_scope)):
        ensure_perm(scope, name, "create")
        doc = normalise_master(name, {k: v for k, v in payload.items() if k in allowed}, True)
        doc.setdefault("status", "active")
        doc["created_at"] = now_iso()
        res = await scope["db"][coll].insert_one(doc)
        return ser(await scope["db"][coll].find_one({"_id": res.inserted_id}))

    async def update_item(item_id: str, payload: dict = Body(...), scope: dict = Depends(get_scope)):
        ensure_perm(scope, name, "edit")
        doc = normalise_master(name, {k: v for k, v in payload.items() if k in allowed}, False)
        doc["updated_at"] = now_iso()
        res = await scope["db"][coll].update_one({"_id": oid(item_id)}, {"$set": doc})
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="Record not found")
        return ser(await scope["db"][coll].find_one({"_id": oid(item_id)}))

    async def delete_item(item_id: str, scope: dict = Depends(get_scope)):
        sdb = scope["db"]
        ensure_perm(scope, name, "delete")
        if name == "product-categories" and await sdb.products.count_documents({"category_id": item_id}) > 0:
            raise HTTPException(status_code=400, detail="Category has products. Move or delete them first.")
        res = await sdb[coll].delete_one({"_id": oid(item_id)})
        if res.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Record not found")
        return {"ok": True}

    api.add_api_route(f"/{name}", list_items, methods=["GET"], name=f"list_{name}")
    api.add_api_route(f"/{name}", create_item, methods=["POST"], name=f"create_{name}")
    api.add_api_route(f"/{name}/{{item_id}}", update_item, methods=["PUT"], name=f"update_{name}")
    api.add_api_route(f"/{name}/{{item_id}}", delete_item, methods=["DELETE"], name=f"delete_{name}")


for _name, _allowed in MASTERS.items():
    register_master(_name, _allowed)


@api.get("/price-lists/lookup")
async def price_lookup(party_id: str, product_id: str, kind: str = "sales",
                       scope: dict = Depends(get_scope)):
    doc = await scope["db"].price_lists.find_one({"party_id": party_id, "product_id": product_id, "kind": kind})
    if not doc:
        return {"found": False}
    return {"found": True, "rate": num(doc.get("rate")), "rate_basis": doc.get("rate_basis", "bag")}


@api.get("/parties/duplicates")
async def party_duplicates(scope: dict = Depends(require_admin_scope)):
    parties = [ser(p) for p in await scope["db"].parties.find({}).to_list(5000)]
    groups = {}
    for p in parties:
        key = "".join(ch for ch in str(p.get("name", "")).lower() if ch.isalnum())
        phone = "".join(ch for ch in str(p.get("phone", "")) if ch.isdigit())
        for k in filter(None, [key, phone]):
            groups.setdefault(k, [])
            if p not in groups[k]:
                groups[k].append(p)
    seen, out = set(), []
    for k, members in groups.items():
        if len(members) < 2:
            continue
        sig = tuple(sorted(m["id"] for m in members))
        if sig in seen:
            continue
        seen.add(sig)
        out.append({"match": k, "parties": members})
    return out


@api.post("/parties/merge")
async def merge_parties(payload: dict = Body(...), scope: dict = Depends(require_admin_scope)):
    sdb, source_id, target_id = scope["db"], payload.get("source_id"), payload.get("target_id")
    if not source_id or not target_id or source_id == target_id:
        raise HTTPException(status_code=400, detail="Pick two different parties to merge")
    source = await sdb.parties.find_one({"_id": oid(source_id)})
    target = await sdb.parties.find_one({"_id": oid(target_id)})
    if not source or not target:
        raise HTTPException(status_code=404, detail="Party not found")
    moved = {}
    for coll in ("purchases", "sales", "ledger", "receipts", "credit_notes", "price_lists"):
        res = await db[coll].update_many(
            {"tenant_id": scope["tenant"]["id"], "party_id": source_id}, {"$set": {"party_id": target_id}})
        moved[coll] = res.modified_count
    roles = sorted(set(target.get("roles", []) + source.get("roles", [])))
    merged = {"roles": roles}
    for f in ("phone", "email", "village", "city", "address", "gstin", "aadhaar", "bank_account", "ifsc"):
        if not target.get(f) and source.get(f):
            merged[f] = source[f]
    merged["notes"] = " | ".join(filter(None, [target.get("notes"), f"Merged from {source.get('name')}"]))
    await sdb.parties.update_one({"_id": oid(target_id)}, {"$set": merged})
    await sdb.parties.delete_one({"_id": oid(source_id)})
    return {"ok": True, "moved": moved, "target": ser(await sdb.parties.find_one({"_id": oid(target_id)}))}


# ---------------------------------------------------------------- ledger core
async def sync_ledger(sdb, ref_type, ref_id, party_id, date, particulars, debit, credit):
    await sdb.ledger.delete_many({"ref_type": ref_type, "ref_id": ref_id})
    if not party_id or (debit == 0 and credit == 0):
        return
    await sdb.ledger.insert_one({
        "party_id": party_id, "date": date or now_iso()[:10], "particulars": particulars,
        "debit": round(debit, 2), "credit": round(credit, 2), "ref_type": ref_type,
        "ref_id": ref_id, "created_at": now_iso(),
    })


async def ledger_rows(sdb, party_id: str):
    rows, balance = [], 0.0
    for d in await sdb.ledger.find({"party_id": party_id}).sort("date", 1).to_list(5000):
        row = ser(d)
        balance += num(row.get("debit")) - num(row.get("credit"))
        row["balance"] = round(balance, 2)
        rows.append(row)
    return rows, {"debit": round(sum(num(r["debit"]) for r in rows), 2),
                  "credit": round(sum(num(r["credit"]) for r in rows), 2), "balance": round(balance, 2)}


# ---------------------------------------------------------------- transactions
TXN_FIELDS = ["date", "category_id", "party_id", "product_id", "godown_id", "lot_no", "vehicle_no",
              "bags", "weight", "rate", "rate_basis", "gst_rate", "payment_type", "payment_mode",
              "payment_status", "cheque_no", "notes", "status", "custom"]


def clean_txn(payload: dict) -> dict:
    doc = {k: v for k, v in payload.items() if k in TXN_FIELDS}
    if not doc.get("category_id"):
        raise HTTPException(status_code=400, detail="Category is required")
    for f in ("bags", "weight", "rate"):
        doc[f] = num(doc.get(f))
    doc["rate_basis"] = doc.get("rate_basis") or "bag"
    qty = doc["weight"] if doc["rate_basis"] == "weight" else doc["bags"]
    doc["amount"] = round(qty * doc["rate"], 2)
    gst = num(doc.get("gst_rate"))
    doc["gst_rate"] = gst
    doc["cgst"] = doc["sgst"] = round(doc["amount"] * gst / 200, 2)
    doc["total_amount"] = round(doc["amount"] + doc["cgst"] + doc["sgst"], 2)
    doc.setdefault("status", "active")
    doc.setdefault("payment_type", "cash")
    doc["custom"] = doc["custom"] if isinstance(doc.get("custom"), dict) else {}
    if not doc.get("payment_status"):
        doc["payment_status"] = "paid" if doc["payment_type"] == "cash" else "unpaid"
    return doc


def txn_paid_amount(txn: dict, receipts: list) -> float:
    inv = txn.get("invoice_no") or ""
    allocated = sum(num(r.get("amount")) for r in receipts if inv and (r.get("against_invoice") or "") == inv)
    total = num(txn.get("total_amount") or txn.get("amount"))
    return round(max(allocated, total), 2) if txn.get("payment_status") == "paid" else round(allocated, 2)


async def available(sdb, field, category_id, product_id, lot_no="", exclude_sale_id=""):
    q = {"category_id": category_id, "product_id": product_id}
    if lot_no:
        q["lot_no"] = lot_no
    purchased = sum(num(d.get(field)) for d in await sdb.purchases.find(q).to_list(5000))
    sold = sum(num(d.get(field)) for d in await sdb.sales.find(q).to_list(5000)
               if not (exclude_sale_id and str(d["_id"]) == exclude_sale_id))
    opening = 0.0
    if field == "bags" and not lot_no and product_id:
        prod = await sdb.products.find_one({"_id": oid(product_id)})
        opening = num(prod.get("opening_qty")) if prod else 0.0
    return round(purchased + opening - sold, 2)


async def assert_sale_stock(sdb, doc: dict, exclude_sale_id: str = ""):
    if not doc.get("product_id"):
        return
    if doc["bags"] > 0:
        bags = await available(sdb, "bags", doc["category_id"], doc["product_id"], "", exclude_sale_id)
        if doc["bags"] > bags:
            raise HTTPException(status_code=400, detail=f"Only {max(bags, 0)} bags of this product are in stock. Reduce the quantity or record a purchase first.")
        if doc.get("lot_no"):
            lot = await available(sdb, "bags", doc["category_id"], doc["product_id"], doc["lot_no"], exclude_sale_id)
            if doc["bags"] > lot:
                raise HTTPException(status_code=400, detail=f"Lot {doc['lot_no']} has only {max(lot, 0)} bags left.")
    elif doc["weight"] > 0:
        wt = await available(sdb, "weight", doc["category_id"], doc["product_id"], "", exclude_sale_id)
        if doc["weight"] > wt:
            raise HTTPException(status_code=400, detail=f"Only {max(wt, 0)} kg of this product are in stock. Reduce the weight or record a purchase first.")


async def sync_txn_ledger(sdb, kind: str, txn_id: str, doc: dict):
    total = num(doc.get("total_amount") or doc.get("amount"))
    label, party = doc.get("invoice_no", ""), doc.get("party_id")
    paid = total if doc.get("payment_status") == "paid" else 0
    if kind == "purchases":
        await sync_ledger(sdb, "purchase", txn_id, party, doc.get("date", ""), f"Purchase {label}", 0, total)
        await sync_ledger(sdb, "purchase_payment", txn_id, party, doc.get("date", ""),
                          f"Payment for {label} ({doc.get('payment_mode', 'cash')})", paid, 0)
    else:
        await sync_ledger(sdb, "sale", txn_id, party, doc.get("date", ""), f"Sale {label}", total, 0)
        await sync_ledger(sdb, "sale_payment", txn_id, party, doc.get("date", ""),
                          f"Payment against {label} ({doc.get('payment_mode', 'cash')})", 0, paid)


async def apply_receipt_ledger(sdb, receipt_id: str, doc: dict):
    paid_out = doc.get("direction") == "paid"
    label = f"{'Payment made' if paid_out else 'Payment received'} {doc.get('receipt_no', '')}"
    if doc.get("against_invoice"):
        label += f" against {doc['against_invoice']}"
    await sync_ledger(sdb, "receipt", receipt_id, doc.get("party_id"), doc.get("date", ""),
                      f"{label} ({doc.get('payment_mode', 'cash')})",
                      doc["amount"] if paid_out else 0, 0 if paid_out else doc["amount"])


async def low_stock_notice(sdb, doc: dict) -> None:
    """After a sale, warn when the product's remaining bags fall to the configured threshold."""
    product_id = doc.get("product_id")
    if not product_id:
        return
    profile = await company_profile(sdb)
    threshold = num(profile.get("low_stock_threshold")) or 10
    left = await available(sdb, "bags", doc.get("category_id"), product_id)
    if left > threshold:
        return
    product = await sdb.products.find_one({"_id": oid(product_id)})
    name = (product or {}).get("name", "Product")
    await notify(sdb, feature="stock", kind="low-stock", level="warning",
                 title=f"{name} is {'sold out' if left <= 0 else 'running low'}",
                 body=f"{round(left, 2)} bag(s) left (threshold {round(threshold, 2)}).",
                 meta={"product_id": product_id},
                 dedupe_key=f"low-stock:{product_id}:{now_iso()[:10]}")


def register_txn(kind: str):
    prefix = "PUR" if kind == "purchases" else "INV"

    async def list_txn(category_id: Optional[str] = None, party_id: Optional[str] = None,
                       scope: dict = Depends(get_scope)):
        ensure_perm(scope, kind, "view")
        q = {}
        if category_id:
            q["category_id"] = category_id
        if party_id:
            q["party_id"] = party_id
        return [ser(d) for d in await scope["db"][kind].find(q).sort("date", -1).to_list(5000)]

    async def create_txn(payload: dict = Body(...), scope: dict = Depends(get_scope)):
        sdb = scope["db"]
        ensure_perm(scope, kind, "create")
        doc = clean_txn(payload)
        if kind == "sales":
            await assert_sale_stock(sdb, doc)
        doc["invoice_no"] = await next_number(sdb, prefix)
        doc["created_at"] = now_iso()
        res = await sdb[kind].insert_one(doc)
        await sync_txn_ledger(sdb, kind, str(res.inserted_id), doc)
        party = await sdb.parties.find_one({"_id": oid(doc["party_id"])}) if doc.get("party_id") else None
        label = "Purchase" if kind == "purchases" else "Sale"
        await notify(sdb, feature=kind, kind=f"{kind}-created",
                     title=f"{label} {doc['invoice_no']} recorded",
                     body=f"{num(doc.get('bags'))} bag(s) · {round(num(doc.get('total_amount') or doc.get('amount')), 2)} · "
                          f"{(party or {}).get('name', 'party')} · by {scope['user'].get('name') or scope['user'].get('email')}",
                     meta={"id": str(res.inserted_id), "invoice_no": doc["invoice_no"]})
        if kind == "sales":
            await low_stock_notice(sdb, doc)
        return ser(await sdb[kind].find_one({"_id": res.inserted_id}))

    async def update_txn(item_id: str, payload: dict = Body(...), scope: dict = Depends(get_scope)):
        sdb = scope["db"]
        ensure_perm(scope, kind, "edit")
        existing = await sdb[kind].find_one({"_id": oid(item_id)})
        if not existing:
            raise HTTPException(status_code=404, detail="Record not found")
        doc = clean_txn(payload)
        if kind == "sales":
            await assert_sale_stock(sdb, doc, exclude_sale_id=item_id)
        doc["updated_at"] = now_iso()
        await sdb[kind].update_one({"_id": oid(item_id)}, {"$set": doc})
        await sync_txn_ledger(sdb, kind, item_id, {**doc, "invoice_no": existing.get("invoice_no", "")})
        return ser(await sdb[kind].find_one({"_id": oid(item_id)}))

    async def delete_txn(item_id: str, scope: dict = Depends(get_scope)):
        sdb = scope["db"]
        ensure_perm(scope, kind, "delete")
        if (await sdb[kind].delete_one({"_id": oid(item_id)})).deleted_count == 0:
            raise HTTPException(status_code=404, detail="Record not found")
        base = "purchase" if kind == "purchases" else "sale"
        await sdb.ledger.delete_many({"ref_type": {"$in": [base, f"{base}_payment"]}, "ref_id": item_id})
        return {"ok": True}

    async def add_payment(item_id: str, payload: dict = Body(...), scope: dict = Depends(get_scope)):
        sdb = scope["db"]
        ensure_perm(scope, kind, "edit")
        txn = await sdb[kind].find_one({"_id": oid(item_id)})
        if not txn:
            raise HTTPException(status_code=404, detail="Invoice not found")
        amount = num(payload.get("amount"))
        if amount <= 0:
            raise HTTPException(status_code=400, detail="Enter an amount greater than zero")
        inv = txn.get("invoice_no", "")
        receipts = await sdb.receipts.find({"against_invoice": inv}).to_list(5000)
        total = num(txn.get("total_amount") or txn.get("amount"))
        already = sum(num(r.get("amount")) for r in receipts)
        if round(already + amount, 2) > round(total, 2):
            raise HTTPException(status_code=400, detail=f"Only {round(total - already, 2)} is outstanding on this invoice.")
        doc = {"date": payload.get("date") or now_iso()[:10],
               "direction": "paid" if kind == "purchases" else "received",
               "party_id": txn.get("party_id"), "amount": amount,
               "payment_mode": payload.get("payment_mode") or "cash",
               "cheque_no": payload.get("cheque_no") or "", "against_invoice": inv,
               "notes": payload.get("notes") or "", "receipt_no": await next_number(sdb, "RCP"),
               "created_at": now_iso()}
        res = await sdb.receipts.insert_one(doc)
        await apply_receipt_ledger(sdb, str(res.inserted_id), doc)
        paid = round(already + amount, 2)
        status = "paid" if paid >= round(total, 2) else "partial"
        await sdb[kind].update_one({"_id": oid(item_id)}, {"$set": {"payment_status": status}})
        await sync_txn_ledger(sdb, kind, item_id, {**txn, "payment_status": "partial"})
        await notify(sdb, feature="invoices", kind=f"invoice-{status}",
                     level="success" if status == "paid" else "info",
                     title=f"Invoice {inv} {'fully paid' if status == 'paid' else 'part paid'}",
                     body=f"{round(amount, 2)} received · {round(total - paid, 2)} still outstanding."
                          if status != "paid" else f"{round(total, 2)} settled in full.",
                     meta={"invoice_no": inv})
        return {"ok": True, "receipt": ser(await sdb.receipts.find_one({"_id": res.inserted_id})),
                "paid_amount": paid, "balance": round(total - paid, 2), "payment_status": status}

    api.add_api_route(f"/{kind}", list_txn, methods=["GET"], name=f"list_{kind}")
    api.add_api_route(f"/{kind}", create_txn, methods=["POST"], name=f"create_{kind}")
    api.add_api_route(f"/{kind}/{{item_id}}", update_txn, methods=["PUT"], name=f"update_{kind}")
    api.add_api_route(f"/{kind}/{{item_id}}", delete_txn, methods=["DELETE"], name=f"delete_{kind}")
    api.add_api_route(f"/{kind}/{{item_id}}/payments", add_payment, methods=["POST"], name=f"pay_{kind}")


for _kind in ("purchases", "sales"):
    register_txn(_kind)


# ---------------------------------------------------------------- receipts & credit notes
RECEIPT_FIELDS = ["date", "direction", "party_id", "amount", "payment_mode", "cheque_no",
                  "against_invoice", "notes"]
CN_FIELDS = ["date", "party_id", "against_invoice", "amount", "reason", "category_id", "status"]


@api.get("/receipts")
async def list_receipts(party_id: Optional[str] = None, scope: dict = Depends(require_perm("receipts", "view"))):
    q = {"party_id": party_id} if party_id else {}
    return [ser(d) for d in await scope["db"].receipts.find(q).sort("date", -1).to_list(5000)]


@api.post("/receipts")
async def create_receipt(payload: dict = Body(...), scope: dict = Depends(require_perm("receipts", "create"))):
    sdb = scope["db"]
    doc = {k: v for k, v in payload.items() if k in RECEIPT_FIELDS}
    doc["amount"] = num(doc.get("amount"))
    doc.setdefault("direction", "received")
    doc.setdefault("payment_mode", "cash")
    doc["receipt_no"] = await next_number(sdb, "RCP")
    doc["created_at"] = now_iso()
    res = await sdb.receipts.insert_one(doc)
    await apply_receipt_ledger(sdb, str(res.inserted_id), doc)
    party = await sdb.parties.find_one({"_id": oid(doc["party_id"])}) if doc.get("party_id") else None
    await notify(sdb, feature="receipts", kind="receipt-created",
                 title=f"{'Payment received' if doc['direction'] == 'received' else 'Payment made'} · {doc['receipt_no']}",
                 body=f"{round(doc['amount'], 2)} {doc.get('payment_mode', 'cash')} · {(party or {}).get('name', 'party')}",
                 meta={"id": str(res.inserted_id)})
    return ser(await sdb.receipts.find_one({"_id": res.inserted_id}))


@api.put("/receipts/{item_id}")
async def update_receipt(item_id: str, payload: dict = Body(...), scope: dict = Depends(require_perm("receipts", "edit"))):
    sdb = scope["db"]
    existing = await sdb.receipts.find_one({"_id": oid(item_id)})
    if not existing:
        raise HTTPException(status_code=404, detail="Record not found")
    doc = {k: v for k, v in payload.items() if k in RECEIPT_FIELDS}
    doc["amount"] = num(doc.get("amount"))
    await sdb.receipts.update_one({"_id": oid(item_id)}, {"$set": doc})
    await apply_receipt_ledger(sdb, item_id, {**existing, **doc})
    return ser(await sdb.receipts.find_one({"_id": oid(item_id)}))


@api.delete("/receipts/{item_id}")
async def delete_receipt(item_id: str, scope: dict = Depends(require_perm("receipts", "delete"))):
    sdb = scope["db"]
    if (await sdb.receipts.delete_one({"_id": oid(item_id)})).deleted_count == 0:
        raise HTTPException(status_code=404, detail="Record not found")
    await sdb.ledger.delete_many({"ref_type": "receipt", "ref_id": item_id})
    return {"ok": True}


@api.get("/credit-notes")
async def list_credit_notes(scope: dict = Depends(require_perm("credit-notes", "view"))):
    return [ser(d) for d in await scope["db"].credit_notes.find({}).sort("date", -1).to_list(5000)]


@api.post("/credit-notes")
async def create_credit_note(payload: dict = Body(...), scope: dict = Depends(require_perm("credit-notes", "create"))):
    sdb = scope["db"]
    doc = {k: v for k, v in payload.items() if k in CN_FIELDS}
    doc["amount"] = num(doc.get("amount"))
    doc["note_no"] = await next_number(sdb, "CN")
    doc.setdefault("status", "active")
    doc["created_at"] = now_iso()
    res = await sdb.credit_notes.insert_one(doc)
    await sync_ledger(sdb, "credit_note", str(res.inserted_id), doc.get("party_id"),
                      doc.get("date", ""), f"Credit note {doc['note_no']}", 0, doc["amount"])
    await notify(sdb, feature="credit-notes", kind="credit-note-created",
                 title=f"Credit note {doc['note_no']} issued",
                 body=f"{round(doc['amount'], 2)} · {doc.get('reason', '')}".strip(" ·"),
                 meta={"id": str(res.inserted_id)})
    return ser(await sdb.credit_notes.find_one({"_id": res.inserted_id}))


@api.put("/credit-notes/{item_id}")
async def update_credit_note(item_id: str, payload: dict = Body(...), scope: dict = Depends(require_perm("credit-notes", "edit"))):
    sdb = scope["db"]
    existing = await sdb.credit_notes.find_one({"_id": oid(item_id)})
    if not existing:
        raise HTTPException(status_code=404, detail="Record not found")
    doc = {k: v for k, v in payload.items() if k in CN_FIELDS}
    doc["amount"] = num(doc.get("amount"))
    await sdb.credit_notes.update_one({"_id": oid(item_id)}, {"$set": doc})
    await sync_ledger(sdb, "credit_note", item_id, doc.get("party_id"), doc.get("date", ""),
                      f"Credit note {existing.get('note_no', '')}", 0, doc["amount"])
    return ser(await sdb.credit_notes.find_one({"_id": oid(item_id)}))


@api.delete("/credit-notes/{item_id}")
async def delete_credit_note(item_id: str, scope: dict = Depends(require_perm("credit-notes", "delete"))):
    sdb = scope["db"]
    if (await sdb.credit_notes.delete_one({"_id": oid(item_id)})).deleted_count == 0:
        raise HTTPException(status_code=404, detail="Record not found")
    await sdb.ledger.delete_many({"ref_type": "credit_note", "ref_id": item_id})
    return {"ok": True}


# ---------------------------------------------------------------- debit notes
DN_FIELDS = ["date", "party_id", "against_invoice", "amount", "reason", "category_id", "status"]


@api.get("/debit-notes")
async def list_debit_notes(scope: dict = Depends(require_perm("debit-notes", "view"))):
    return [ser(d) for d in await scope["db"].debit_notes.find({}).sort("date", -1).to_list(5000)]


@api.post("/debit-notes")
async def create_debit_note(payload: dict = Body(...), scope: dict = Depends(require_perm("debit-notes", "create"))):
    sdb = scope["db"]
    doc = {k: v for k, v in payload.items() if k in DN_FIELDS}
    doc["amount"] = num(doc.get("amount"))
    doc["note_no"] = await next_number(sdb, "DN")
    doc.setdefault("status", "active")
    doc["created_at"] = now_iso()
    res = await sdb.debit_notes.insert_one(doc)
    await sync_ledger(sdb, "debit_note", str(res.inserted_id), doc.get("party_id"),
                      doc.get("date", ""), f"Debit note {doc['note_no']}", doc["amount"], 0)
    await notify(sdb, feature="debit-notes", kind="debit-note-created",
                 title=f"Debit note {doc['note_no']} issued",
                 body=f"{round(doc['amount'], 2)} · {doc.get('reason', '')}".strip(" ·"),
                 meta={"id": str(res.inserted_id)})
    return ser(await sdb.debit_notes.find_one({"_id": res.inserted_id}))


@api.put("/debit-notes/{item_id}")
async def update_debit_note(item_id: str, payload: dict = Body(...), scope: dict = Depends(require_perm("debit-notes", "edit"))):
    sdb = scope["db"]
    existing = await sdb.debit_notes.find_one({"_id": oid(item_id)})
    if not existing:
        raise HTTPException(status_code=404, detail="Record not found")
    doc = {k: v for k, v in payload.items() if k in DN_FIELDS}
    doc["amount"] = num(doc.get("amount"))
    await sdb.debit_notes.update_one({"_id": oid(item_id)}, {"$set": doc})
    await sync_ledger(sdb, "debit_note", item_id, doc.get("party_id"), doc.get("date", ""),
                      f"Debit note {existing.get('note_no', '')}", doc["amount"], 0)
    return ser(await sdb.debit_notes.find_one({"_id": oid(item_id)}))


@api.delete("/debit-notes/{item_id}")
async def delete_debit_note(item_id: str, scope: dict = Depends(require_perm("debit-notes", "delete"))):
    sdb = scope["db"]
    if (await sdb.debit_notes.delete_one({"_id": oid(item_id)})).deleted_count == 0:
        raise HTTPException(status_code=404, detail="Record not found")
    await sdb.ledger.delete_many({"ref_type": "debit_note", "ref_id": item_id})
    return {"ok": True}


# ---------------------------------------------------------------- ledger endpoints
LEDGER_FIELDS = ["party_id", "date", "particulars", "debit", "credit", "payment_mode", "notes"]
AUTO_REFS = ("purchase", "purchase_payment", "sale", "sale_payment", "receipt", "credit_note", "debit_note")


@api.get("/ledger")
async def get_ledger(party_id: Optional[str] = None, scope: dict = Depends(require_perm("ledger", "view"))):
    if not party_id:
        return {"entries": [], "totals": {"debit": 0, "credit": 0, "balance": 0}}
    rows, totals = await ledger_rows(scope["db"], party_id)
    return {"entries": rows, "totals": totals}


@api.post("/ledger")
async def create_ledger(payload: dict = Body(...), scope: dict = Depends(require_perm("ledger", "create"))):
    doc = {k: v for k, v in payload.items() if k in LEDGER_FIELDS}
    if not doc.get("party_id"):
        raise HTTPException(status_code=400, detail="Party is required")
    doc["debit"], doc["credit"] = num(doc.get("debit")), num(doc.get("credit"))
    doc["ref_type"] = "manual"
    doc["created_at"] = now_iso()
    res = await scope["db"].ledger.insert_one(doc)
    return ser(await scope["db"].ledger.find_one({"_id": res.inserted_id}))


@api.put("/ledger/{item_id}")
async def update_ledger(item_id: str, payload: dict = Body(...), scope: dict = Depends(require_perm("ledger", "edit"))):
    sdb = scope["db"]
    existing = await sdb.ledger.find_one({"_id": oid(item_id)})
    if not existing:
        raise HTTPException(status_code=404, detail="Record not found")
    if existing.get("ref_type") in AUTO_REFS:
        raise HTTPException(status_code=400, detail="Auto-generated entry, edit the source transaction")
    doc = {k: v for k, v in payload.items() if k in LEDGER_FIELDS}
    doc["debit"], doc["credit"] = num(doc.get("debit")), num(doc.get("credit"))
    await sdb.ledger.update_one({"_id": oid(item_id)}, {"$set": doc})
    return ser(await sdb.ledger.find_one({"_id": oid(item_id)}))


@api.delete("/ledger/{item_id}")
async def delete_ledger(item_id: str, scope: dict = Depends(require_perm("ledger", "delete"))):
    sdb = scope["db"]
    existing = await sdb.ledger.find_one({"_id": oid(item_id)})
    if not existing:
        raise HTTPException(status_code=404, detail="Record not found")
    if existing.get("ref_type") in AUTO_REFS:
        raise HTTPException(status_code=400, detail="Auto-generated entry, delete the source transaction")
    await sdb.ledger.delete_one({"_id": oid(item_id)})
    return {"ok": True}


@api.get("/outstanding")
async def outstanding(scope: dict = Depends(require_perm("ledger", "view"))):
    sdb = scope["db"]
    parties = await sdb.parties.find({}).to_list(5000)
    ledger = await sdb.ledger.find({}).to_list(50000)
    rows = []
    for p in parties:
        pid = str(p["_id"])
        entries = [x for x in ledger if x.get("party_id") == pid]
        if not entries:
            continue
        debit = sum(num(x.get("debit")) for x in entries)
        credit = sum(num(x.get("credit")) for x in entries)
        rows.append({"party_id": pid, "name": p.get("name", ""), "roles": p.get("roles", []),
                     "village": p.get("village", ""), "debit": round(debit, 2),
                     "credit": round(credit, 2), "balance": round(debit - credit, 2)})
    rows.sort(key=lambda r: -abs(r["balance"]))
    return {"parties": rows, "totals": {
        "receivable": round(sum(r["balance"] for r in rows if r["balance"] > 0), 2),
        "payable": round(-sum(r["balance"] for r in rows if r["balance"] < 0), 2),
        "net": round(sum(r["balance"] for r in rows), 2)}}


# ---------------------------------------------------------------- stock, lots, dashboard
@api.get("/stock")
async def stock(category_id: Optional[str] = None, scope: dict = Depends(get_scope)):
    sdb = scope["db"]
    q = {"category_id": category_id} if category_id else {}
    products = await sdb.products.find(q).to_list(2000)
    purchases = await sdb.purchases.find(q).to_list(10000)
    sales = await sdb.sales.find(q).to_list(10000)
    godowns = {str(g["_id"]): g.get("name", "") for g in await sdb.godowns.find({}).to_list(500)}
    cats = {str(c["_id"]): c.get("name", "") for c in await sdb.product_categories.find({}).to_list(200)}

    rows = []
    for p in products:
        pid = str(p["_id"])
        pin = [x for x in purchases if x.get("product_id") == pid]
        pout = [x for x in sales if x.get("product_id") == pid]
        in_bags = sum(num(x.get("bags")) for x in pin) + num(p.get("opening_qty"))
        in_weight = sum(num(x.get("weight")) for x in pin)
        out_bags = sum(num(x.get("bags")) for x in pout)
        out_weight = sum(num(x.get("weight")) for x in pout)
        rows.append({"product_id": pid, "product": p.get("name", ""),
                     "category": cats.get(p.get("category_id", ""), "-"), "variety": p.get("variety", ""),
                     "unit": p.get("unit", "bag"), "in_bags": round(in_bags, 2), "out_bags": round(out_bags, 2),
                     "balance_bags": round(in_bags - out_bags, 2), "in_weight": round(in_weight, 2),
                     "out_weight": round(out_weight, 2), "balance_weight": round(in_weight - out_weight, 2),
                     "purchase_value": round(sum(num(x.get("amount")) for x in pin), 2),
                     "sale_value": round(sum(num(x.get("amount")) for x in pout), 2)})

    by_godown = {}
    for x in purchases:
        g = godowns.get(x.get("godown_id", ""), "Unassigned")
        by_godown.setdefault(g, {"godown": g, "in_bags": 0.0, "out_bags": 0.0})["in_bags"] += num(x.get("bags"))
    for x in sales:
        g = godowns.get(x.get("godown_id", ""), "Unassigned")
        by_godown.setdefault(g, {"godown": g, "in_bags": 0.0, "out_bags": 0.0})["out_bags"] += num(x.get("bags"))
    godown_rows = [{**v, "balance_bags": round(v["in_bags"] - v["out_bags"], 2)} for v in by_godown.values()]

    lots = []
    for x in purchases:
        if not x.get("lot_no"):
            continue
        sold = sum(num(s.get("bags")) for s in sales if s.get("lot_no") == x.get("lot_no"))
        lots.append({"lot_no": x.get("lot_no"), "vehicle_no": x.get("vehicle_no", ""),
                     "godown": godowns.get(x.get("godown_id", ""), "-"), "in_bags": num(x.get("bags")),
                     "weight": num(x.get("weight")), "sold_bags": round(sold, 2),
                     "balance_bags": round(num(x.get("bags")) - sold, 2)})
    return {"products": rows, "godowns": godown_rows, "lots": lots}


@api.get("/lots/trace")
async def lot_trace(category_id: Optional[str] = None, scope: dict = Depends(get_scope)):
    sdb = scope["db"]
    q = {"category_id": category_id} if category_id else {}
    purchases = await sdb.purchases.find(q).to_list(10000)
    sales = await sdb.sales.find(q).to_list(10000)
    parties = {str(p["_id"]): p.get("name", "") for p in await sdb.parties.find({}).to_list(5000)}
    godowns = {str(g["_id"]): g.get("name", "") for g in await sdb.godowns.find({}).to_list(500)}
    products = {str(p["_id"]): p.get("name", "") for p in await sdb.products.find({}).to_list(2000)}

    rows = []
    for p in purchases:
        if not p.get("lot_no"):
            continue
        outs = sorted([s for s in sales if s.get("lot_no") == p["lot_no"]], key=lambda x: x.get("date") or "")
        sold_bags = sum(num(s.get("bags")) for s in outs)
        sale_value = sum(num(s.get("amount")) for s in outs)
        rows.append({"lot_no": p["lot_no"], "purchase_no": p.get("invoice_no", ""),
                     "purchase_date": p.get("date", ""), "supplier": parties.get(p.get("party_id", ""), "-"),
                     "product": products.get(p.get("product_id", ""), "-"),
                     "godown": godowns.get(p.get("godown_id", ""), "-"), "vehicle_no": p.get("vehicle_no", ""),
                     "in_bags": num(p.get("bags")), "in_weight": num(p.get("weight")),
                     "purchase_value": round(num(p.get("amount")), 2), "sold_bags": round(sold_bags, 2),
                     "balance_bags": round(num(p.get("bags")) - sold_bags, 2),
                     "sale_value": round(sale_value, 2), "margin": round(sale_value - num(p.get("amount")), 2),
                     "sales": [{"invoice_no": s.get("invoice_no", ""), "date": s.get("date", ""),
                                "buyer": parties.get(s.get("party_id", ""), "-"), "bags": num(s.get("bags")),
                                "weight": num(s.get("weight")), "amount": round(num(s.get("amount")), 2),
                                "payment_mode": s.get("payment_mode", "")} for s in outs]})
    rows.sort(key=lambda r: r["purchase_date"], reverse=True)
    return rows


def season_bounds():
    today = datetime.now(timezone.utc).date()
    return (today.year if today.month >= 11 else today.year - 1), today


@api.get("/dashboard/summary")
async def dashboard(scope: dict = Depends(get_scope)):
    sdb, user = scope["db"], scope["user"]
    categories = [ser(c) for c in await sdb.product_categories.find({}).sort("name", 1).to_list(200)]
    purchases = await sdb.purchases.find({}).to_list(20000)
    sales = await sdb.sales.find({}).to_list(20000)

    def totals(docs):
        return {"count": len(docs), "bags": round(sum(num(d.get("bags")) for d in docs), 2),
                "weight": round(sum(num(d.get("weight")) for d in docs), 2),
                "amount": round(sum(num(d.get("amount")) for d in docs), 2)}

    cats = [{"category_id": c["id"], "name": c["name"],
             "purchase": totals([d for d in purchases if d.get("category_id") == c["id"]]),
             "sale": totals([d for d in sales if d.get("category_id") == c["id"]])} for c in categories]

    balances = {}
    for x in await sdb.ledger.find({}).to_list(50000):
        balances[x.get("party_id")] = balances.get(x.get("party_id"), 0) + num(x.get("debit")) - num(x.get("credit"))
    receivable = round(sum(v for v in balances.values() if v > 0), 2)
    payable = round(-sum(v for v in balances.values() if v < 0), 2)
    if not has_perm(scope, "dashboard", "receivable"):
        receivable = None
    if not has_perm(scope, "dashboard", "payable"):
        payable = None

    counts = {"parties": await sdb.parties.count_documents({}),
              "farmers": await sdb.parties.count_documents({"roles": "farmer"}),
              "vendors": await sdb.parties.count_documents({"roles": "vendor"}),
              "customers": await sdb.parties.count_documents({"roles": "customer"}),
              "products": await sdb.products.count_documents({}),
              "categories": await sdb.product_categories.count_documents({}),
              "godowns": await sdb.godowns.count_documents({})}

    return {"categories": cats, "counts": counts, "receivable": receivable, "payable": payable,
            "company": scope["company"], "tenant": scope["tenant"],
            "recent_sales": [ser(d) for d in await sdb.sales.find({}).sort("created_at", -1).to_list(6)],
            "recent_purchases": [ser(d) for d in await sdb.purchases.find({}).sort("created_at", -1).to_list(6)]}


@api.get("/dashboard/seasons")
async def dashboard_seasons(scope: dict = Depends(get_scope)):
    sdb = scope["db"]
    start_year, _ = season_bounds()

    async def totals(coll, y):
        docs = await sdb[coll].find({"date": {"$gte": f"{y}-11-01", "$lte": f"{y + 1}-10-31"}}).to_list(20000)
        return {"count": len(docs), "bags": round(sum(num(d.get("bags")) for d in docs), 2),
                "weight": round(sum(num(d.get("weight")) for d in docs), 2),
                "amount": round(sum(num(d.get("amount")) for d in docs), 2)}

    out = []
    for y in (start_year, start_year - 1):
        purchase, sale = await totals("purchases", y), await totals("sales", y)
        out.append({"label": f"{y}-{str(y + 1)[-2:]}", "from": f"{y}-11-01", "to": f"{y + 1}-10-31",
                    "purchase": purchase, "sale": sale,
                    "margin": round(sale["amount"] - purchase["amount"], 2)})
    current, previous = out

    def growth(now, before):
        return None if not before else round(((now - before) / before) * 100, 1)

    return {"current": current, "previous": previous, "growth": {
        "purchase_amount": growth(current["purchase"]["amount"], previous["purchase"]["amount"]),
        "sale_amount": growth(current["sale"]["amount"], previous["sale"]["amount"]),
        "margin": growth(current["margin"], previous["margin"]),
        "purchase_bags": growth(current["purchase"]["bags"], previous["purchase"]["bags"])}}


@api.get("/dashboard/season-chart")
async def season_chart(scope: dict = Depends(get_scope)):
    sdb = scope["db"]
    start_year, _ = season_bounds()
    months = [(11, start_year), (12, start_year)] + [(m, start_year + 1) for m in range(1, 11)]
    purchases = await sdb.purchases.find({}).to_list(20000)
    sales = await sdb.sales.find({}).to_list(20000)

    def bucket(docs, y, m):
        pre = f"{y}-{m:02d}"
        return round(sum(num(d.get("amount")) for d in docs if str(d.get("date") or "").startswith(pre)), 2)

    return {"season": f"{start_year}-{str(start_year + 1)[-2:]}",
            "months": [{"month": datetime(y, m, 1).strftime("%b"), "purchases": bucket(purchases, y, m),
                        "sales": bucket(sales, y, m), "prev_purchases": bucket(purchases, y - 1, m),
                        "prev_sales": bucket(sales, y - 1, m)} for m, y in months]}


@api.get("/dashboard/low-stock")
async def low_stock(scope: dict = Depends(get_scope)):
    sdb = scope["db"]
    threshold = num((await company_profile(sdb)).get("low_stock_threshold")) or 10
    products = await sdb.products.find({}).to_list(2000)
    purchases = await sdb.purchases.find({}).to_list(20000)
    sales = await sdb.sales.find({}).to_list(20000)
    cats = {str(c["_id"]): c.get("name", "") for c in await sdb.product_categories.find({}).to_list(200)}

    product_rows = []
    for p in products:
        pid = str(p["_id"])
        pin = sum(num(x.get("bags")) for x in purchases if x.get("product_id") == pid) + num(p.get("opening_qty"))
        pout = sum(num(x.get("bags")) for x in sales if x.get("product_id") == pid)
        balance = round(pin - pout, 2)
        if pin > 0 and balance <= threshold:
            product_rows.append({"product_id": pid, "product": p.get("name", ""),
                                 "category": cats.get(p.get("category_id", ""), "-"),
                                 "in_bags": round(pin, 2), "balance_bags": balance,
                                 "state": "out" if balance <= 0 else "low"})

    lot_rows = []
    for x in purchases:
        if not x.get("lot_no"):
            continue
        sold = sum(num(s.get("bags")) for s in sales if s.get("lot_no") == x.get("lot_no"))
        balance = round(num(x.get("bags")) - sold, 2)
        if num(x.get("bags")) > 0 and balance <= max(threshold, num(x.get("bags")) * 0.1):
            lot_rows.append({"lot_no": x.get("lot_no"), "vehicle_no": x.get("vehicle_no", ""),
                             "in_bags": num(x.get("bags")), "balance_bags": balance,
                             "state": "out" if balance <= 0 else "low"})
    return {"threshold": threshold, "products": product_rows, "lots": lot_rows}


@api.get("/dashboard/reorder")
async def reorder_suggestions(scope: dict = Depends(get_scope)):
    sdb = scope["db"]
    start_year, today = season_bounds()
    season_from = f"{start_year}-11-01"
    months_elapsed = max(1, (today.year - start_year) * 12 + today.month - 11 + 1)
    products = await sdb.products.find({}).to_list(2000)
    purchases = await sdb.purchases.find({}).to_list(20000)
    sales = await sdb.sales.find({}).to_list(20000)
    cats = {str(c["_id"]): c.get("name", "") for c in await sdb.product_categories.find({}).to_list(200)}

    rows = []
    for p in products:
        pid = str(p["_id"])
        season_sold = sum(num(s.get("bags")) for s in sales
                          if s.get("product_id") == pid and str(s.get("date") or "") >= season_from)
        if season_sold <= 0:
            continue
        stocked = sum(num(x.get("bags")) for x in purchases if x.get("product_id") == pid) + num(p.get("opening_qty"))
        balance = round(stocked - sum(num(s.get("bags")) for s in sales if s.get("product_id") == pid), 2)
        monthly = round(season_sold / months_elapsed, 2)
        cover = round(balance / monthly, 1) if monthly > 0 else None
        suggested = round(max(monthly * 2 - balance, 0), 2)
        rows.append({"product_id": pid, "product": p.get("name", ""),
                     "category": cats.get(p.get("category_id", ""), "-"),
                     "season_sold_bags": round(season_sold, 2), "avg_monthly_bags": monthly,
                     "balance_bags": balance, "cover_months": cover, "suggested_bags": suggested,
                     "urgency": "now" if suggested > 0 and (cover is None or cover < 1) else ("soon" if suggested > 0 else "ok")})
    rows.sort(key=lambda r: -r["suggested_bags"])
    return {"season_from": season_from, "months_elapsed": months_elapsed, "rows": rows}


# ---------------------------------------------------------------- invoices, reports, statements
@api.get("/invoices")
async def invoices(kind: Optional[str] = None, scope: dict = Depends(require_perm("invoices", "view"))):
    sdb = scope["db"]
    receipts = await sdb.receipts.find({}).to_list(20000)
    rows = []
    for doc_type, coll in (("sale", "sales"), ("purchase", "purchases")):
        if kind not in (None, doc_type):
            continue
        for d in await sdb[coll].find({}).sort("date", -1).to_list(5000):
            r = ser(d)
            r["doc_type"] = doc_type
            r["paid_amount"] = txn_paid_amount(r, receipts)
            r["balance_amount"] = round(num(r.get("total_amount") or r.get("amount")) - r["paid_amount"], 2)
            rows.append(r)
    rows.sort(key=lambda r: r.get("date") or "", reverse=True)
    return rows


@api.get("/reports/transactions")
async def report_transactions(kind: str = "sales", category_id: Optional[str] = None,
                              date_from: Optional[str] = None, date_to: Optional[str] = None,
                              party_id: Optional[str] = None, scope: dict = Depends(require_perm("reports", "view"))):
    if kind not in ("sales", "purchases"):
        raise HTTPException(status_code=400, detail="kind must be sales or purchases")
    q = {}
    if category_id:
        q["category_id"] = category_id
    if party_id:
        q["party_id"] = party_id
    if date_from or date_to:
        q["date"] = {}
        if date_from:
            q["date"]["$gte"] = date_from
        if date_to:
            q["date"]["$lte"] = date_to
    docs = [ser(d) for d in await scope["db"][kind].find(q).sort("date", -1).to_list(5000)]
    return {"rows": docs, "totals": {
        "count": len(docs), "bags": round(sum(num(d.get("bags")) for d in docs), 2),
        "weight": round(sum(num(d.get("weight")) for d in docs), 2),
        "amount": round(sum(num(d.get("amount")) for d in docs), 2)}}


@api.get("/rate-stats")
async def rate_stats(kind: str = "sales", product_id: Optional[str] = None, scope: dict = Depends(get_scope)):
    if kind not in ("sales", "purchases"):
        raise HTTPException(status_code=400, detail="kind must be sales or purchases")
    if not product_id:
        return {"count": 0}
    docs = await scope["db"][kind].find({"product_id": product_id}).sort("created_at", -1).to_list(20)
    rates = [num(d.get("rate")) for d in docs if num(d.get("rate")) > 0]
    if not rates:
        return {"count": 0}
    return {"count": len(rates), "avg_rate": round(sum(rates) / len(rates), 2),
            "min_rate": round(min(rates), 2), "max_rate": round(max(rates), 2), "last_rate": round(rates[0], 2)}


@api.post("/ledger/{party_id}/email-statement")
async def email_statement(party_id: str, scope: dict = Depends(require_perm("ledger", "view"))):
    sdb = scope["db"]
    party = await sdb.parties.find_one({"_id": oid(party_id)})
    if not party:
        raise HTTPException(status_code=404, detail="Party not found")
    to = (party.get("email") or "").strip()
    if not to or "@" not in to:
        raise HTTPException(status_code=400, detail="This party has no email address. Add one on the Party record first.")
    rows, totals = await ledger_rows(sdb, party_id)
    profile = await company_profile(sdb)
    email_id = await send_email(to=to, subject=f"Your account statement from {profile.get('name', 'AgriERP')}",
                               html=statement_html(company_name=profile.get("name", "AgriERP"),
                                                   party_name=party.get("name", ""), rows=rows, totals=totals))
    return {"ok": True, "sent_to": to, "email_id": email_id}


# ---------------------------------------------------------------- staff users (per tenant)
@api.get("/users")
async def list_users(scope: dict = Depends(require_admin_scope)):
    docs = await db.users.find({"tenant_id": scope["tenant"]["id"]}).sort("created_at", 1).to_list(500)
    return [ser(d) for d in docs]


@api.post("/users")
async def create_user(payload: dict = Body(...), scope: dict = Depends(require_admin_scope)):
    tenant_id = scope["tenant"]["id"]
    plan = PLANS.get(scope["tenant"].get("plan"), PLANS["trial"])
    if await db.users.count_documents({"tenant_id": tenant_id}) >= plan["max_users"]:
        raise HTTPException(status_code=402, detail=f"Your {plan['label']} plan allows {plan['max_users']} users. Upgrade to add more.")
    email = str(payload.get("email", "")).strip().lower()
    password = str(payload.get("password", ""))
    role = payload.get("role") or "operator"
    if role not in ("admin", "operator", "custom"):
        raise HTTPException(status_code=400, detail="Invalid role")
    role_id = str(payload.get("role_id") or "")
    if role == "custom" and (not role_id or not await db.roles.find_one({"_id": oid(role_id), "tenant_id": tenant_id})):
        raise HTTPException(status_code=400, detail="Pick a valid custom role")
    if not email or len(password) < 6:
        raise HTTPException(status_code=400, detail="Email and a password of 6+ characters are required")
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="A user with this email already exists")
    res = await db.users.insert_one({"email": email, "name": payload.get("name") or email.split("@")[0],
                                     "role": role, "role_id": role_id if role == "custom" else "",
                                     "tenant_id": tenant_id,
                                     "default_company_id": scope["company_id"],
                                     "password_hash": hash_password(password), "created_at": now_iso()})
    return ser(await db.users.find_one({"_id": res.inserted_id}))


@api.put("/users/{item_id}")
async def update_user(item_id: str, payload: dict = Body(...), scope: dict = Depends(require_admin_scope)):
    existing = await db.users.find_one({"_id": oid(item_id), "tenant_id": scope["tenant"]["id"]})
    if not existing:
        raise HTTPException(status_code=404, detail="Record not found")
    update = {}
    if payload.get("name"):
        update["name"] = payload["name"]
    if payload.get("role"):
        new_role = payload["role"]
        if new_role not in ("admin", "operator", "custom"):
            raise HTTPException(status_code=400, detail="Invalid role")
        if item_id == scope["user"]["id"]:
            raise HTTPException(status_code=400, detail="You cannot change your own role")
        if existing.get("role") == "owner":
            raise HTTPException(status_code=400, detail="The business owner's role cannot be changed")
        update["role"] = new_role
        if new_role == "custom":
            rid = str(payload.get("role_id") or "")
            if not rid or not await db.roles.find_one({"_id": oid(rid), "tenant_id": scope["tenant"]["id"]}):
                raise HTTPException(status_code=400, detail="Pick a valid custom role")
            update["role_id"] = rid
        else:
            update["role_id"] = ""
    if payload.get("password"):
        if len(str(payload["password"])) < 6:
            raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
        update["password_hash"] = hash_password(str(payload["password"]))
    if update:
        await db.users.update_one({"_id": oid(item_id)}, {"$set": update})
    return ser(await db.users.find_one({"_id": oid(item_id)}))


@api.delete("/users/{item_id}")
async def delete_user(item_id: str, scope: dict = Depends(require_admin_scope)):
    if item_id == scope["user"]["id"]:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")
    existing = await db.users.find_one({"_id": oid(item_id), "tenant_id": scope["tenant"]["id"]})
    if not existing:
        raise HTTPException(status_code=404, detail="Record not found")
    if existing.get("role") == "owner":
        raise HTTPException(status_code=400, detail="The business owner cannot be removed")
    await db.users.delete_one({"_id": oid(item_id)})
    return {"ok": True}


# ---------------------------------------------------------------- roles (custom RBAC, per tenant)
@api.get("/roles/features")
async def roles_features(scope: dict = Depends(require_admin_scope)):
    return {"features": ALL_FEATURES}


@api.get("/roles")
async def list_roles(scope: dict = Depends(require_admin_scope)):
    return [ser(d) for d in await scope["db"].roles.find({}).sort("name", 1).to_list(500)]


def clean_role(payload: dict) -> dict:
    name = str(payload.get("name", "")).strip()
    if not name:
        raise HTTPException(status_code=400, detail="Role name is required")
    raw = payload.get("permissions") or {}
    if not isinstance(raw, dict):
        raise HTTPException(status_code=400, detail="Invalid permissions")
    perms = {}
    for feature, ops in raw.items():
        if feature in ALL_FEATURES and isinstance(ops, list):
            clean = [o for o in ops if o in ALL_FEATURES[feature]]
            if clean:
                perms[feature] = clean
    if not perms:
        raise HTTPException(status_code=400, detail="Pick at least one permission for this role")
    return {"name": name, "permissions": perms}


@api.post("/roles")
async def create_role(payload: dict = Body(...), scope: dict = Depends(require_admin_scope)):
    doc = clean_role(payload)
    doc["created_at"] = now_iso()
    res = await scope["db"].roles.insert_one(doc)
    return ser(await scope["db"].roles.find_one({"_id": res.inserted_id}))


@api.put("/roles/{item_id}")
async def update_role(item_id: str, payload: dict = Body(...), scope: dict = Depends(require_admin_scope)):
    doc = clean_role(payload)
    doc["updated_at"] = now_iso()
    if (await scope["db"].roles.update_one({"_id": oid(item_id)}, {"$set": doc})).matched_count == 0:
        raise HTTPException(status_code=404, detail="Role not found")
    return ser(await scope["db"].roles.find_one({"_id": oid(item_id)}))


@api.delete("/roles/{item_id}")
async def delete_role(item_id: str, scope: dict = Depends(require_admin_scope)):
    if await db.users.count_documents({"tenant_id": scope["tenant"]["id"], "role_id": item_id}) > 0:
        raise HTTPException(status_code=400, detail="This role is assigned to staff. Reassign them first.")
    if (await scope["db"].roles.delete_one({"_id": oid(item_id)})).deleted_count == 0:
        raise HTTPException(status_code=404, detail="Role not found")
    return {"ok": True}


# ---------------------------------------------------------------- platform (super admin)
@api.get("/platform/plans")
async def platform_plans(user: dict = Depends(require_superadmin)):
    return [{"key": k, **v} for k, v in PLANS.items()]


@api.get("/platform/tenants")
async def platform_tenants(user: dict = Depends(require_superadmin)):
    out = []
    for t in await db.tenants.find({}).sort("created_at", -1).to_list(1000):
        tid = str(t["_id"])
        out.append({**ser(t), "plan_label": PLANS.get(t.get("plan"), {}).get("label", "—"),
                    "companies": await db.companies.count_documents({"tenant_id": tid}),
                    "users": await db.users.count_documents({"tenant_id": tid}),
                    "parties": await db.parties.count_documents({"tenant_id": tid}),
                    "sales": await db.sales.count_documents({"tenant_id": tid}),
                    "purchases": await db.purchases.count_documents({"tenant_id": tid})})
    return out


@api.get("/platform/stats")
async def platform_stats(user: dict = Depends(require_superadmin)):
    tenants = await db.tenants.find({}).to_list(1000)
    mrr = sum(PLANS.get(t.get("plan"), {}).get("price", 0) for t in tenants if t.get("status") == "active")
    return {"tenants": len(tenants),
            "active": len([t for t in tenants if t.get("status") == "active"]),
            "suspended": len([t for t in tenants if t.get("status") == "suspended"]),
            "trials": len([t for t in tenants if t.get("plan") == "trial"]),
            "users": await db.users.count_documents({"role": {"$ne": "superadmin"}}),
            "companies": await db.companies.count_documents({}), "mrr": mrr}


@api.put("/platform/tenants/{tenant_id}")
async def platform_update_tenant(tenant_id: str, payload: dict = Body(...),
                                 user: dict = Depends(require_superadmin)):
    update = {}
    if payload.get("plan"):
        if payload["plan"] not in PLANS:
            raise HTTPException(status_code=400, detail="Unknown plan")
        update["plan"] = payload["plan"]
    if payload.get("status"):
        if payload["status"] not in ("active", "suspended"):
            raise HTTPException(status_code=400, detail="Status must be active or suspended")
        update["status"] = payload["status"]
    if payload.get("plan_expires"):
        update["plan_expires"] = payload["plan_expires"]
    if payload.get("extend_days"):
        base = datetime.now(timezone.utc).date()
        update["plan_expires"] = (base + timedelta(days=int(payload["extend_days"]))).isoformat()
    if payload.get("name"):
        update["name"] = payload["name"]
    if not update:
        raise HTTPException(status_code=400, detail="Nothing to update")
    res = await db.tenants.update_one({"_id": oid(tenant_id)}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Business not found")
    return ser(await db.tenants.find_one({"_id": oid(tenant_id)}))


@api.delete("/platform/tenants/{tenant_id}")
async def platform_delete_tenant(tenant_id: str, user: dict = Depends(require_superadmin)):
    if (await db.tenants.delete_one({"_id": oid(tenant_id)})).deleted_count == 0:
        raise HTTPException(status_code=404, detail="Business not found")
    for coll in ("companies", "users", "parties", "product_categories", "products", "purchases",
                 "sales", "ledger", "receipts", "credit_notes", "debit_notes", "godowns", "price_lists", "counters", "roles"):
        await db[coll].delete_many({"tenant_id": tenant_id})
    return {"ok": True}


# ---------------------------------------------------------------- crons (all tenants)
async def accept_cron(request: Request, job: str) -> Optional[str]:
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else ""
    if not token or not secrets.compare_digest(token, os.environ["WEBHOOK_CRON_SECRET"]):
        raise HTTPException(status_code=401, detail="Unauthorized")
    try:
        envelope = await request.json()
    except Exception:
        envelope = {}
    run_id = request.headers.get("X-Webhook-Id") or envelope.get("run_id") or now_iso()
    if await db.cron_runs.find_one({"_id": run_id}):
        return None
    await db.cron_runs.insert_one({"_id": run_id, "job": job, "started_at": now_iso(), "status": "queued"})
    return run_id


async def run_statements(run_id: str, reminders_only: bool):
    sent, skipped, recipients = 0, 0, []
    as_of = now_iso()[:10]
    for tenant in await db.tenants.find({"status": "active"}).to_list(1000):
        tid = str(tenant["_id"])
        for company in await db.companies.find({"tenant_id": tid}).to_list(100):
            sdb = ScopedDB(tid, str(company["_id"]))
            profile = await company_profile(sdb)
            c_sent, c_skipped = 0, 0
            for p in await sdb.parties.find({}).to_list(5000):
                email = (p.get("email") or "").strip()
                rows, totals = await ledger_rows(sdb, str(p["_id"]))
                blocked = (not email or "@" not in email or
                           (totals["balance"] <= 0 if reminders_only else not rows))
                if blocked:
                    skipped += 1
                    c_skipped += 1
                    continue
                try:
                    if reminders_only:
                        await send_email(to=email,
                                         subject=f"Reminder: outstanding balance with {profile.get('name')}",
                                         html=reminder_html(company_name=profile.get("name", ""),
                                                            party_name=p.get("name", ""),
                                                            balance=totals["balance"], as_of=as_of))
                    else:
                        await send_email(to=email,
                                         subject=f"Your monthly account statement from {profile.get('name')}",
                                         html=statement_html(company_name=profile.get("name", ""),
                                                             party_name=p.get("name", ""),
                                                             rows=rows, totals=totals))
                    sent += 1
                    c_sent += 1
                    recipients.append({"name": p.get("name", ""), "email": email,
                                       "balance": totals["balance"], "company": profile.get("name", "")})
                except Exception as e:
                    logger.error(f"Cron email failed for {email}: {e}")
                    skipped += 1
                    c_skipped += 1
            job_label = "Balance reminders" if reminders_only else "Monthly statements"
            await notify(sdb, feature=GENERAL, kind="email-run",
                         title=f"{job_label} sent to {c_sent} party(ies)",
                         body=f"{c_skipped} skipped (no email or nothing due).",
                         dedupe_key=f"email-run:{run_id}:{company['_id']}")
    await db.cron_runs.update_one({"_id": run_id}, {"$set": {
        "finished_at": now_iso(), "sent": sent, "skipped": skipped,
        "recipients": recipients, "status": "done"}})


@api.post("/cron/monthly-statements")
async def cron_monthly_statements(request: Request, background: BackgroundTasks):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    run_id = await accept_cron(request, "monthly-statements")
    if run_id is None:
        return {"ok": True, "duplicate": True}
    background.add_task(run_statements, run_id, False)
    return {"ok": True, "queued": True, "run_id": run_id}


@api.post("/cron/balance-reminders")
async def cron_balance_reminders(request: Request, background: BackgroundTasks):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    run_id = await accept_cron(request, "balance-reminders")
    if run_id is None:
        return {"ok": True, "duplicate": True}
    background.add_task(run_statements, run_id, True)
    return {"ok": True, "queued": True, "run_id": run_id}


async def plan_expiry_notice(scope: dict) -> None:
    exp = (scope.get("tenant") or {}).get("plan_expires")
    if not exp:
        return
    days = (datetime.fromisoformat(exp).date() - datetime.now(timezone.utc).date()).days
    if 0 <= days <= 7:
        await notify(scope["db"], feature=GENERAL, kind="plan-expiry", level="warning",
                     title=f"Subscription ends in {days} day(s)",
                     body=f"Your {scope['tenant'].get('plan', 'plan')} plan expires on {exp}. Renew to keep working.",
                     dedupe_key=f"plan-expiry:{exp}")


@api.get("/notifications")
async def list_notifications(scope: dict = Depends(require_perm("notifications", "view"))):
    sdb, user = scope["db"], scope["user"]
    await purge(sdb)
    await plan_expiry_notice(scope)
    uid = str(user.get("id") or user.get("_id"))
    docs = await sdb.notifications.find({}).sort("created_at", -1).to_list(200)
    items, unread = [], 0
    for d in docs:
        feature = d.get("feature") or GENERAL
        if feature != GENERAL and not (scope["is_admin"] or has_perm(scope, feature, "view")):
            continue
        row = ser(d)
        row["read"] = uid in (d.get("read_by") or [])
        row.pop("read_by", None)
        if not row["read"]:
            unread += 1
        items.append(row)
    return {"items": items, "unread": unread}


@api.post("/notifications/{item_id}/read")
async def read_notification(item_id: str, scope: dict = Depends(require_perm("notifications", "view"))):
    uid = str(scope["user"].get("id") or scope["user"].get("_id"))
    await scope["db"].notifications.update_one({"_id": oid(item_id)}, {"$addToSet": {"read_by": uid}})
    return {"ok": True}


@api.post("/notifications/read-all")
async def read_all_notifications(scope: dict = Depends(require_perm("notifications", "view"))):
    uid = str(scope["user"].get("id") or scope["user"].get("_id"))
    await scope["db"].notifications.update_many({}, {"$addToSet": {"read_by": uid}})
    return {"ok": True}


@api.delete("/notifications")
async def clear_notifications(scope: dict = Depends(require_admin_scope)):
    await scope["db"].notifications.delete_many({})
    return {"ok": True}


@api.get("/cron/runs")
async def cron_runs(scope: dict = Depends(require_admin_scope)):
    docs = await db.cron_runs.find({}).sort("started_at", -1).to_list(50)
    return [{"run_id": str(d.get("_id")), "job": d.get("job"), "status": d.get("status"),
             "started_at": d.get("started_at"), "finished_at": d.get("finished_at"),
             "sent": d.get("sent"), "skipped": d.get("skipped"),
             "recipients": d.get("recipients") or []} for d in docs]


@api.get("/")
async def root():
    return {"message": "AgriERP API"}


app.include_router(api)
app.add_middleware(CORSMiddleware, allow_credentials=True,
                   allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
                   allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
async def startup():
    email = os.environ["SUPERADMIN_EMAIL"].lower()
    password = os.environ["SUPERADMIN_PASSWORD"]
    existing = await db.users.find_one({"email": email})
    if not existing:
        await db.users.insert_one({"email": email, "name": "Platform Admin", "role": "superadmin",
                                   "tenant_id": None, "password_hash": hash_password(password),
                                   "created_at": now_iso()})
    elif not verify_password(password, existing["password_hash"]):
        await db.users.update_one({"email": email}, {"$set": {"password_hash": hash_password(password)}})
    await db.users.create_index("email", unique=True)
    for coll, keys in (("parties", ["tenant_id", "roles"]), ("ledger", ["tenant_id", "company_id", "party_id"]),
                       ("sales", ["tenant_id", "company_id"]), ("purchases", ["tenant_id", "company_id"])):
        await db[coll].create_index([(k, 1) for k in keys])
    logger.info("ERP backend ready (multi-tenant)")
