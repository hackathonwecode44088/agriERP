"""Backend integration tests for Potato Management ERP."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Read from frontend .env if not set
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        pass

API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@potatoerp.com"
ADMIN_PASSWORD = "Admin@123"

CREATED = {"vendors": [], "farmers": [], "companies": [], "godowns": [],
           "products": [], "purchases": [], "sales": [], "credit-notes": [], "ledger": []}


@pytest.fixture(scope="session")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "access_token" in data and data["access_token"]
    return data["access_token"]


@pytest.fixture(scope="session")
def client(token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session", autouse=True)
def cleanup(client):
    yield
    for coll in ("purchases", "sales", "credit-notes", "ledger",
                 "products", "vendors", "farmers", "companies", "godowns"):
        for _id in CREATED.get(coll, []):
            try:
                client.delete(f"{API}/{coll}/{_id}")
            except Exception:
                pass


# ---------------- AUTH ----------------
class TestAuth:
    def test_login_bad_password(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"})
        assert r.status_code == 401

    def test_me_requires_auth(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_me_with_bearer(self, client):
        r = client.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json().get("email") == ADMIN_EMAIL

    def test_all_endpoints_require_auth(self):
        for path in ["/vendors", "/farmers", "/companies", "/godowns", "/products",
                     "/purchases", "/sales", "/credit-notes", "/ledger",
                     "/stock/seeds", "/dashboard/summary", "/reports/transactions", "/invoices"]:
            r = requests.get(f"{API}{path}")
            assert r.status_code == 401, f"{path} did not require auth: {r.status_code}"


# ---------------- COMPANY PROFILE ----------------
class TestCompanyProfile:
    def test_get_profile_public(self):
        r = requests.get(f"{API}/company-profile")
        assert r.status_code == 200
        assert "name" in r.json()


# ---------------- MASTERS CRUD ----------------
class TestMasters:
    def test_vendor_crud(self, client):
        r = client.post(f"{API}/vendors", json={"name": "TEST_Vendor1", "phone": "999", "city": "Deesa"})
        assert r.status_code == 200, r.text
        v = r.json()
        assert v["name"] == "TEST_Vendor1"
        assert v.get("status") == "active"
        assert "id" in v
        vid = v["id"]
        CREATED["vendors"].append(vid)

        r2 = client.get(f"{API}/vendors")
        assert r2.status_code == 200
        assert any(x["id"] == vid for x in r2.json())

        r3 = client.put(f"{API}/vendors/{vid}", json={"name": "TEST_Vendor1U", "status": "closed"})
        assert r3.status_code == 200
        assert r3.json()["name"] == "TEST_Vendor1U"
        assert r3.json()["status"] == "closed"

    def test_farmer_create(self, client):
        r = client.post(f"{API}/farmers", json={"name": "TEST_Farmer1", "phone": "111", "village": "V"})
        assert r.status_code == 200
        CREATED["farmers"].append(r.json()["id"])

    def test_company_create(self, client):
        r = client.post(f"{API}/companies", json={"name": "TEST_Co1"})
        assert r.status_code == 200
        CREATED["companies"].append(r.json()["id"])

    def test_godown_create(self, client):
        r = client.post(f"{API}/godowns", json={"name": "TEST_Gdn1", "capacity_bags": 100})
        assert r.status_code == 200
        CREATED["godowns"].append(r.json()["id"])

    def test_product_category_filter(self, client):
        for cat in ("seeds", "lenobag", "potato"):
            r = client.post(f"{API}/products",
                            json={"category": cat, "name": f"TEST_P_{cat}", "unit": "bag", "opening_qty": 5})
            assert r.status_code == 200
            CREATED["products"].append(r.json()["id"])
        r = client.get(f"{API}/products", params={"category": "seeds"})
        assert r.status_code == 200
        cats = {p.get("category") for p in r.json()}
        assert cats == {"seeds"} or (len(cats) == 1 and "seeds" in cats)

    def test_name_required(self, client):
        r = client.post(f"{API}/vendors", json={"phone": "no name"})
        assert r.status_code == 400


# ---------------- TRANSACTIONS ----------------
class TestTransactions:
    @pytest.fixture(scope="class")
    def parties(self, client):
        v = client.post(f"{API}/vendors", json={"name": "TEST_TxVendor"}).json()
        f = client.post(f"{API}/farmers", json={"name": "TEST_TxFarmer"}).json()
        c = client.post(f"{API}/companies", json={"name": "TEST_TxCompany"}).json()
        g = client.post(f"{API}/godowns", json={"name": "TEST_TxGdn"}).json()
        seeds = client.post(f"{API}/products", json={"category": "seeds", "name": "TEST_Seeds", "unit": "bag"}).json()
        leno = client.post(f"{API}/products", json={"category": "lenobag", "name": "TEST_Leno", "unit": "bag"}).json()
        potato = client.post(f"{API}/products", json={"category": "potato", "name": "TEST_Potato", "unit": "bag"}).json()
        for k, o in [("vendors", v), ("farmers", f), ("companies", c), ("godowns", g)]:
            CREATED[k].append(o["id"])
        for p in (seeds, leno, potato):
            CREATED["products"].append(p["id"])
        return {"vendor": v, "farmer": f, "company": c, "godown": g,
                "seeds": seeds, "leno": leno, "potato": potato}

    def test_purchase_amount_per_bag(self, client, parties):
        payload = {
            "category": "seeds", "date": "2026-01-05", "party_type": "vendor",
            "party_id": parties["vendor"]["id"], "product_id": parties["seeds"]["id"],
            "godown_id": parties["godown"]["id"], "bags": 10, "weight": 500,
            "rate": 100, "rate_basis": "bag", "payment_type": "cash",
        }
        r = client.post(f"{API}/purchases", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["amount"] == 1000
        assert d.get("invoice_no", "").startswith("PUR-")
        CREATED["purchases"].append(d["id"])

    def test_purchase_amount_per_weight(self, client, parties):
        payload = {
            "category": "potato", "date": "2026-01-06", "party_type": "farmer",
            "party_id": parties["farmer"]["id"], "product_id": parties["potato"]["id"],
            "godown_id": parties["godown"]["id"],
            "lot_no": "LOT-TEST-01", "vehicle_no": "GJ01AB1234",
            "bags": 20, "weight": 500, "rate": 15, "rate_basis": "weight",
            "payment_type": "credit",
        }
        r = client.post(f"{API}/purchases", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["amount"] == 7500
        CREATED["purchases"].append(d["id"])
        # ledger credit auto-created for farmer
        lr = client.get(f"{API}/ledger", params={"farmer_id": parties["farmer"]["id"]})
        assert lr.status_code == 200
        entries = lr.json()["entries"]
        assert any(e.get("ref_type") == "purchase" and e.get("credit") == 7500 for e in entries)

    def test_sale_to_farmer_creates_debit(self, client, parties):
        payload = {
            "category": "seeds", "date": "2026-01-07", "party_type": "farmer",
            "party_id": parties["farmer"]["id"], "product_id": parties["seeds"]["id"],
            "godown_id": parties["godown"]["id"], "bags": 5, "rate": 200,
            "rate_basis": "bag", "payment_mode": "cash",
        }
        r = client.post(f"{API}/sales", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["amount"] == 1000
        CREATED["sales"].append(d["id"])
        lr = client.get(f"{API}/ledger", params={"farmer_id": parties["farmer"]["id"]}).json()
        assert any(e.get("ref_type") == "sale" and e.get("debit") == 1000 for e in lr["entries"])

    def test_ledger_auto_entry_not_deletable(self, client, parties):
        lr = client.get(f"{API}/ledger", params={"farmer_id": parties["farmer"]["id"]}).json()
        auto = next((e for e in lr["entries"] if e.get("ref_type") in ("sale", "purchase")), None)
        assert auto is not None
        r = client.delete(f"{API}/ledger/{auto['id']}")
        assert r.status_code == 400

    def test_ledger_manual_add_and_delete(self, client, parties):
        r = client.post(f"{API}/ledger", json={
            "farmer_id": parties["farmer"]["id"], "date": "2026-01-08",
            "particulars": "TEST manual payment", "credit": 500, "debit": 0,
        })
        assert r.status_code == 200
        eid = r.json()["id"]
        r2 = client.delete(f"{API}/ledger/{eid}")
        assert r2.status_code == 200

    def test_credit_note_creates_credit(self, client, parties):
        r = client.post(f"{API}/credit-notes", json={
            "date": "2026-01-09", "party_type": "farmer",
            "party_id": parties["farmer"]["id"], "amount": 200,
            "reason": "TEST", "category": "seeds",
        })
        assert r.status_code == 200, r.text
        cn = r.json()
        CREATED["credit-notes"].append(cn["id"])
        assert cn["amount"] == 200
        assert cn.get("note_no", "").startswith("CN-")
        lr = client.get(f"{API}/ledger", params={"farmer_id": parties["farmer"]["id"]}).json()
        assert any(e.get("ref_type") == "credit_note" and e.get("credit") == 200 for e in lr["entries"])
        # delete CN removes ledger
        client.delete(f"{API}/credit-notes/{cn['id']}")
        CREATED["credit-notes"].remove(cn["id"])
        lr2 = client.get(f"{API}/ledger", params={"farmer_id": parties["farmer"]["id"]}).json()
        assert not any(e.get("ref_type") == "credit_note" and e.get("id") == cn["id"] for e in lr2["entries"])

    def test_ledger_balance_running(self, client, parties):
        lr = client.get(f"{API}/ledger", params={"farmer_id": parties["farmer"]["id"]}).json()
        entries = lr["entries"]
        expected = 0
        for e in entries:
            expected = round(expected + float(e.get("debit") or 0) - float(e.get("credit") or 0), 2)
            assert e["balance"] == expected
        assert lr["totals"]["balance"] == expected

    def test_stock_computation(self, client, parties):
        r = client.get(f"{API}/stock/seeds")
        assert r.status_code == 200
        data = r.json()
        row = next((p for p in data["products"] if p["product_id"] == parties["seeds"]["id"]), None)
        assert row is not None
        # purchased 10, sold 5, opening 0 -> in=10, out=5, balance=5
        assert row["in_bags"] == 10
        assert row["out_bags"] == 5
        assert row["balance_bags"] == 5

    def test_stock_potato_lots(self, client, parties):
        r = client.get(f"{API}/stock/potato").json()
        lots = r["lots"]
        assert any(l["lot_no"] == "LOT-TEST-01" for l in lots)

    def test_stock_invalid_category(self, client):
        r = client.get(f"{API}/stock/invalid")
        assert r.status_code == 400


# ---------------- REPORTS / DASHBOARD / INVOICES ----------------
class TestReports:
    def test_dashboard(self, client):
        r = client.get(f"{API}/dashboard/summary")
        assert r.status_code == 200
        d = r.json()
        for k in ("categories", "counts", "farmer_balance", "recent_sales", "recent_purchases"):
            assert k in d

    def test_report_transactions(self, client):
        r = client.get(f"{API}/reports/transactions", params={"kind": "sales", "category": "seeds"})
        assert r.status_code == 200
        assert "rows" in r.json() and "totals" in r.json()

    def test_report_invalid_kind(self, client):
        r = client.get(f"{API}/reports/transactions", params={"kind": "nope"})
        assert r.status_code == 400

    def test_invoices_filter(self, client):
        r = client.get(f"{API}/invoices")
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        types = {row["doc_type"] for row in rows}
        # sales & purchases should be present if any exist
        r2 = client.get(f"{API}/invoices", params={"kind": "sale"}).json()
        assert all(row["doc_type"] == "sale" for row in r2)
