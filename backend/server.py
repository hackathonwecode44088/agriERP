from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import logging
import os
from typing import Optional

from fastapi import APIRouter, Body, Depends, FastAPI, HTTPException, Response
from starlette.middleware.cors import CORSMiddleware

from core import (
    create_access_token,
    db,
    get_current_user,
    next_number,
    now_iso,
    oid,
    seed_admin,
    ser,
    verify_password,
)

app = FastAPI(title="Potato Management ERP")
api = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)

CATEGORIES = ("seeds", "lenobag", "potato")


def check_category(category: str):
    if category not in CATEGORIES:
        raise HTTPException(status_code=400, detail="Invalid category")


def num(v) -> float:
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


# ---------------------------------------------------------------- auth
@api.post("/auth/login")
async def login(response: Response, payload: dict = Body(...)):
    email = str(payload.get("email", "")).strip().lower()
    password = str(payload.get("password", ""))
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(str(user["_id"]), email)
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=604800,
        path="/",
    )
    return {"user": ser(user), "access_token": token}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


# ---------------------------------------------------------------- company profile (website)
@api.get("/company-profile")
async def get_profile():
    doc = await db.settings.find_one({"_id": "company"})
    if not doc:
        return {
            "name": "Shree Potato Traders",
            "tagline": "Seed to Storage. One System.",
            "about": "We supply certified potato seeds, leno bags and cold-storage services to farmers across the region.",
            "phone": "+91 90000 00000",
            "email": "info@potatoerp.com",
            "address": "APMC Yard, Deesa, Gujarat, India",
            "gstin": "24ABCDE1234F1Z5",
        }
    doc.pop("_id", None)
    return doc


@api.put("/company-profile")
async def put_profile(payload: dict = Body(...), user: dict = Depends(get_current_user)):
    payload.pop("_id", None)
    await db.settings.update_one({"_id": "company"}, {"$set": payload}, upsert=True)
    return await get_profile()


# ---------------------------------------------------------------- generic masters
MASTERS = {
    "vendors": ["name", "kind", "phone", "email", "gstin", "address", "city", "notes", "status"],
    "farmers": ["name", "phone", "village", "address", "aadhaar", "bank_account", "ifsc", "notes", "status"],
    "companies": ["name", "phone", "email", "gstin", "address", "city", "contact_person", "notes", "status"],
    "godowns": ["name", "kind", "location", "capacity_bags", "manager", "phone", "notes", "status"],
    "products": ["category", "name", "variety", "unit", "hsn", "opening_qty", "notes", "status"],
}


def register_master(name: str, allowed: list):
    coll = name

    async def list_items(
        status: Optional[str] = None,
        category: Optional[str] = None,
        user: dict = Depends(get_current_user),
    ):
        q = {}
        if status:
            q["status"] = status
        if category:
            q["category"] = category
        docs = await db[coll].find(q).sort("created_at", -1).to_list(5000)
        return [ser(d) for d in docs]

    async def create_item(payload: dict = Body(...), user: dict = Depends(get_current_user)):
        doc = {k: v for k, v in payload.items() if k in allowed}
        if not doc.get("name"):
            raise HTTPException(status_code=400, detail="Name is required")
        doc.setdefault("status", "active")
        doc["created_at"] = now_iso()
        res = await db[coll].insert_one(doc)
        return ser(await db[coll].find_one({"_id": res.inserted_id}))

    async def update_item(
        item_id: str, payload: dict = Body(...), user: dict = Depends(get_current_user)
    ):
        doc = {k: v for k, v in payload.items() if k in allowed}
        doc["updated_at"] = now_iso()
        res = await db[coll].update_one({"_id": oid(item_id)}, {"$set": doc})
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="Record not found")
        return ser(await db[coll].find_one({"_id": oid(item_id)}))

    async def delete_item(item_id: str, user: dict = Depends(get_current_user)):
        res = await db[coll].delete_one({"_id": oid(item_id)})
        if res.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Record not found")
        return {"ok": True}

    api.add_api_route(f"/{name}", list_items, methods=["GET"], name=f"list_{name}")
    api.add_api_route(f"/{name}", create_item, methods=["POST"], name=f"create_{name}")
    api.add_api_route(f"/{name}/{{item_id}}", update_item, methods=["PUT"], name=f"update_{name}")
    api.add_api_route(f"/{name}/{{item_id}}", delete_item, methods=["DELETE"], name=f"delete_{name}")


