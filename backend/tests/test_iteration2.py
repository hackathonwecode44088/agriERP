"""Iteration 2 backend tests: Company Profile, Receipts, Outstanding, Lots Trace."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

API = f"{BASE_URL}/api"
ADMIN = {"email": "admin@potatoerp.com", "password": "Admin@123"}


@pytest.fixture(scope="module")
def client():
    r = requests.post(f"{API}/auth/login", json=ADMIN)
    assert r.status_code == 200, r.text
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {r.json()['access_token']}",
                      "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def seed(client):
    farmer = client.post(f"{API}/farmers", json={"name": "TEST_IT2_Farmer"}).json()
    company = client.post(f"{API}/companies", json={"name": "TEST_IT2_Company"}).json()
    godown = client.post(f"{API}/godowns", json={"name": "TEST_IT2_Gdn"}).json()
    product = client.post(f"{API}/products", json={"category": "potato", "name": "TEST_IT2_Potato", "unit": "bag"}).json()
    ids = {"farmer": farmer["id"], "company": company["id"], "godown": godown["id"], "product": product["id"],
           "purchases": [], "sales": [], "receipts": []}
    yield ids
    for rid in ids["receipts"]:
        client.delete(f"{API}/receipts/{rid}")
    for sid in ids["sales"]:
        client.delete(f"{API}/sales/{sid}")
    for pid in ids["purchases"]:
        client.delete(f"{API}/purchases/{pid}")
    client.delete(f"{API}/products/{product['id']}")
    client.delete(f"{API}/godowns/{godown['id']}")
    client.delete(f"{API}/companies/{company['id']}")
    client.delete(f"{API}/farmers/{farmer['id']}")


# ---------------- Company Profile ----------------
class TestCompanyProfile:
    def test_get_public(self):
        r = requests.get(f"{API}/company-profile")
        assert r.status_code == 200
        assert "name" in r.json()

    def test_update_requires_auth(self):
        r = requests.put(f"{API}/company-profile", json={"name": "X"})
        assert r.status_code == 401

    def test_update_and_persist(self, client):
        orig = requests.get(f"{API}/company-profile").json()
        new_name = "TEST_IT2 Traders"
        payload = {**orig, "name": new_name, "tagline": "Testing tagline",
                   "about": "About text", "gstin": "24TEST9999Z9"}
        r = client.put(f"{API}/company-profile", json=payload)
        assert r.status_code == 200
        got = requests.get(f"{API}/company-profile").json()
        assert got["name"] == new_name
        assert got["tagline"] == "Testing tagline"
        assert got["gstin"] == "24TEST9999Z9"
        # restore
        client.put(f"{API}/company-profile", json=orig)


# ---------------- Receipts ----------------
class TestReceipts:
    def test_create_received_farmer(self, client, seed):
        r = client.post(f"{API}/receipts", json={
            "date": "2026-01-10", "direction": "received", "party_type": "farmer",
            "party_id": seed["farmer"], "amount": 1500, "payment_mode": "cash",
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["amount"] == 1500
        assert d.get("receipt_no", "").startswith("RCP-")
        seed["receipts"].append(d["id"])
        # ledger CREDIT
        lr = client.get(f"{API}/ledger", params={"farmer_id": seed["farmer"]}).json()
        assert any(e.get("ref_type") == "receipt" and e.get("credit") == 1500 for e in lr["entries"])

    def test_paid_creates_debit(self, client, seed):
        r = client.post(f"{API}/receipts", json={
            "date": "2026-01-10", "direction": "paid", "party_type": "farmer",
            "party_id": seed["farmer"], "amount": 300, "payment_mode": "cash",
        })
        assert r.status_code == 200
        rid = r.json()["id"]
        seed["receipts"].append(rid)
        lr = client.get(f"{API}/ledger", params={"farmer_id": seed["farmer"]}).json()
        assert any(e.get("ref_type") == "receipt" and e.get("debit") == 300 for e in lr["entries"])

    def test_edit_updates_ledger(self, client, seed):
        rid = seed["receipts"][0]  # 1500 received
        r = client.put(f"{API}/receipts/{rid}", json={
            "date": "2026-01-10", "direction": "received", "party_type": "farmer",
            "party_id": seed["farmer"], "amount": 2000, "payment_mode": "cash",
        })
        assert r.status_code == 200
        lr = client.get(f"{API}/ledger", params={"farmer_id": seed["farmer"]}).json()
        m = [e for e in lr["entries"] if e.get("ref_type") == "receipt" and e.get("ref_id") == rid]
        assert len(m) == 1
        assert m[0]["credit"] == 2000

    def test_company_receipt_no_ledger(self, client, seed):
        r = client.post(f"{API}/receipts", json={
            "date": "2026-01-11", "direction": "received", "party_type": "company",
            "party_id": seed["company"], "amount": 500, "payment_mode": "cash",
        })
        assert r.status_code == 200
        seed["receipts"].append(r.json()["id"])

    def test_delete_removes_ledger(self, client, seed):
        rid = seed["receipts"][1]  # paid 300
        r = client.delete(f"{API}/receipts/{rid}")
        assert r.status_code == 200
        seed["receipts"].remove(rid)
        lr = client.get(f"{API}/ledger", params={"farmer_id": seed["farmer"]}).json()
        assert not any(e.get("ref_type") == "receipt" and e.get("ref_id") == rid for e in lr["entries"])


# ---------------- Outstanding ----------------
class TestOutstanding:
    def test_outstanding_shape(self, client, seed):
        r = client.get(f"{API}/outstanding")
        assert r.status_code == 200
        d = r.json()
        assert "farmers" in d and "companies" in d and "totals" in d
        assert "farmer_balance" in d["totals"]
        assert "company_balance" in d["totals"]

    def test_company_billed_minus_received(self, client, seed):
        # Create sale to company
        s = client.post(f"{API}/sales", json={
            "category": "potato", "date": "2026-01-12", "party_type": "company",
            "party_id": seed["company"], "product_id": seed["product"],
            "godown_id": seed["godown"], "lot_no": "LOT-IT2-1",
            "bags": 20, "weight": 500, "rate": 100, "rate_basis": "bag",
        }).json()
        seed["sales"].append(s["id"])
        # Create a company-direction receipt so we can validate billed-received formula
        rc = client.post(f"{API}/receipts", json={
            "date": "2026-01-13", "direction": "received", "party_type": "company",
            "party_id": seed["company"], "amount": 500, "payment_mode": "cash",
        }).json()
        seed["receipts"].append(rc["id"])
        out = client.get(f"{API}/outstanding").json()
        row = next((c for c in out["companies"] if c["party_id"] == seed["company"]), None)
        assert row is not None
        # billed=2000; received depends on prior company receipts in this run (500 + 500)
        assert row["billed"] == 2000
        assert row["balance"] == row["billed"] - row["received"]
        assert row["received"] >= 500


# ---------------- Lot Trace ----------------
class TestLots:
    def test_trace_lot(self, client, seed):
        # Create purchase with lot
        p = client.post(f"{API}/purchases", json={
            "category": "potato", "date": "2026-01-08", "party_type": "farmer",
            "party_id": seed["farmer"], "product_id": seed["product"],
            "godown_id": seed["godown"], "lot_no": "LOT-IT2-TRACE",
            "vehicle_no": "GJ01T1234", "bags": 50, "weight": 1250,
            "rate": 40, "rate_basis": "bag",
        }).json()
        seed["purchases"].append(p["id"])
        # Create sale with same lot
        s = client.post(f"{API}/sales", json={
            "category": "potato", "date": "2026-01-15", "party_type": "company",
            "party_id": seed["company"], "product_id": seed["product"],
            "godown_id": seed["godown"], "lot_no": "LOT-IT2-TRACE",
            "bags": 20, "weight": 500, "rate": 80, "rate_basis": "bag",
        }).json()
        seed["sales"].append(s["id"])
        r = client.get(f"{API}/lots/trace")
        assert r.status_code == 200
        rows = r.json()
        lot = next((x for x in rows if x["lot_no"] == "LOT-IT2-TRACE"), None)
        assert lot is not None
        assert lot["in_bags"] == 50
        assert lot["sold_bags"] == 20
        assert lot["balance_bags"] == 30
        assert lot["purchase_value"] == 2000
        assert lot["sale_value"] == 1600
        assert lot["margin"] == -400
        assert len(lot["sales"]) == 1
        assert lot["sales"][0]["invoice_no"] == s["invoice_no"]
