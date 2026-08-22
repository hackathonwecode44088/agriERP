from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import logging
import os
import secrets
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Body, Depends, FastAPI, HTTPException, Request, Response
from starlette.middleware.cors import CORSMiddleware

from core import (
    create_access_token,
    db,
    get_current_user,
    hash_password,
    next_number,
    now_iso,
    oid,
    require_admin,
    seed_admin,
    ser,
    verify_password,
)
from mailer import reminder_html, send_email, statement_html

app = FastAPI(title="Potato Management ERP")
api = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)

ROLES = ("farmer", "vendor", "customer")


def num(v) -> float:
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def as_list(v) -> list:
    if isinstance(v, list):
        return [str(x) for x in v if str(x) in ROLES]
    if isinstance(v, str) and v in ROLES:
        return [v]
    return []


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
        key="access_token", value=token, httponly=True, secure=True,
        samesite="none", max_age=604800, path="/",
    )
    return {"user": ser(user), "access_token": token}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


# ---------------------------------------------------------------- company profile
@api.get("/company-profile")
async def get_profile():
    doc = await db.settings.find_one({"_id": "company"})
    if not doc:
        doc = {
            "name": "Shree Potato Traders",
            "tagline": "Seed to Storage. One System.",
            "about": "We supply certified potato seeds, leno bags and cold-storage services to farmers across the region.",
            "phone": "+91 90000 00000",
            "email": "info@potatoerp.com",
            "address": "APMC Yard, Deesa, Gujarat, India",
            "gstin": "24ABCDE1234F1Z5",
        }
    doc.pop("_id", None)
    doc.setdefault("rate_alert_threshold", 20)
    doc.setdefault("low_stock_threshold", 10)
    return doc


@api.put("/company-profile", dependencies=[Depends(require_admin)])
async def put_profile(payload: dict = Body(...), user: dict = Depends(get_current_user)):
    payload.pop("_id", None)
    await db.settings.update_one({"_id": "company"}, {"$set": payload}, upsert=True)
    return await get_profile()


# ---------------------------------------------------------------- masters
MASTERS = {
    "parties": [
        "name", "roles", "phone", "email", "village", "city", "address", "gstin",
        "aadhaar", "bank_account", "ifsc", "contact_person", "opening_balance", "notes", "status",
    ],
    "product-categories": ["name", "unit", "tracks_lot", "gst_default", "notes", "status"],
    "products": ["category_id", "name", "variety", "unit", "hsn", "opening_qty", "notes", "status"],
    "godowns": ["name", "kind", "location", "capacity_bags", "manager", "phone", "notes", "status"],
}
COLLECTION = {"parties": "parties", "product-categories": "product_categories",
              "products": "products", "godowns": "godowns"}


def register_master(name: str, allowed: list):
    coll = COLLECTION[name]

    async def list_items(
        status: Optional[str] = None,
        role: Optional[str] = None,
        category_id: Optional[str] = None,
        user: dict = Depends(get_current_user),
    ):
        q = {}
        if status:
            q["status"] = status
        if role:
            q["roles"] = role
        if category_id:
            q["category_id"] = category_id
        docs = await db[coll].find(q).sort("name", 1).to_list(5000)
        return [ser(d) for d in docs]

    async def create_item(payload: dict = Body(...), user: dict = Depends(get_current_user)):
        doc = {k: v for k, v in payload.items() if k in allowed}
        if not str(doc.get("name", "")).strip():
            raise HTTPException(status_code=400, detail="Name is required")
        if name == "parties":
            doc["roles"] = as_list(doc.get("roles"))
            if not doc["roles"]:
                raise HTTPException(status_code=400, detail="Pick at least one role (farmer, vendor or customer)")
        if name == "product-categories":
            doc["tracks_lot"] = str(doc.get("tracks_lot")).lower() in ("true", "1", "yes")
        if name == "products" and not doc.get("category_id"):
            raise HTTPException(status_code=400, detail="Category is required")
        doc.setdefault("status", "active")
        doc["created_at"] = now_iso()
        res = await db[coll].insert_one(doc)
        return ser(await db[coll].find_one({"_id": res.inserted_id}))

    async def update_item(item_id: str, payload: dict = Body(...), user: dict = Depends(get_current_user)):
        doc = {k: v for k, v in payload.items() if k in allowed}
        if name == "parties" and "roles" in doc:
            doc["roles"] = as_list(doc.get("roles"))
            if not doc["roles"]:
                raise HTTPException(status_code=400, detail="Pick at least one role (farmer, vendor or customer)")
        if name == "product-categories" and "tracks_lot" in doc:
            doc["tracks_lot"] = str(doc.get("tracks_lot")).lower() in ("true", "1", "yes")
        doc["updated_at"] = now_iso()
        res = await db[coll].update_one({"_id": oid(item_id)}, {"$set": doc})
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="Record not found")
        return ser(await db[coll].find_one({"_id": oid(item_id)}))

    async def delete_item(item_id: str, user: dict = Depends(get_current_user)):
        if name == "product-categories":
            if await db.products.count_documents({"category_id": item_id}) > 0:
                raise HTTPException(status_code=400, detail="Category has products. Move or delete them first.")
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


# ---------------------------------------------------------------- ledger core
async def sync_ledger(ref_type: str, ref_id: str, party_id: Optional[str], date: str,
                      particulars: str, debit: float, credit: float):
    await db.ledger.delete_many({"ref_type": ref_type, "ref_id": ref_id})
    if not party_id or (debit == 0 and credit == 0):
        return
    await db.ledger.insert_one(
        {
            "party_id": party_id,
            "date": date or now_iso()[:10],
            "particulars": particulars,
            "debit": round(debit, 2),
            "credit": round(credit, 2),
            "ref_type": ref_type,
            "ref_id": ref_id,
            "created_at": now_iso(),
        }
    )


