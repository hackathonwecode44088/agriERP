"""Backend tests: Debit Notes CRUD + ledger sync + purchase/sale + lot data (INV-00001 / PUR-00003)."""
import os
import time
import pytest
import requests

def _load_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v.rstrip("/")
    for line in open("/app/frontend/.env"):
        if line.startswith("REACT_APP_BACKEND_URL="):
            return line.split("=", 1)[1].strip().rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL missing")

BASE_URL = _load_url()
EMAIL = "merge_test_1788760554@demo.com"
PASSWORD = "Owner@123"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert r.status_code == 200, r.text
    data = r.json()
    token = data.get("access_token") or data.get("token")
    # Pick first company
    companies = s.get(f"{BASE_URL}/api/companies", headers={"Authorization": f"Bearer {token}"}).json()
    cid = companies[0]["id"] if companies else ""
    s.headers.update({"Authorization": f"Bearer {token}", "X-Company-Id": cid, "Content-Type": "application/json"})
    return s


def test_list_debit_notes(client):
    r = client.get(f"{BASE_URL}/api/debit-notes")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_create_edit_delete_debit_note_and_ledger(client):
    parties = client.get(f"{BASE_URL}/api/parties").json()
    party = next((p for p in parties if p.get("name") == "Ramesh Traders"), parties[0])
    pid = party["id"]

    # ledger before
    before = client.get(f"{BASE_URL}/api/ledger", params={"party_id": pid}).json()
    before_debit = before.get("totals", {}).get("debit", 0)

    payload = {"date": "2026-01-05", "party_id": pid, "against_invoice": "INV-TEST", "amount": 321, "reason": "TEST_pytest"}
    r = client.post(f"{BASE_URL}/api/debit-notes", json=payload)
    assert r.status_code == 200, r.text
    dn = r.json()
    assert dn.get("note_no", "").startswith("DN-")
    assert float(dn["amount"]) == 321
    dn_id = dn["id"]

    # ledger reflects debit
    after = client.get(f"{BASE_URL}/api/ledger", params={"party_id": pid}).json()
    assert round(after["totals"]["debit"] - before_debit, 2) == 321
    # find row
    assert any(e.get("ref_type") == "debit_note" and float(e.get("debit", 0)) == 321 for e in after["entries"])

    # edit
    r = client.put(f"{BASE_URL}/api/debit-notes/{dn_id}", json={**payload, "amount": 400})
    assert r.status_code == 200
    assert float(r.json()["amount"]) == 400

    after2 = client.get(f"{BASE_URL}/api/ledger", params={"party_id": pid}).json()
    assert round(after2["totals"]["debit"] - before_debit, 2) == 400

    # delete
    r = client.delete(f"{BASE_URL}/api/debit-notes/{dn_id}")
    assert r.status_code in (200, 204)
    final = client.get(f"{BASE_URL}/api/ledger", params={"party_id": pid}).json()
    assert round(final["totals"]["debit"] - before_debit, 2) == 0


def test_invoice_records_carry_lot(client):
    docs = client.get(f"{BASE_URL}/api/invoices").json() if False else None
    # Use purchases / sales endpoints
    purchases = client.get(f"{BASE_URL}/api/purchases").json()
    sales = client.get(f"{BASE_URL}/api/sales").json()
    pur = next((p for p in purchases if p.get("invoice_no") == "PUR-00003"), None)
    sale = next((s for s in sales if s.get("invoice_no") == "INV-00001"), None)
    assert pur is not None, "PUR-00003 missing"
    assert sale is not None, "INV-00001 missing"
    assert pur.get("lot_no") == "LOTX-1"
    assert sale.get("lot_no") == "LOTX-1"