for _name, _allowed in MASTERS.items():
    register_master(_name, _allowed)


# ---------------------------------------------------------------- ledger helpers
async def sync_ledger(ref_type: str, ref_id: str, farmer_id: Optional[str], date: str,
                      particulars: str, debit: float, credit: float):
    await db.ledger.delete_many({"ref_type": ref_type, "ref_id": ref_id})
    if not farmer_id:
        return
    await db.ledger.insert_one(
        {
            "farmer_id": farmer_id,
            "date": date or now_iso()[:10],
            "particulars": particulars,
            "debit": round(debit, 2),
            "credit": round(credit, 2),
            "ref_type": ref_type,
            "ref_id": ref_id,
            "created_at": now_iso(),
        }
    )


TXN_FIELDS = [
    "category", "date", "party_type", "party_id", "product_id", "godown_id",
    "lot_no", "vehicle_no", "bags", "weight", "rate", "rate_basis",
    "payment_type", "payment_mode", "cheque_no", "notes", "status",
]


def clean_txn(payload: dict) -> dict:
    doc = {k: v for k, v in payload.items() if k in TXN_FIELDS}
    check_category(doc.get("category", ""))
    doc["bags"] = num(doc.get("bags"))
    doc["weight"] = num(doc.get("weight"))
    doc["rate"] = num(doc.get("rate"))
    basis = doc.get("rate_basis") or "bag"
    doc["rate_basis"] = basis
    qty = doc["weight"] if basis == "weight" else doc["bags"]
    doc["amount"] = round(qty * doc["rate"], 2)
    doc.setdefault("status", "active")
    doc.setdefault("payment_type", "cash")
    return doc