async def ledger_rows(party_id: str):
    docs = await db.ledger.find({"party_id": party_id}).sort("date", 1).to_list(5000)
    rows, balance = [], 0.0
    for d in docs:
        row = ser(d)
        balance += num(row.get("debit")) - num(row.get("credit"))
        row["balance"] = round(balance, 2)
        rows.append(row)
    return rows, {
        "debit": round(sum(num(r["debit"]) for r in rows), 2),
        "credit": round(sum(num(r["credit"]) for r in rows), 2),
        "balance": round(balance, 2),
    }


# ---------------------------------------------------------------- transactions
TXN_FIELDS = [
    "date", "category_id", "party_id", "product_id", "godown_id", "lot_no", "vehicle_no",
    "bags", "weight", "rate", "rate_basis", "gst_rate", "payment_type", "payment_mode",
    "payment_status", "cheque_no", "notes", "status",
]


def clean_txn(payload: dict) -> dict:
    doc = {k: v for k, v in payload.items() if k in TXN_FIELDS}
    if not doc.get("category_id"):
        raise HTTPException(status_code=400, detail="Category is required")
    doc["bags"] = num(doc.get("bags"))
    doc["weight"] = num(doc.get("weight"))
    doc["rate"] = num(doc.get("rate"))
    doc["rate_basis"] = doc.get("rate_basis") or "bag"
    qty = doc["weight"] if doc["rate_basis"] == "weight" else doc["bags"]
    doc["amount"] = round(qty * doc["rate"], 2)
    gst = num(doc.get("gst_rate"))
    doc["gst_rate"] = gst
    doc["cgst"] = round(doc["amount"] * gst / 200, 2)
    doc["sgst"] = round(doc["amount"] * gst / 200, 2)
    doc["total_amount"] = round(doc["amount"] + doc["cgst"] + doc["sgst"], 2)
    doc.setdefault("status", "active")
    doc.setdefault("payment_type", "cash")
    if not doc.get("payment_status"):
        doc["payment_status"] = "paid" if doc["payment_type"] == "cash" else "unpaid"
    return doc


def txn_paid_amount(txn: dict, receipts: list) -> float:
    invoice_no = txn.get("invoice_no") or ""
    allocated = sum(
        num(r.get("amount")) for r in receipts
        if invoice_no and (r.get("against_invoice") or "") == invoice_no
    )
    total = num(txn.get("total_amount") or txn.get("amount"))
    if txn.get("payment_status") == "paid":
        return round(max(allocated, total), 2)
    return round(allocated, 2)


async def available(kind_field: str, category_id: str, product_id: str, lot_no: str = "",
                    exclude_sale_id: str = "") -> float:
    """Available bags/weight of a product (optionally within a lot)."""
    q = {"category_id": category_id, "product_id": product_id}
    if lot_no:
        q["lot_no"] = lot_no
    purchased = sum(num(d.get(kind_field)) for d in await db.purchases.find(q).to_list(5000))
    sold = sum(
        num(d.get(kind_field)) for d in await db.sales.find(q).to_list(5000)
        if not (exclude_sale_id and str(d["_id"]) == exclude_sale_id)
    )
    opening = 0.0
    if kind_field == "bags" and not lot_no and product_id:
        prod = await db.products.find_one({"_id": oid(product_id)})
        opening = num(prod.get("opening_qty")) if prod else 0.0
    return round(purchased + opening - sold, 2)


async def assert_sale_stock(doc: dict, exclude_sale_id: str = ""):
    if not doc.get("product_id"):
        return
    if doc["bags"] > 0:
        bags = await available("bags", doc["category_id"], doc["product_id"], "", exclude_sale_id)
        if doc["bags"] > bags:
            raise HTTPException(
                status_code=400,
                detail=f"Only {max(bags, 0)} bags of this product are in stock. Reduce the quantity or record a purchase first.",
            )
        if doc.get("lot_no"):
            lot = await available("bags", doc["category_id"], doc["product_id"], doc["lot_no"], exclude_sale_id)
            if doc["bags"] > lot:
                raise HTTPException(status_code=400, detail=f"Lot {doc['lot_no']} has only {max(lot, 0)} bags left.")
    elif doc["weight"] > 0:
        wt = await available("weight", doc["category_id"], doc["product_id"], "", exclude_sale_id)
        if doc["weight"] > wt:
            raise HTTPException(
                status_code=400,
                detail=f"Only {max(wt, 0)} kg of this product are in stock. Reduce the weight or record a purchase first.",
            )


async def sync_txn_ledger(kind: str, txn_id: str, doc: dict):
    """Purchases credit the party (we owe); sales debit them. A paid flag books the settlement."""
    total = num(doc.get("total_amount") or doc.get("amount"))
    label = doc.get("invoice_no", "")
    party = doc.get("party_id")
    if kind == "purchases":
        await sync_ledger("purchase", txn_id, party, doc.get("date", ""), f"Purchase {label}", 0, total)
        paid = total if doc.get("payment_status") == "paid" else 0
        await sync_ledger("purchase_payment", txn_id, party, doc.get("date", ""),
                          f"Payment for {label} ({doc.get('payment_mode', 'cash')})", paid, 0)
    else:
        await sync_ledger("sale", txn_id, party, doc.get("date", ""), f"Sale {label}", total, 0)
        paid = total if doc.get("payment_status") == "paid" else 0
        await sync_ledger("sale_payment", txn_id, party, doc.get("date", ""),
                          f"Payment against {label} ({doc.get('payment_mode', 'cash')})", 0, paid)


