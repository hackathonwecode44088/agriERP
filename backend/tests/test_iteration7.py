"""Iteration 7 backend tests - unified parties/categories/products model."""
import os
import time
import uuid
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@potatoerp.com", "password": "Admin@123"}
OPERATOR = {"email": "operator@potatoerp.com", "password": "Operator@123"}
CRON_SECRET = "c47f19ab8e2d4a6f95b70c3e18d52af6b9134e7c0a8d6f2b5e91c34a7d08fb62"
TEST_EMAIL = "delivered@resend.dev"


# --------- fixtures ---------
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def admin(admin_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {admin_token}"})
    return s


@pytest.fixture(scope="session")
def operator_token(admin):
    # Ensure operator exists (create if missing)
    r = admin.get(f"{API}/users")
    if r.status_code == 200 and not any(u.get("email") == OPERATOR["email"] for u in r.json()):
        admin.post(f"{API}/users", json={**OPERATOR, "role": "operator", "name": "Operator"})
    r = requests.post(f"{API}/auth/login", json=OPERATOR, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def operator(operator_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {operator_token}"})
    return s


@pytest.fixture(scope="session")
def seed_category(admin):
    """Get/create a lot-tracking category for testing."""
    cats = admin.get(f"{API}/product-categories").json()
    potato = next((c for c in cats if c.get("name") == "Potato"), None)
    assert potato, "Potato seed category missing"
    return potato


@pytest.fixture(scope="session")
def seed_product(admin, seed_category):
    """Get/create a test product."""
    prods = admin.get(f"{API}/products", params={"category_id": seed_category["id"]}).json()
    if prods:
        return prods[0]
    r = admin.post(f"{API}/products", json={
        "name": "TEST_Potato_Prod", "category_id": seed_category["id"],
        "unit": "bag", "opening_qty": 0,
    })
    assert r.status_code == 200, r.text
    return r.json()


# --------- auth ---------
class TestAuth:
    def test_admin_login(self):
        r = requests.post(f"{API}/auth/login", json=ADMIN)
        assert r.status_code == 200
        assert "access_token" in r.json()
        assert r.json()["user"]["role"] == "admin"

    def test_login_bad(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN["email"], "password": "wrong"})
        assert r.status_code == 401

    def test_me(self, admin):
        r = admin.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN["email"]


# --------- categories seeded ---------
class TestCategories:
    def test_seeded_defaults(self, admin):
        r = admin.get(f"{API}/product-categories")
        assert r.status_code == 200
        names = {c["name"] for c in r.json()}
        assert {"Seeds", "Leno Bag", "Potato"}.issubset(names)

    def test_create_edit_delete_new_category(self, admin):
        name = f"TEST_Onion_{uuid.uuid4().hex[:6]}"
        r = admin.post(f"{API}/product-categories", json={
            "name": name, "unit": "bag", "tracks_lot": True, "gst_default": 5,
        })
        assert r.status_code == 200, r.text
        cid = r.json()["id"]
        assert r.json()["tracks_lot"] is True

        r = admin.put(f"{API}/product-categories/{cid}", json={"gst_default": 12})
        assert r.status_code == 200
        assert r.json()["gst_default"] == 12

        r = admin.delete(f"{API}/product-categories/{cid}")
        assert r.status_code == 200

    def test_delete_category_with_products_blocked(self, admin, seed_category, seed_product):
        r = admin.delete(f"{API}/product-categories/{seed_category['id']}")
        assert r.status_code == 400
        assert "products" in r.json()["detail"].lower()


# --------- parties ---------
class TestParties:
    def test_create_multirole_party(self, admin):
        r = admin.post(f"{API}/parties", json={
            "name": f"TEST_Dual_{uuid.uuid4().hex[:6]}",
            "roles": ["farmer", "vendor"],
            "email": TEST_EMAIL,
        })
        assert r.status_code == 200, r.text
        assert set(r.json()["roles"]) == {"farmer", "vendor"}
        # cleanup
        admin.delete(f"{API}/parties/{r.json()['id']}")

    def test_create_no_role_400(self, admin):
        r = admin.post(f"{API}/parties", json={"name": "TEST_NoRole", "roles": []})
        assert r.status_code == 400
        assert "role" in r.json()["detail"].lower()

    def test_role_filter(self, admin):
        # ensure a farmer exists
        r = admin.post(f"{API}/parties", json={"name": "TEST_FarmerOnly", "roles": ["farmer"]})
        pid = r.json()["id"]
        r = admin.get(f"{API}/parties", params={"role": "farmer"})
        assert r.status_code == 200
        assert all("farmer" in p["roles"] for p in r.json())
        admin.delete(f"{API}/parties/{pid}")

    def test_update_and_status(self, admin):
        r = admin.post(f"{API}/parties", json={"name": "TEST_Toggle", "roles": ["customer"]})
        pid = r.json()["id"]
        r = admin.put(f"{API}/parties/{pid}", json={"status": "closed"})
        assert r.status_code == 200
        assert r.json()["status"] == "closed"
        admin.delete(f"{API}/parties/{pid}")


# --------- products ---------
class TestProducts:
    def test_product_needs_category(self, admin):
        r = admin.post(f"{API}/products", json={"name": "TEST_NoCat"})
        assert r.status_code == 400

    def test_product_filter(self, admin, seed_category, seed_product):
        r = admin.get(f"{API}/products", params={"category_id": seed_category["id"]})
        assert r.status_code == 200
        assert all(p["category_id"] == seed_category["id"] for p in r.json())


# --------- purchase + sale for one party -> ledger ---------
@pytest.fixture(scope="class")
def dual_party_flow(admin, seed_category, seed_product):
    """Create a dual party, do purchase then sale, return context."""
    r = admin.post(f"{API}/parties", json={
        "name": f"TEST_DualLedger_{uuid.uuid4().hex[:6]}",
        "roles": ["farmer", "vendor", "customer"],
        "email": TEST_EMAIL,
    })
    party = r.json()
    pid = party["id"]

    # Purchase 100 bags at 12 = 1200
    p = admin.post(f"{API}/purchases", json={
        "date": "2025-11-05",
        "category_id": seed_category["id"],
        "party_id": pid,
        "product_id": seed_product["id"],
        "lot_no": f"LT-{uuid.uuid4().hex[:4]}",
        "bags": 100, "rate": 12, "gst_rate": 0,
        "payment_status": "unpaid",
    })
    assert p.status_code == 200, p.text
    purchase = p.json()

    # Sale 60 bags at 14 = 840
    s = admin.post(f"{API}/sales", json={
        "date": "2025-11-06",
        "category_id": seed_category["id"],
        "party_id": pid,
        "product_id": seed_product["id"],
        "lot_no": purchase["lot_no"],
        "bags": 60, "rate": 14, "gst_rate": 0,
        "payment_status": "unpaid",
    })
    assert s.status_code == 200, s.text
    sale = s.json()

    yield {"party_id": pid, "purchase": purchase, "sale": sale, "category_id": seed_category["id"],
           "product_id": seed_product["id"]}

    # cleanup
    admin.delete(f"{API}/sales/{sale['id']}")
    admin.delete(f"{API}/purchases/{purchase['id']}")
    admin.delete(f"{API}/parties/{pid}")


class TestDualPartyLedger:
    def test_ledger_balance(self, admin, dual_party_flow):
        pid = dual_party_flow["party_id"]
        r = admin.get(f"{API}/ledger", params={"party_id": pid})
        assert r.status_code == 200
        data = r.json()
        totals = data["totals"]
        # purchase 1200 credit, sale 840 debit -> balance = 840 - 1200 = -360
        assert totals["credit"] == 1200
        assert totals["debit"] == 840
        assert totals["balance"] == -360

    def test_oversell_rejected(self, admin, dual_party_flow):
        # only 40 bags left (100 - 60)
        r = admin.post(f"{API}/sales", json={
            "date": "2025-11-07",
            "category_id": dual_party_flow["category_id"],
            "party_id": dual_party_flow["party_id"],
            "product_id": dual_party_flow["product_id"],
            "bags": 200, "rate": 14, "gst_rate": 0,
        })
        assert r.status_code == 400
        assert "stock" in r.json()["detail"].lower() or "bag" in r.json()["detail"].lower()

    def test_outstanding_universal(self, admin, dual_party_flow):
        r = admin.get(f"{API}/outstanding")
        assert r.status_code == 200
        data = r.json()
        assert "receivable" in data["totals"]
        assert "payable" in data["totals"]
        assert "net" in data["totals"]
        # our party should show -360 payable
        my = next((p for p in data["parties"] if p["party_id"] == dual_party_flow["party_id"]), None)
        assert my is not None
        assert my["balance"] == -360

    def test_ledger_manual_add_and_auto_protected(self, admin, dual_party_flow):
        pid = dual_party_flow["party_id"]
        # manual add
        r = admin.post(f"{API}/ledger", json={
            "party_id": pid, "date": "2025-11-10",
            "particulars": "Manual adj", "debit": 100, "credit": 0,
        })
        assert r.status_code == 200
        manual_id = r.json()["id"]
        # delete manual OK
        r = admin.delete(f"{API}/ledger/{manual_id}")
        assert r.status_code == 200

        # find an auto entry
        entries = admin.get(f"{API}/ledger", params={"party_id": pid}).json()["entries"]
        auto = next(e for e in entries if e.get("ref_type") in ("purchase", "sale"))
        r = admin.delete(f"{API}/ledger/{auto['id']}")
        assert r.status_code == 400

    def test_ledger_no_party_400(self, admin, dual_party_flow):
        r = admin.post(f"{API}/ledger", json={"particulars": "no party", "debit": 10})
        assert r.status_code == 400


# --------- payments on purchase & sale ---------
class TestPayments:
    def test_sale_payment(self, admin, dual_party_flow):
        sale_id = dual_party_flow["sale"]["id"]
        r = admin.post(f"{API}/sales/{sale_id}/payments", json={
            "amount": 400, "payment_mode": "cash"
        })
        assert r.status_code == 200, r.text
        assert r.json()["payment_status"] == "partial"
        assert r.json()["paid_amount"] == 400
        assert r.json()["balance"] == 440

    def test_sale_payment_over_400(self, admin, dual_party_flow):
        sale_id = dual_party_flow["sale"]["id"]
        r = admin.post(f"{API}/sales/{sale_id}/payments", json={"amount": 999999})
        assert r.status_code == 400

    def test_purchase_payment(self, admin, dual_party_flow):
        pur_id = dual_party_flow["purchase"]["id"]
        r = admin.post(f"{API}/purchases/{pur_id}/payments", json={
            "amount": 500, "payment_mode": "cash"
        })
        assert r.status_code == 200, r.text
        assert r.json()["payment_status"] == "partial"


# --------- stock & lots ---------
class TestStockLots:
    def test_stock_by_category(self, admin, seed_category):
        r = admin.get(f"{API}/stock", params={"category_id": seed_category["id"]})
        assert r.status_code == 200
        data = r.json()
        assert "products" in data and "godowns" in data and "lots" in data

    def test_lot_trace(self, admin, seed_category):
        r = admin.get(f"{API}/lots/trace", params={"category_id": seed_category["id"]})
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        # verify supplier/buyer naming
        if r.json():
            row = r.json()[0]
            assert "supplier" in row
            if row.get("sales"):
                assert "buyer" in row["sales"][0]


# --------- dashboard ---------
class TestDashboard:
    def test_summary(self, admin):
        r = admin.get(f"{API}/dashboard/summary")
        assert r.status_code == 200
        data = r.json()
        assert "categories" in data and "counts" in data
        assert "parties" in data["counts"] and "products" in data["counts"]
        assert data["receivable"] is not None  # admin sees numbers

    def test_summary_operator_hides_money(self, operator):
        r = operator.get(f"{API}/dashboard/summary")
        assert r.status_code == 200
        assert r.json()["receivable"] is None
        assert r.json()["payable"] is None

    def test_seasons(self, admin):
        r = admin.get(f"{API}/dashboard/seasons")
        assert r.status_code == 200
        assert "current" in r.json() and "previous" in r.json()

    def test_season_chart(self, admin):
        r = admin.get(f"{API}/dashboard/season-chart")
        assert r.status_code == 200
        assert len(r.json()["months"]) == 12

    def test_low_stock(self, admin):
        r = admin.get(f"{API}/dashboard/low-stock")
        assert r.status_code == 200

    def test_reorder(self, admin):
        r = admin.get(f"{API}/dashboard/reorder")
        assert r.status_code == 200


# --------- role restrictions ---------
class TestOperatorRoles:
    ALLOWED = ["parties", "product-categories", "products", "godowns", "purchases", "sales"]
    BLOCKED = ["ledger", "receipts", "credit-notes", "invoices", "cron/runs"]

    def test_allowed(self, operator):
        for ep in self.ALLOWED:
            r = operator.get(f"{API}/{ep}")
            assert r.status_code == 200, f"{ep}: {r.status_code} {r.text}"

    def test_blocked(self, operator):
        for ep in self.BLOCKED:
            r = operator.get(f"{API}/{ep}")
            assert r.status_code == 403, f"{ep}: {r.status_code}"

    def test_blocked_reports_and_outstanding(self, operator):
        assert operator.get(f"{API}/reports/transactions").status_code == 403
        assert operator.get(f"{API}/outstanding").status_code == 403
        assert operator.get(f"{API}/users").status_code == 403

    def test_operator_stock_lots_ok(self, operator):
        assert operator.get(f"{API}/stock").status_code == 200
        assert operator.get(f"{API}/lots/trace").status_code == 200

    def test_operator_put_company_profile_403(self, operator):
        r = operator.put(f"{API}/company-profile", json={"name": "x"})
        assert r.status_code == 403


# --------- old endpoints must be 404 ---------
class TestObsoleteEndpoints:
    def test_farmers_404(self, admin):
        assert admin.get(f"{API}/farmers").status_code == 404

    def test_vendors_404(self, admin):
        assert admin.get(f"{API}/vendors").status_code == 404

    def test_companies_404(self, admin):
        assert admin.get(f"{API}/companies").status_code == 404


# --------- reports & invoices ---------
class TestReportsInvoices:
    def test_invoices(self, admin):
        r = admin.get(f"{API}/invoices")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_reports_transactions(self, admin, seed_category):
        r = admin.get(f"{API}/reports/transactions",
                      params={"kind": "sales", "category_id": seed_category["id"]})
        assert r.status_code == 200
        assert "rows" in r.json() and "totals" in r.json()


# --------- crons ---------
class TestCrons:
    def test_cron_requires_auth(self):
        r = requests.post(f"{API}/cron/monthly-statements", json={})
        assert r.status_code == 401

    def test_cron_monthly_and_idempotent(self):
        rid = f"test-monthly-{uuid.uuid4().hex[:8]}"
        headers = {"Authorization": f"Bearer {CRON_SECRET}", "X-Webhook-Id": rid,
                   "Content-Type": "application/json"}
        r1 = requests.post(f"{API}/cron/monthly-statements", json={}, headers=headers)
        assert r1.status_code == 200
        assert r1.json().get("queued") is True
        r2 = requests.post(f"{API}/cron/monthly-statements", json={}, headers=headers)
        assert r2.status_code == 200
        assert r2.json().get("duplicate") is True

    def test_cron_balance_reminders_idempotent(self):
        rid = f"test-balance-{uuid.uuid4().hex[:8]}"
        headers = {"Authorization": f"Bearer {CRON_SECRET}", "X-Webhook-Id": rid,
                   "Content-Type": "application/json"}
        r1 = requests.post(f"{API}/cron/balance-reminders", json={}, headers=headers)
        assert r1.status_code == 200
        r2 = requests.post(f"{API}/cron/balance-reminders", json={}, headers=headers)
        assert r2.json().get("duplicate") is True

    def test_cron_runs_listed(self, admin):
        time.sleep(3)
        r = admin.get(f"{API}/cron/runs")
        assert r.status_code == 200
        assert isinstance(r.json(), list)