# ---------------------------------------------------------------- purchases
@api.get("/purchases")
async def list_purchases(category: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {"category": category} if category else {}
    docs = await db.purchases.find(q).sort("date", -1).to_list(5000)
    return [ser(d) for d in docs]


@api.post("/purchases")
async def create_purchase(payload: dict = Body(...), user: dict = Depends(get_current_user)):
    doc = clean_txn(payload)
    doc["invoice_no"] = await next_number("PUR")
    doc["created_at"] = now_iso()
    res = await db.purchases.insert_one(doc)
    pid = str(res.inserted_id)
    if doc.get("party_type") == "farmer" and doc.get("party_id"):
        await sync_ledger("purchase", pid, doc["party_id"], doc.get("date", ""),
                          f"Potato purchase {doc['invoice_no']}", 0, doc["amount"])
    return ser(await db.purchases.find_one({"_id": res.inserted_id}))


@api.put("/purchases/{item_id}")
async def update_purchase(item_id: str, payload: dict = Body(...), user: dict = Depends(get_current_user)):
    doc = clean_txn(payload)
    doc["updated_at"] = now_iso()
    existing = await db.purchases.find_one({"_id": oid(item_id)})
    if not existing:
        raise HTTPException(status_code=404, detail="Record not found")
    await db.purchases.update_one({"_id": oid(item_id)}, {"$set": doc})
    if doc.get("party_type") == "farmer" and doc.get("party_id"):
        await sync_ledger("purchase", item_id, doc["party_id"], doc.get("date", ""),
                          f"Potato purchase {existing.get('invoice_no', '')}", 0, doc["amount"])
    else:
        await db.ledger.delete_many({"ref_type": "purchase", "ref_id": item_id})
    return ser(await db.purchases.find_one({"_id": oid(item_id)}))


@api.delete("/purchases/{item_id}")
async def delete_purchase(item_id: str, user: dict = Depends(get_current_user)):
    res = await db.purchases.delete_one({"_id": oid(item_id)})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Record not found")
    await db.ledger.delete_many({"ref_type": "purchase", "ref_id": item_id})
    return {"ok": True}


# ---------------------------------------------------------------- sales
@api.get("/sales")
async def list_sales(category: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {"category": category} if category else {}
    docs = await db.sales.find(q).sort("date", -1).to_list(5000)
    return [ser(d) for d in docs]


@api.post("/sales")
async def create_sale(payload: dict = Body(...), user: dict = Depends(get_current_user)):
    doc = clean_txn(payload)
    doc["invoice_no"] = await next_number("INV")
    doc["created_at"] = now_iso()
    res = await db.sales.insert_one(doc)
    sid = str(res.inserted_id)
    if doc.get("party_type") == "farmer" and doc.get("party_id"):
        await sync_ledger("sale", sid, doc["party_id"], doc.get("date", ""),
                          f"Sale {doc['invoice_no']}", doc["amount"], 0)
    return ser(await db.sales.find_one({"_id": res.inserted_id}))


@api.put("/sales/{item_id}")
async def update_sale(item_id: str, payload: dict = Body(...), user: dict = Depends(get_current_user)):
    doc = clean_txn(payload)
    doc["updated_at"] = now_iso()
    existing = await db.sales.find_one({"_id": oid(item_id)})
    if not existing:
        raise HTTPException(status_code=404, detail="Record not found")
    await db.sales.update_one({"_id": oid(item_id)}, {"$set": doc})
    if doc.get("party_type") == "farmer" and doc.get("party_id"):
        await sync_ledger("sale", item_id, doc["party_id"], doc.get("date", ""),
                          f"Sale {existing.get('invoice_no', '')}", doc["amount"], 0)
    else:
        await db.ledger.delete_many({"ref_type": "sale", "ref_id": item_id})
    return ser(await db.sales.find_one({"_id": oid(item_id)}))


@api.delete("/sales/{item_id}")
async def delete_sale(item_id: str, user: dict = Depends(get_current_user)):
    res = await db.sales.delete_one({"_id": oid(item_id)})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Record not found")
    await db.ledger.delete_many({"ref_type": "sale", "ref_id": item_id})
    return {"ok": True}


# ---------------------------------------------------------------- credit notes
CN_FIELDS = ["date", "party_type", "party_id", "against_invoice", "amount", "reason", "category", "status"]


@api.get("/credit-notes")
async def list_credit_notes(user: dict = Depends(get_current_user)):
    docs = await db.credit_notes.find({}).sort("date", -1).to_list(5000)
    return [ser(d) for d in docs]


@api.post("/credit-notes")
async def create_credit_note(payload: dict = Body(...), user: dict = Depends(get_current_user)):
    doc = {k: v for k, v in payload.items() if k in CN_FIELDS}
    doc["amount"] = num(doc.get("amount"))
    doc["note_no"] = await next_number("CN")
    doc.setdefault("status", "active")
    doc["created_at"] = now_iso()
    res = await db.credit_notes.insert_one(doc)
    cid = str(res.inserted_id)
    if doc.get("party_type") == "farmer" and doc.get("party_id"):
        await sync_ledger("credit_note", cid, doc["party_id"], doc.get("date", ""),
                          f"Credit note {doc['note_no']}", 0, doc["amount"])
    return ser(await db.credit_notes.find_one({"_id": res.inserted_id}))


@api.put("/credit-notes/{item_id}")
async def update_credit_note(item_id: str, payload: dict = Body(...), user: dict = Depends(get_current_user)):
    doc = {k: v for k, v in payload.items() if k in CN_FIELDS}
    doc["amount"] = num(doc.get("amount"))
    existing = await db.credit_notes.find_one({"_id": oid(item_id)})
    if not existing:
        raise HTTPException(status_code=404, detail="Record not found")
    await db.credit_notes.update_one({"_id": oid(item_id)}, {"$set": doc})
    if doc.get("party_type") == "farmer" and doc.get("party_id"):
        await sync_ledger("credit_note", item_id, doc["party_id"], doc.get("date", ""),
                          f"Credit note {existing.get('note_no', '')}", 0, doc["amount"])
    else:
        await db.ledger.delete_many({"ref_type": "credit_note", "ref_id": item_id})
    return ser(await db.credit_notes.find_one({"_id": oid(item_id)}))


@api.delete("/credit-notes/{item_id}")
async def delete_credit_note(item_id: str, user: dict = Depends(get_current_user)):
    res = await db.credit_notes.delete_one({"_id": oid(item_id)})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Record not found")
    await db.ledger.delete_many({"ref_type": "credit_note", "ref_id": item_id})
    return {"ok": True}


# ---------------------------------------------------------------- farmer ledger
LEDGER_FIELDS = ["farmer_id", "date", "particulars", "debit", "credit", "payment_mode", "notes"]


@api.get("/ledger")
async def get_ledger(farmer_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {"farmer_id": farmer_id} if farmer_id else {}
    docs = await db.ledger.find(q).sort("date", 1).to_list(5000)
    rows, balance = [], 0.0
    for d in docs:
        row = ser(d)
        balance += num(row.get("debit")) - num(row.get("credit"))
        row["balance"] = round(balance, 2)
        rows.append(row)
    total_debit = round(sum(num(r.get("debit")) for r in rows), 2)
    total_credit = round(sum(num(r.get("credit")) for r in rows), 2)
    return {
        "entries": rows,
        "totals": {"debit": total_debit, "credit": total_credit, "balance": round(balance, 2)},
    }


@api.post("/ledger")
async def create_ledger(payload: dict = Body(...), user: dict = Depends(get_current_user)):
    doc = {k: v for k, v in payload.items() if k in LEDGER_FIELDS}
    if not doc.get("farmer_id"):
        raise HTTPException(status_code=400, detail="Farmer is required")
    doc["debit"] = num(doc.get("debit"))
    doc["credit"] = num(doc.get("credit"))
    doc["ref_type"] = "manual"
    doc["created_at"] = now_iso()
    res = await db.ledger.insert_one(doc)
    return ser(await db.ledger.find_one({"_id": res.inserted_id}))


@api.put("/ledger/{item_id}")
async def update_ledger(item_id: str, payload: dict = Body(...), user: dict = Depends(get_current_user)):
    existing = await db.ledger.find_one({"_id": oid(item_id)})
    if not existing:
        raise HTTPException(status_code=404, detail="Record not found")
    if existing.get("ref_type") not in (None, "manual"):
        raise HTTPException(status_code=400, detail="Auto-generated entry, edit the source transaction")
    doc = {k: v for k, v in payload.items() if k in LEDGER_FIELDS}
    doc["debit"] = num(doc.get("debit"))
    doc["credit"] = num(doc.get("credit"))
    await db.ledger.update_one({"_id": oid(item_id)}, {"$set": doc})
    return ser(await db.ledger.find_one({"_id": oid(item_id)}))


@api.delete("/ledger/{item_id}")
async def delete_ledger(item_id: str, user: dict = Depends(get_current_user)):
    existing = await db.ledger.find_one({"_id": oid(item_id)})
    if not existing:
        raise HTTPException(status_code=404, detail="Record not found")
    if existing.get("ref_type") not in (None, "manual"):
        raise HTTPException(status_code=400, detail="Auto-generated entry, delete the source transaction")
    await db.ledger.delete_one({"_id": oid(item_id)})
    return {"ok": True}


# ---------------------------------------------------------------- stock
@api.get("/stock/{category}")
async def stock(category: str, user: dict = Depends(get_current_user)):
    check_category(category)
    products = await db.products.find({"category": category}).to_list(2000)
    purchases = await db.purchases.find({"category": category}).to_list(5000)
    sales = await db.sales.find({"category": category}).to_list(5000)
    godowns = {str(g["_id"]): g.get("name", "") for g in await db.godowns.find({}).to_list(500)}

    rows = []
    for p in products:
        pid = str(p["_id"])
        pin = [x for x in purchases if x.get("product_id") == pid]
        pout = [x for x in sales if x.get("product_id") == pid]
        in_bags = sum(num(x.get("bags")) for x in pin) + num(p.get("opening_qty"))
        in_weight = sum(num(x.get("weight")) for x in pin)
        out_bags = sum(num(x.get("bags")) for x in pout)
        out_weight = sum(num(x.get("weight")) for x in pout)
        rows.append(
            {
                "product_id": pid,
                "product": p.get("name", ""),
                "variety": p.get("variety", ""),
                "unit": p.get("unit", "bag"),
                "in_bags": round(in_bags, 2),
                "out_bags": round(out_bags, 2),
                "balance_bags": round(in_bags - out_bags, 2),
                "in_weight": round(in_weight, 2),
                "out_weight": round(out_weight, 2),
                "balance_weight": round(in_weight - out_weight, 2),
                "purchase_value": round(sum(num(x.get("amount")) for x in pin), 2),
                "sale_value": round(sum(num(x.get("amount")) for x in pout), 2),
            }
        )

    by_godown = {}
    for x in purchases:
        g = godowns.get(x.get("godown_id", ""), "Unassigned")
        by_godown.setdefault(g, {"godown": g, "in_bags": 0.0, "out_bags": 0.0})
        by_godown[g]["in_bags"] += num(x.get("bags"))
    for x in sales:
        g = godowns.get(x.get("godown_id", ""), "Unassigned")
        by_godown.setdefault(g, {"godown": g, "in_bags": 0.0, "out_bags": 0.0})
        by_godown[g]["out_bags"] += num(x.get("bags"))
    godown_rows = []
    for v in by_godown.values():
        godown_rows.append(
            {
                "godown": v["godown"],
                "in_bags": round(v["in_bags"], 2),
                "out_bags": round(v["out_bags"], 2),
                "balance_bags": round(v["in_bags"] - v["out_bags"], 2),
            }
        )

    lots = []
    if category == "potato":
        for x in purchases:
            if x.get("lot_no"):
                sold = sum(num(s.get("bags")) for s in sales if s.get("lot_no") == x.get("lot_no"))
                lots.append(
                    {
                        "lot_no": x.get("lot_no"),
                        "vehicle_no": x.get("vehicle_no", ""),
                        "godown": godowns.get(x.get("godown_id", ""), "-"),
                        "in_bags": num(x.get("bags")),
                        "weight": num(x.get("weight")),
                        "sold_bags": round(sold, 2),
                        "balance_bags": round(num(x.get("bags")) - sold, 2),
                    }
                )

    return {"products": rows, "godowns": godown_rows, "lots": lots}


# ---------------------------------------------------------------- dashboard & reports
@api.get("/dashboard/summary")
async def dashboard(user: dict = Depends(get_current_user)):
    async def totals(coll, category):
        docs = await db[coll].find({"category": category}).to_list(5000)
        return {
            "count": len(docs),
            "bags": round(sum(num(d.get("bags")) for d in docs), 2),
            "weight": round(sum(num(d.get("weight")) for d in docs), 2),
            "amount": round(sum(num(d.get("amount")) for d in docs), 2),
        }

    out = {}
    for cat in CATEGORIES:
        out[cat] = {"purchase": await totals("purchases", cat), "sale": await totals("sales", cat)}

    ledger = await db.ledger.find({}).to_list(10000)
    receivable = round(sum(num(l.get("debit")) - num(l.get("credit")) for l in ledger), 2)

    counts = {}
    for coll in ("vendors", "farmers", "companies", "godowns", "products"):
        counts[coll] = await db[coll].count_documents({})

    recent_sales = [ser(d) for d in await db.sales.find({}).sort("created_at", -1).to_list(6)]
    recent_purchases = [ser(d) for d in await db.purchases.find({}).sort("created_at", -1).to_list(6)]

    return {
        "categories": out,
        "counts": counts,
        "farmer_balance": receivable,
        "recent_sales": recent_sales,
        "recent_purchases": recent_purchases,
    }


@api.get("/reports/transactions")
async def report_transactions(
    kind: str = "sales",
    category: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    party_id: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    if kind not in ("sales", "purchases"):
        raise HTTPException(status_code=400, detail="kind must be sales or purchases")
    q = {}
    if category:
        q["category"] = category
    if party_id:
        q["party_id"] = party_id
    if date_from or date_to:
        q["date"] = {}
        if date_from:
            q["date"]["$gte"] = date_from
        if date_to:
            q["date"]["$lte"] = date_to
    docs = [ser(d) for d in await db[kind].find(q).sort("date", -1).to_list(5000)]
    return {
        "rows": docs,
        "totals": {
            "count": len(docs),
            "bags": round(sum(num(d.get("bags")) for d in docs), 2),
            "weight": round(sum(num(d.get("weight")) for d in docs), 2),
            "amount": round(sum(num(d.get("amount")) for d in docs), 2),
        },
    }


@api.get("/invoices")
async def invoices(kind: Optional[str] = None, user: dict = Depends(get_current_user)):
    rows = []
    if kind in (None, "sale"):
        for d in await db.sales.find({}).sort("date", -1).to_list(5000):
            r = ser(d)
            r["doc_type"] = "sale"
            rows.append(r)
    if kind in (None, "purchase"):
        for d in await db.purchases.find({}).sort("date", -1).to_list(5000):
            r = ser(d)
            r["doc_type"] = "purchase"
            rows.append(r)
    rows.sort(key=lambda r: r.get("date") or "", reverse=True)
    return rows


@api.get("/")
async def root():
    return {"message": "Potato Management ERP API"}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await seed_admin()
    await db.users.create_index("email", unique=True)
    await db.ledger.create_index("farmer_id")
    logger.info("ERP backend ready")