def register_txn(kind: str):
    prefix = "PUR" if kind == "purchases" else "INV"

    async def list_txn(category_id: Optional[str] = None, party_id: Optional[str] = None,
                       user: dict = Depends(get_current_user)):
        q = {}
        if category_id:
            q["category_id"] = category_id
        if party_id:
            q["party_id"] = party_id
        docs = await db[kind].find(q).sort("date", -1).to_list(5000)
        return [ser(d) for d in docs]

    async def create_txn(payload: dict = Body(...), user: dict = Depends(get_current_user)):
        doc = clean_txn(payload)
        if kind == "sales":
            await assert_sale_stock(doc)
        doc["invoice_no"] = await next_number(prefix)
        doc["created_at"] = now_iso()
        res = await db[kind].insert_one(doc)
        txn_id = str(res.inserted_id)
        await sync_txn_ledger(kind, txn_id, doc)
        return ser(await db[kind].find_one({"_id": res.inserted_id}))

    async def update_txn(item_id: str, payload: dict = Body(...), user: dict = Depends(get_current_user)):
        existing = await db[kind].find_one({"_id": oid(item_id)})
        if not existing:
            raise HTTPException(status_code=404, detail="Record not found")
        doc = clean_txn(payload)
        if kind == "sales":
            await assert_sale_stock(doc, exclude_sale_id=item_id)
        doc["updated_at"] = now_iso()
        await db[kind].update_one({"_id": oid(item_id)}, {"$set": doc})
        await sync_txn_ledger(kind, item_id, {**doc, "invoice_no": existing.get("invoice_no", "")})
        return ser(await db[kind].find_one({"_id": oid(item_id)}))

    async def delete_txn(item_id: str, user: dict = Depends(get_current_user)):
        res = await db[kind].delete_one({"_id": oid(item_id)})
        if res.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Record not found")
        base = "purchase" if kind == "purchases" else "sale"
        await db.ledger.delete_many({"ref_type": {"$in": [base, f"{base}_payment"]}, "ref_id": item_id})
        return {"ok": True}

    async def add_payment(item_id: str, payload: dict = Body(...), user: dict = Depends(require_admin)):
        txn = await db[kind].find_one({"_id": oid(item_id)})
        if not txn:
            raise HTTPException(status_code=404, detail="Invoice not found")
        amount = num(payload.get("amount"))
        if amount <= 0:
            raise HTTPException(status_code=400, detail="Enter an amount greater than zero")
        invoice_no = txn.get("invoice_no", "")
        receipts = await db.receipts.find({"against_invoice": invoice_no}).to_list(5000)
        total = num(txn.get("total_amount") or txn.get("amount"))
        already = sum(num(r.get("amount")) for r in receipts)
        if round(already + amount, 2) > round(total, 2):
            raise HTTPException(status_code=400,
                                detail=f"Only {round(total - already, 2)} is outstanding on this invoice.")
        doc = {
            "date": payload.get("date") or now_iso()[:10],
            "direction": "paid" if kind == "purchases" else "received",
            "party_id": txn.get("party_id"),
            "amount": amount,
            "payment_mode": payload.get("payment_mode") or "cash",
            "cheque_no": payload.get("cheque_no") or "",
            "against_invoice": invoice_no,
            "notes": payload.get("notes") or "",
            "receipt_no": await next_number("RCP"),
            "created_at": now_iso(),
        }
        res = await db.receipts.insert_one(doc)
        await apply_receipt_ledger(str(res.inserted_id), doc)
        paid = round(already + amount, 2)
        status = "paid" if paid >= round(total, 2) else "partial"
        await db[kind].update_one({"_id": oid(item_id)}, {"$set": {"payment_status": status}})
        await sync_txn_ledger(kind, item_id, {**txn, "payment_status": "partial"})
        return {"ok": True, "receipt": ser(await db.receipts.find_one({"_id": res.inserted_id})),
                "paid_amount": paid, "balance": round(total - paid, 2), "payment_status": status}

    api.add_api_route(f"/{kind}", list_txn, methods=["GET"], name=f"list_{kind}")
    api.add_api_route(f"/{kind}", create_txn, methods=["POST"], name=f"create_{kind}")
    api.add_api_route(f"/{kind}/{{item_id}}", update_txn, methods=["PUT"], name=f"update_{kind}")
    api.add_api_route(f"/{kind}/{{item_id}}", delete_txn, methods=["DELETE"], name=f"delete_{kind}")
    api.add_api_route(f"/{kind}/{{item_id}}/payments", add_payment, methods=["POST"], name=f"pay_{kind}")


for _kind in ("purchases", "sales"):
    register_txn(_kind)


# ---------------------------------------------------------------- receipts
RECEIPT_FIELDS = ["date", "direction", "party_id", "amount", "payment_mode",
                  "cheque_no", "against_invoice", "notes"]


async def apply_receipt_ledger(receipt_id: str, doc: dict):
    """Money received credits the party; money paid out debits them."""
    paid_out = doc.get("direction") == "paid"
    label = f"{'Payment made' if paid_out else 'Payment received'} {doc.get('receipt_no', '')}"
    if doc.get("against_invoice"):
        label += f" against {doc['against_invoice']}"
    await sync_ledger("receipt", receipt_id, doc.get("party_id"), doc.get("date", ""),
                      f"{label} ({doc.get('payment_mode', 'cash')})",
                      doc["amount"] if paid_out else 0, 0 if paid_out else doc["amount"])


@api.get("/receipts", dependencies=[Depends(require_admin)])
async def list_receipts(party_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {"party_id": party_id} if party_id else {}
    return [ser(d) for d in await db.receipts.find(q).sort("date", -1).to_list(5000)]


@api.post("/receipts", dependencies=[Depends(require_admin)])
async def create_receipt(payload: dict = Body(...), user: dict = Depends(get_current_user)):
    doc = {k: v for k, v in payload.items() if k in RECEIPT_FIELDS}
    doc["amount"] = num(doc.get("amount"))
    doc.setdefault("direction", "received")
    doc.setdefault("payment_mode", "cash")
    doc["receipt_no"] = await next_number("RCP")
    doc["created_at"] = now_iso()
    res = await db.receipts.insert_one(doc)
    await apply_receipt_ledger(str(res.inserted_id), doc)
    return ser(await db.receipts.find_one({"_id": res.inserted_id}))


@api.put("/receipts/{item_id}", dependencies=[Depends(require_admin)])
async def update_receipt(item_id: str, payload: dict = Body(...), user: dict = Depends(get_current_user)):
    existing = await db.receipts.find_one({"_id": oid(item_id)})
    if not existing:
        raise HTTPException(status_code=404, detail="Record not found")
    doc = {k: v for k, v in payload.items() if k in RECEIPT_FIELDS}
    doc["amount"] = num(doc.get("amount"))
    await db.receipts.update_one({"_id": oid(item_id)}, {"$set": doc})
    await apply_receipt_ledger(item_id, {**existing, **doc})
    return ser(await db.receipts.find_one({"_id": oid(item_id)}))


@api.delete("/receipts/{item_id}", dependencies=[Depends(require_admin)])
async def delete_receipt(item_id: str, user: dict = Depends(get_current_user)):
    res = await db.receipts.delete_one({"_id": oid(item_id)})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Record not found")
    await db.ledger.delete_many({"ref_type": "receipt", "ref_id": item_id})
    return {"ok": True}


# ---------------------------------------------------------------- credit notes
CN_FIELDS = ["date", "party_id", "against_invoice", "amount", "reason", "category_id", "status"]


@api.get("/credit-notes", dependencies=[Depends(require_admin)])
async def list_credit_notes(user: dict = Depends(get_current_user)):
    return [ser(d) for d in await db.credit_notes.find({}).sort("date", -1).to_list(5000)]


@api.post("/credit-notes", dependencies=[Depends(require_admin)])
async def create_credit_note(payload: dict = Body(...), user: dict = Depends(get_current_user)):
    doc = {k: v for k, v in payload.items() if k in CN_FIELDS}
    doc["amount"] = num(doc.get("amount"))
    doc["note_no"] = await next_number("CN")
    doc.setdefault("status", "active")
    doc["created_at"] = now_iso()
    res = await db.credit_notes.insert_one(doc)
    await sync_ledger("credit_note", str(res.inserted_id), doc.get("party_id"), doc.get("date", ""),
                      f"Credit note {doc['note_no']}", 0, doc["amount"])
    return ser(await db.credit_notes.find_one({"_id": res.inserted_id}))


@api.put("/credit-notes/{item_id}", dependencies=[Depends(require_admin)])
async def update_credit_note(item_id: str, payload: dict = Body(...), user: dict = Depends(get_current_user)):
    existing = await db.credit_notes.find_one({"_id": oid(item_id)})
    if not existing:
        raise HTTPException(status_code=404, detail="Record not found")
    doc = {k: v for k, v in payload.items() if k in CN_FIELDS}
    doc["amount"] = num(doc.get("amount"))
    await db.credit_notes.update_one({"_id": oid(item_id)}, {"$set": doc})
    await sync_ledger("credit_note", item_id, doc.get("party_id"), doc.get("date", ""),
                      f"Credit note {existing.get('note_no', '')}", 0, doc["amount"])
    return ser(await db.credit_notes.find_one({"_id": oid(item_id)}))


@api.delete("/credit-notes/{item_id}", dependencies=[Depends(require_admin)])
async def delete_credit_note(item_id: str, user: dict = Depends(get_current_user)):
    res = await db.credit_notes.delete_one({"_id": oid(item_id)})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Record not found")
    await db.ledger.delete_many({"ref_type": "credit_note", "ref_id": item_id})
    return {"ok": True}


# ---------------------------------------------------------------- party ledger
LEDGER_FIELDS = ["party_id", "date", "particulars", "debit", "credit", "payment_mode", "notes"]
AUTO_REFS = ("purchase", "purchase_payment", "sale", "sale_payment", "receipt", "credit_note")


@api.get("/ledger", dependencies=[Depends(require_admin)])
async def get_ledger(party_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    if not party_id:
        return {"entries": [], "totals": {"debit": 0, "credit": 0, "balance": 0}}
    rows, totals = await ledger_rows(party_id)
    return {"entries": rows, "totals": totals}


@api.post("/ledger", dependencies=[Depends(require_admin)])
async def create_ledger(payload: dict = Body(...), user: dict = Depends(get_current_user)):
    doc = {k: v for k, v in payload.items() if k in LEDGER_FIELDS}
    if not doc.get("party_id"):
        raise HTTPException(status_code=400, detail="Party is required")
    doc["debit"] = num(doc.get("debit"))
    doc["credit"] = num(doc.get("credit"))
    doc["ref_type"] = "manual"
    doc["created_at"] = now_iso()
    res = await db.ledger.insert_one(doc)
    return ser(await db.ledger.find_one({"_id": res.inserted_id}))


@api.put("/ledger/{item_id}", dependencies=[Depends(require_admin)])
async def update_ledger(item_id: str, payload: dict = Body(...), user: dict = Depends(get_current_user)):
    existing = await db.ledger.find_one({"_id": oid(item_id)})
    if not existing:
        raise HTTPException(status_code=404, detail="Record not found")
    if existing.get("ref_type") in AUTO_REFS:
        raise HTTPException(status_code=400, detail="Auto-generated entry, edit the source transaction")
    doc = {k: v for k, v in payload.items() if k in LEDGER_FIELDS}
    doc["debit"] = num(doc.get("debit"))
    doc["credit"] = num(doc.get("credit"))
    await db.ledger.update_one({"_id": oid(item_id)}, {"$set": doc})
    return ser(await db.ledger.find_one({"_id": oid(item_id)}))


@api.delete("/ledger/{item_id}", dependencies=[Depends(require_admin)])
async def delete_ledger(item_id: str, user: dict = Depends(get_current_user)):
    existing = await db.ledger.find_one({"_id": oid(item_id)})
    if not existing:
        raise HTTPException(status_code=404, detail="Record not found")
    if existing.get("ref_type") in AUTO_REFS:
        raise HTTPException(status_code=400, detail="Auto-generated entry, delete the source transaction")
    await db.ledger.delete_one({"_id": oid(item_id)})
    return {"ok": True}


@api.get("/outstanding", dependencies=[Depends(require_admin)])
async def outstanding(user: dict = Depends(get_current_user)):
    parties = await db.parties.find({}).to_list(5000)
    ledger = await db.ledger.find({}).to_list(50000)
    rows = []
    for p in parties:
        pid = str(p["_id"])
        entries = [x for x in ledger if x.get("party_id") == pid]
        if not entries:
            continue
        debit = sum(num(x.get("debit")) for x in entries)
        credit = sum(num(x.get("credit")) for x in entries)
        rows.append(
            {
                "party_id": pid,
                "name": p.get("name", ""),
                "roles": p.get("roles", []),
                "village": p.get("village", ""),
                "debit": round(debit, 2),
                "credit": round(credit, 2),
                "balance": round(debit - credit, 2),
            }
        )
    rows.sort(key=lambda r: -abs(r["balance"]))
    return {
        "parties": rows,
        "totals": {
            "receivable": round(sum(r["balance"] for r in rows if r["balance"] > 0), 2),
            "payable": round(-sum(r["balance"] for r in rows if r["balance"] < 0), 2),
            "net": round(sum(r["balance"] for r in rows), 2),
        },
    }


# ---------------------------------------------------------------- stock & lots
@api.get("/stock")
async def stock(category_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    pq = {"category_id": category_id} if category_id else {}
    products = await db.products.find(pq).to_list(2000)
    purchases = await db.purchases.find(pq).to_list(10000)
    sales = await db.sales.find(pq).to_list(10000)
    godowns = {str(g["_id"]): g.get("name", "") for g in await db.godowns.find({}).to_list(500)}
    categories = {str(c["_id"]): c for c in await db.product_categories.find({}).to_list(200)}

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
                "category": categories.get(p.get("category_id", ""), {}).get("name", "-"),
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
    for x in purchases + sales:
        g = godowns.get(x.get("godown_id", ""), "Unassigned")
        row = by_godown.setdefault(g, {"godown": g, "in_bags": 0.0, "out_bags": 0.0})
        row["in_bags" if x in purchases else "out_bags"] += num(x.get("bags"))
    godown_rows = [
        {**v, "in_bags": round(v["in_bags"], 2), "out_bags": round(v["out_bags"], 2),
         "balance_bags": round(v["in_bags"] - v["out_bags"], 2)}
        for v in by_godown.values()
    ]

    lots = []
    for x in purchases:
        if not x.get("lot_no"):
            continue
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


@api.get("/lots/trace")
async def lot_trace(category_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {"category_id": category_id} if category_id else {}
    purchases = await db.purchases.find(q).to_list(10000)
    sales = await db.sales.find(q).to_list(10000)
    parties = {str(p["_id"]): p.get("name", "") for p in await db.parties.find({}).to_list(5000)}
    godowns = {str(g["_id"]): g.get("name", "") for g in await db.godowns.find({}).to_list(500)}
    products = {str(p["_id"]): p.get("name", "") for p in await db.products.find({}).to_list(2000)}

    rows = []
    for p in purchases:
        if not p.get("lot_no"):
            continue
        lot = p["lot_no"]
        outs = sorted([s for s in sales if s.get("lot_no") == lot], key=lambda x: x.get("date") or "")
        sold_bags = sum(num(s.get("bags")) for s in outs)
        sale_value = sum(num(s.get("amount")) for s in outs)
        rows.append(
            {
                "lot_no": lot,
                "purchase_no": p.get("invoice_no", ""),
                "purchase_date": p.get("date", ""),
                "supplier": parties.get(p.get("party_id", ""), "-"),
                "product": products.get(p.get("product_id", ""), "-"),
                "godown": godowns.get(p.get("godown_id", ""), "-"),
                "vehicle_no": p.get("vehicle_no", ""),
                "in_bags": num(p.get("bags")),
                "in_weight": num(p.get("weight")),
                "purchase_value": round(num(p.get("amount")), 2),
                "sold_bags": round(sold_bags, 2),
                "balance_bags": round(num(p.get("bags")) - sold_bags, 2),
                "sale_value": round(sale_value, 2),
                "margin": round(sale_value - num(p.get("amount")), 2),
                "sales": [
                    {
                        "invoice_no": s.get("invoice_no", ""),
                        "date": s.get("date", ""),
                        "buyer": parties.get(s.get("party_id", ""), "-"),
                        "bags": num(s.get("bags")),
                        "weight": num(s.get("weight")),
                        "amount": round(num(s.get("amount")), 2),
                        "payment_mode": s.get("payment_mode", ""),
                    }
                    for s in outs
                ],
            }
        )
    rows.sort(key=lambda r: r["purchase_date"], reverse=True)
    return rows


# ---------------------------------------------------------------- dashboard
@api.get("/dashboard/summary")
async def dashboard(user: dict = Depends(get_current_user)):
    categories = [ser(c) for c in await db.product_categories.find({}).sort("name", 1).to_list(200)]
    purchases = await db.purchases.find({}).to_list(20000)
    sales = await db.sales.find({}).to_list(20000)

    def totals(docs):
        return {
            "count": len(docs),
            "bags": round(sum(num(d.get("bags")) for d in docs), 2),
            "weight": round(sum(num(d.get("weight")) for d in docs), 2),
            "amount": round(sum(num(d.get("amount")) for d in docs), 2),
        }

    cats = [
        {
            "category_id": c["id"],
            "name": c["name"],
            "purchase": totals([d for d in purchases if d.get("category_id") == c["id"]]),
            "sale": totals([d for d in sales if d.get("category_id") == c["id"]]),
        }
        for c in categories
    ]

    ledger = await db.ledger.find({}).to_list(50000)
    balances = {}
    for x in ledger:
        balances[x.get("party_id")] = balances.get(x.get("party_id"), 0) + num(x.get("debit")) - num(x.get("credit"))
    receivable = round(sum(v for v in balances.values() if v > 0), 2)
    payable = round(-sum(v for v in balances.values() if v < 0), 2)
    if user.get("role") != "admin":
        receivable = payable = None

    counts = {
        "parties": await db.parties.count_documents({}),
        "farmers": await db.parties.count_documents({"roles": "farmer"}),
        "vendors": await db.parties.count_documents({"roles": "vendor"}),
        "customers": await db.parties.count_documents({"roles": "customer"}),
        "products": await db.products.count_documents({}),
        "categories": await db.product_categories.count_documents({}),
        "godowns": await db.godowns.count_documents({}),
    }

    return {
        "categories": cats,
        "counts": counts,
        "receivable": receivable,
        "payable": payable,
        "recent_sales": [ser(d) for d in await db.sales.find({}).sort("created_at", -1).to_list(6)],
        "recent_purchases": [ser(d) for d in await db.purchases.find({}).sort("created_at", -1).to_list(6)],
    }


def season_bounds():
    today = datetime.now(timezone.utc).date()
    y = today.year if today.month >= 11 else today.year - 1
    return y, today


@api.get("/dashboard/seasons")
async def dashboard_seasons(user: dict = Depends(get_current_user)):
    start_year, _ = season_bounds()

    async def totals(coll, y):
        docs = await db[coll].find({"date": {"$gte": f"{y}-11-01", "$lte": f"{y + 1}-10-31"}}).to_list(20000)
        return {
            "count": len(docs),
            "bags": round(sum(num(d.get("bags")) for d in docs), 2),
            "weight": round(sum(num(d.get("weight")) for d in docs), 2),
            "amount": round(sum(num(d.get("amount")) for d in docs), 2),
        }

    out = []
    for y in (start_year, start_year - 1):
        purchase = await totals("purchases", y)
        sale = await totals("sales", y)
        out.append({
            "label": f"{y}-{str(y + 1)[-2:]}", "from": f"{y}-11-01", "to": f"{y + 1}-10-31",
            "purchase": purchase, "sale": sale, "margin": round(sale["amount"] - purchase["amount"], 2),
        })

    current, previous = out
    growth = lambda now, before: None if not before else round(((now - before) / before) * 100, 1)  # noqa: E731
    return {
        "current": current,
        "previous": previous,
        "growth": {
            "purchase_amount": growth(current["purchase"]["amount"], previous["purchase"]["amount"]),
            "sale_amount": growth(current["sale"]["amount"], previous["sale"]["amount"]),
            "margin": growth(current["margin"], previous["margin"]),
            "purchase_bags": growth(current["purchase"]["bags"], previous["purchase"]["bags"]),
        },
    }


@api.get("/dashboard/season-chart")
async def season_chart(user: dict = Depends(get_current_user)):
    start_year, _ = season_bounds()
    months = [(11, start_year), (12, start_year)] + [(m, start_year + 1) for m in range(1, 11)]
    purchases = await db.purchases.find({}).to_list(20000)
    sales = await db.sales.find({}).to_list(20000)

    def bucket(docs, y, m):
        prefix = f"{y}-{m:02d}"
        return round(sum(num(d.get("amount")) for d in docs if str(d.get("date") or "").startswith(prefix)), 2)

    return {
        "season": f"{start_year}-{str(start_year + 1)[-2:]}",
        "months": [
            {
                "month": datetime(y, m, 1).strftime("%b"),
                "purchases": bucket(purchases, y, m),
                "sales": bucket(sales, y, m),
                "prev_purchases": bucket(purchases, y - 1, m),
                "prev_sales": bucket(sales, y - 1, m),
            }
            for m, y in months
        ],
    }


@api.get("/dashboard/low-stock")
async def low_stock(user: dict = Depends(get_current_user)):
    profile = await get_profile()
    threshold = num(profile.get("low_stock_threshold")) or 10
    products = await db.products.find({}).to_list(2000)
    purchases = await db.purchases.find({}).to_list(20000)
    sales = await db.sales.find({}).to_list(20000)
    categories = {str(c["_id"]): c.get("name", "") for c in await db.product_categories.find({}).to_list(200)}

    product_rows = []
    for p in products:
        pid = str(p["_id"])
        pin = sum(num(x.get("bags")) for x in purchases if x.get("product_id") == pid) + num(p.get("opening_qty"))
        pout = sum(num(x.get("bags")) for x in sales if x.get("product_id") == pid)
        balance = round(pin - pout, 2)
        if pin > 0 and balance <= threshold:
            product_rows.append({
                "product_id": pid, "product": p.get("name", ""),
                "category": categories.get(p.get("category_id", ""), "-"),
                "in_bags": round(pin, 2), "balance_bags": balance,
                "state": "out" if balance <= 0 else "low",
            })

    lot_rows = []
    for x in purchases:
        if not x.get("lot_no"):
            continue
        sold = sum(num(s.get("bags")) for s in sales if s.get("lot_no") == x.get("lot_no"))
        balance = round(num(x.get("bags")) - sold, 2)
        if num(x.get("bags")) > 0 and balance <= max(threshold, num(x.get("bags")) * 0.1):
            lot_rows.append({
                "lot_no": x.get("lot_no"), "vehicle_no": x.get("vehicle_no", ""),
                "in_bags": num(x.get("bags")), "balance_bags": balance,
                "state": "out" if balance <= 0 else "low",
            })

    return {"threshold": threshold, "products": product_rows, "lots": lot_rows}


@api.get("/dashboard/reorder")
async def reorder_suggestions(user: dict = Depends(get_current_user)):
    start_year, today = season_bounds()
    season_from = f"{start_year}-11-01"
    months_elapsed = max(1, (today.year - start_year) * 12 + today.month - 11 + 1)
    products = await db.products.find({}).to_list(2000)
    purchases = await db.purchases.find({}).to_list(20000)
    sales = await db.sales.find({}).to_list(20000)
    categories = {str(c["_id"]): c.get("name", "") for c in await db.product_categories.find({}).to_list(200)}

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
        rows.append({
            "product_id": pid, "product": p.get("name", ""),
            "category": categories.get(p.get("category_id", ""), "-"),
            "season_sold_bags": round(season_sold, 2), "avg_monthly_bags": monthly,
            "balance_bags": balance, "cover_months": cover, "suggested_bags": suggested,
            "urgency": "now" if suggested > 0 and (cover is None or cover < 1) else ("soon" if suggested > 0 else "ok"),
        })
    rows.sort(key=lambda r: -r["suggested_bags"])
    return {"season_from": season_from, "months_elapsed": months_elapsed, "rows": rows}


# ---------------------------------------------------------------- invoices & reports
@api.get("/invoices", dependencies=[Depends(require_admin)])
async def invoices(kind: Optional[str] = None, user: dict = Depends(get_current_user)):
    receipts = await db.receipts.find({}).to_list(20000)
    rows = []
    for doc_type, coll in (("sale", "sales"), ("purchase", "purchases")):
        if kind not in (None, doc_type):
            continue
        for d in await db[coll].find({}).sort("date", -1).to_list(5000):
            r = ser(d)
            r["doc_type"] = doc_type
            total = num(r.get("total_amount") or r.get("amount"))
            r["paid_amount"] = txn_paid_amount(r, receipts)
            r["balance_amount"] = round(total - r["paid_amount"], 2)
            rows.append(r)
    rows.sort(key=lambda r: r.get("date") or "", reverse=True)
    return rows


@api.get("/reports/transactions", dependencies=[Depends(require_admin)])
async def report_transactions(
    kind: str = "sales",
    category_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    party_id: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
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


# ---------------------------------------------------------------- statements
@api.post("/ledger/{party_id}/email-statement", dependencies=[Depends(require_admin)])
async def email_statement(party_id: str, user: dict = Depends(require_admin)):
    party = await db.parties.find_one({"_id": oid(party_id)})
    if not party:
        raise HTTPException(status_code=404, detail="Party not found")
    to = (party.get("email") or "").strip()
    if not to or "@" not in to:
        raise HTTPException(status_code=400,
                            detail="This party has no email address. Add one on the Party record first.")
    rows, totals = await ledger_rows(party_id)
    profile = await get_profile()
    email_id = await send_email(
        to=to,
        subject=f"Your account statement from {profile.get('name', 'Potato ERP')}",
        html=statement_html(company_name=profile.get("name", "Potato ERP"),
                            party_name=party.get("name", ""), rows=rows, totals=totals),
    )
    return {"ok": True, "sent_to": to, "email_id": email_id}


# ---------------------------------------------------------------- staff users
@api.get("/users")
async def list_users(user: dict = Depends(require_admin)):
    return [ser(d) for d in await db.users.find({}).sort("created_at", 1).to_list(500)]


@api.post("/users")
async def create_user(payload: dict = Body(...), user: dict = Depends(require_admin)):
    email = str(payload.get("email", "")).strip().lower()
    password = str(payload.get("password", ""))
    role = payload.get("role") or "operator"
    if role not in ("admin", "operator"):
        raise HTTPException(status_code=400, detail="Role must be admin or operator")
    if not email or len(password) < 6:
        raise HTTPException(status_code=400, detail="Email and a password of 6+ characters are required")
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="A user with this email already exists")
    res = await db.users.insert_one({
        "email": email, "name": payload.get("name") or email.split("@")[0], "role": role,
        "password_hash": hash_password(password), "created_at": now_iso(),
    })
    return ser(await db.users.find_one({"_id": res.inserted_id}))


@api.put("/users/{item_id}")
async def update_user(item_id: str, payload: dict = Body(...), user: dict = Depends(require_admin)):
    existing = await db.users.find_one({"_id": oid(item_id)})
    if not existing:
        raise HTTPException(status_code=404, detail="Record not found")
    update = {}
    if payload.get("name"):
        update["name"] = payload["name"]
    if payload.get("role"):
        if payload["role"] not in ("admin", "operator"):
            raise HTTPException(status_code=400, detail="Role must be admin or operator")
        if item_id == user["id"] and payload["role"] != "admin":
            raise HTTPException(status_code=400, detail="You cannot remove your own admin access")
        update["role"] = payload["role"]
    if payload.get("password"):
        if len(str(payload["password"])) < 6:
            raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
        update["password_hash"] = hash_password(str(payload["password"]))
    if update:
        await db.users.update_one({"_id": oid(item_id)}, {"$set": update})
    return ser(await db.users.find_one({"_id": oid(item_id)}))


@api.delete("/users/{item_id}")
async def delete_user(item_id: str, user: dict = Depends(require_admin)):
    if item_id == user["id"]:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")
    res = await db.users.delete_one({"_id": oid(item_id)})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Record not found")
    return {"ok": True}


# ---------------------------------------------------------------- rate stats
@api.get("/rate-stats")
async def rate_stats(kind: str = "sales", product_id: Optional[str] = None,
                     user: dict = Depends(get_current_user)):
    if kind not in ("sales", "purchases"):
        raise HTTPException(status_code=400, detail="kind must be sales or purchases")
    if not product_id:
        return {"count": 0}
    docs = await db[kind].find({"product_id": product_id}).sort("created_at", -1).to_list(20)
    rates = [num(d.get("rate")) for d in docs if num(d.get("rate")) > 0]
    if not rates:
        return {"count": 0}
    return {
        "count": len(rates), "avg_rate": round(sum(rates) / len(rates), 2),
        "min_rate": round(min(rates), 2), "max_rate": round(max(rates), 2), "last_rate": round(rates[0], 2),
    }


# ---------------------------------------------------------------- crons
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


async def finish_run(run_id: str, sent: int, skipped: int, recipients: list):
    await db.cron_runs.update_one(
        {"_id": run_id},
        {"$set": {"finished_at": now_iso(), "sent": sent, "skipped": skipped,
                  "recipients": recipients, "status": "done"}},
    )


async def run_monthly_statements(run_id: str):
    profile = await get_profile()
    sent, skipped, recipients = 0, 0, []
    for p in await db.parties.find({}).to_list(5000):
        email = (p.get("email") or "").strip()
        rows, totals = await ledger_rows(str(p["_id"]))
        if not email or "@" not in email or not rows:
            skipped += 1
            continue
        try:
            await send_email(
                to=email,
                subject=f"Your monthly account statement from {profile.get('name', 'Potato ERP')}",
                html=statement_html(company_name=profile.get("name", "Potato ERP"),
                                    party_name=p.get("name", ""), rows=rows, totals=totals),
            )
            sent += 1
            recipients.append({"name": p.get("name", ""), "email": email, "balance": totals["balance"]})
        except Exception as e:
            logger.error(f"Monthly statement failed for {email}: {e}")
            skipped += 1
    await finish_run(run_id, sent, skipped, recipients)


async def run_balance_reminders(run_id: str):
    profile = await get_profile()
    as_of = now_iso()[:10]
    sent, skipped, recipients = 0, 0, []
    for p in await db.parties.find({}).to_list(5000):
        email = (p.get("email") or "").strip()
        _, totals = await ledger_rows(str(p["_id"]))
        if not email or "@" not in email or totals["balance"] <= 0:
            skipped += 1
            continue
        try:
            await send_email(
                to=email,
                subject=f"Reminder: outstanding balance with {profile.get('name', 'Potato ERP')}",
                html=reminder_html(company_name=profile.get("name", "Potato ERP"),
                                   party_name=p.get("name", ""), balance=totals["balance"], as_of=as_of),
            )
            sent += 1
            recipients.append({"name": p.get("name", ""), "email": email, "balance": totals["balance"]})
        except Exception as e:
            logger.error(f"Reminder failed for {email}: {e}")
            skipped += 1
    await finish_run(run_id, sent, skipped, recipients)


@api.post("/cron/monthly-statements")
async def cron_monthly_statements(request: Request, background: BackgroundTasks):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    run_id = await accept_cron(request, "monthly-statements")
    if run_id is None:
        return {"ok": True, "duplicate": True}
    background.add_task(run_monthly_statements, run_id)
    return {"ok": True, "queued": True, "run_id": run_id}


@api.post("/cron/balance-reminders")
async def cron_balance_reminders(request: Request, background: BackgroundTasks):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    run_id = await accept_cron(request, "balance-reminders")
    if run_id is None:
        return {"ok": True, "duplicate": True}
    background.add_task(run_balance_reminders, run_id)
    return {"ok": True, "queued": True, "run_id": run_id}


@api.get("/cron/runs", dependencies=[Depends(require_admin)])
async def cron_runs(user: dict = Depends(require_admin)):
    docs = await db.cron_runs.find({}).sort("started_at", -1).to_list(50)
    return [
        {
            "run_id": str(d.get("_id")), "job": d.get("job"), "status": d.get("status"),
            "started_at": d.get("started_at"), "finished_at": d.get("finished_at"),
            "sent": d.get("sent"), "skipped": d.get("skipped"), "recipients": d.get("recipients") or [],
        }
        for d in docs
    ]


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

DEFAULT_CATEGORIES = [
    {"name": "Seeds", "unit": "bag", "tracks_lot": False, "gst_default": 5},
    {"name": "Leno Bag", "unit": "piece", "tracks_lot": False, "gst_default": 18},
    {"name": "Potato", "unit": "bag", "tracks_lot": True, "gst_default": 0},
]


@app.on_event("startup")
async def startup():
    await seed_admin()
    await db.users.create_index("email", unique=True)
    await db.ledger.create_index("party_id")
    await db.parties.create_index("roles")
    if await db.product_categories.count_documents({}) == 0:
        for c in DEFAULT_CATEGORIES:
            await db.product_categories.update_one(
                {"name": c["name"]},
                {"$setOnInsert": {**c, "status": "active", "created_at": now_iso()}},
                upsert=True,
            )
    logger.info("ERP backend ready")
