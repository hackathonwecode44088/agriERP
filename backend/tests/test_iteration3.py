"""Iteration 3 backend tests: GST breakup, staff logins, operator role restrictions, rate stats."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://business-process-erp.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@potatoerp.com", "password": "Admin@123"}
OPERATOR = {"email": "operator@potatoerp.com", "password": "Operator@123"}


def _login(session, creds):
    r = session.post(f"{API}/auth/login", json=creds)
    assert r.status_code == 200, f"login failed for {creds['email']}: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    tok = _login(s, ADMIN)
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def operator_session(admin_session):
    # Ensure operator exists
    users = admin_session.get(f"{API}/users").json()
    if not any(u.get("email") == OPERATOR["email"] for u in users):
        admin_session.post(f"{API}/users", json={
            "email": OPERATOR["email"], "password": OPERATOR["password"],
            "role": "operator", "name": "Operator"
        })
    s = requests.Session()
    tok = _login(s, OPERATOR)
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    return s


# ---------------- GST breakup on sales ----------------
class TestGST:
    def test_sale_with_gst_18(self, admin_session):
        farmers = admin_session.get(f"{API}/farmers").json()
        products = admin_session.get(f"{API}/products").json()
        assert farmers and products
        seed = next((p for p in products if p.get("category") == "seeds"), products[0])
        payload = {
            "category": "seeds", "date": "2026-01-15",
            "party_type": "farmer", "party_id": farmers[0]["id"],
            "product_id": seed["id"], "bags": 10, "weight": 500,
            "rate": 100, "rate_basis": "bag", "gst_rate": 18,
            "payment_type": "credit",
        }
        r = admin_session.post(f"{API}/sales", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["amount"] == 1000
        assert d["gst_rate"] == 18
        assert d["cgst"] == 90.0
        assert d["sgst"] == 90.0
        assert d["total_amount"] == 1180.0
        # cleanup
        admin_session.delete(f"{API}/sales/{d['id']}")

    def test_sale_with_gst_zero(self, admin_session):
        farmers = admin_session.get(f"{API}/farmers").json()
        products = admin_session.get(f"{API}/products").json()
        seed = next((p for p in products if p.get("category") == "seeds"), products[0])
        payload = {
            "category": "seeds", "date": "2026-01-15",
            "party_type": "farmer", "party_id": farmers[0]["id"],
            "product_id": seed["id"], "bags": 5, "weight": 250,
            "rate": 100, "rate_basis": "bag", "gst_rate": 0,
        }
        r = admin_session.post(f"{API}/sales", json=payload)
        assert r.status_code == 200
        d = r.json()
        assert d["cgst"] == 0
        assert d["sgst"] == 0
        assert d["total_amount"] == d["amount"] == 500.0
        admin_session.delete(f"{API}/sales/{d['id']}")


# ---------------- Rate stats ----------------
class TestRateStats:
    def test_rate_stats_returns_stats(self, admin_session):
        products = admin_session.get(f"{API}/products").json()
        farmers = admin_session.get(f"{API}/farmers").json()
        seed = next((p for p in products if p.get("category") == "seeds"), products[0])
        # ensure at least a couple sales exist
        for rate in (100, 105, 95):
            admin_session.post(f"{API}/sales", json={
                "category": "seeds", "date": "2026-01-15",
                "party_type": "farmer", "party_id": farmers[0]["id"],
                "product_id": seed["id"], "bags": 5, "rate": rate, "rate_basis": "bag",
                "gst_rate": 0,
            })
        r = admin_session.get(f"{API}/rate-stats", params={"kind": "sales", "product_id": seed["id"]})
        assert r.status_code == 200
        d = r.json()
        assert d["count"] >= 3
        assert "avg_rate" in d and "min_rate" in d and "max_rate" in d

    def test_rate_stats_empty(self, admin_session):
        r = admin_session.get(f"{API}/rate-stats", params={"kind": "sales", "product_id": "000000000000000000000000"})
        assert r.status_code == 200
        assert r.json()["count"] == 0

    def test_rate_stats_invalid_kind(self, admin_session):
        r = admin_session.get(f"{API}/rate-stats", params={"kind": "bogus", "product_id": "x"})
        assert r.status_code == 400


# ---------------- Staff users ----------------
class TestUsers:
    def test_duplicate_email_rejected(self, admin_session):
        r = admin_session.post(f"{API}/users", json={
            "email": OPERATOR["email"], "password": "Whatever1", "role": "operator", "name": "Dup"
        })
        assert r.status_code == 400
        assert "exists" in r.text.lower()

    def test_short_password_rejected(self, admin_session):
        r = admin_session.post(f"{API}/users", json={
            "email": "TEST_short@x.com", "password": "abc", "role": "operator", "name": "S"
        })
        assert r.status_code == 400

    def test_invalid_role_rejected(self, admin_session):
        r = admin_session.post(f"{API}/users", json={
            "email": "TEST_role@x.com", "password": "abcdef", "role": "manager", "name": "R"
        })
        assert r.status_code == 400

    def test_create_edit_reset_password_and_self_delete_guard(self, admin_session):
        email = f"TEST_it3_{int(time.time())}@x.com"
        r = admin_session.post(f"{API}/users", json={
            "email": email, "password": "abcdef", "role": "operator", "name": "Temp"
        })
        assert r.status_code == 200
        uid = r.json()["id"]

        # Edit role
        r2 = admin_session.put(f"{API}/users/{uid}", json={"role": "admin"})
        assert r2.status_code == 200
        assert r2.json()["role"] == "admin"

        # Reset password
        r3 = admin_session.put(f"{API}/users/{uid}", json={"password": "newpass1"})
        assert r3.status_code == 200
        # login with new password
        s = requests.Session()
        login = s.post(f"{API}/auth/login", json={"email": email, "password": "newpass1"})
        assert login.status_code == 200

        # Self-delete guard: admin cannot delete self
        me = admin_session.get(f"{API}/auth/me").json()
        r4 = admin_session.delete(f"{API}/users/{me['id']}")
        assert r4.status_code == 400

        # Cleanup
        admin_session.delete(f"{API}/users/{uid}")


# ---------------- Operator role restrictions ----------------
class TestOperatorPermissions:
    FORBIDDEN_GETS = [
        "/ledger", "/receipts", "/credit-notes", "/invoices",
        "/reports/transactions", "/outstanding", "/users",
    ]
    ALLOWED_GETS = [
        "/vendors", "/farmers", "/products", "/purchases", "/sales",
        "/stock/seeds", "/stock/lenobag", "/stock/potato",
        "/lots/trace", "/dashboard/summary",
    ]

    @pytest.mark.parametrize("path", FORBIDDEN_GETS)
    def test_forbidden_gets(self, operator_session, path):
        r = operator_session.get(f"{API}{path}")
        assert r.status_code == 403, f"{path}: expected 403 got {r.status_code}"

    @pytest.mark.parametrize("path", ALLOWED_GETS)
    def test_allowed_gets(self, operator_session, path):
        r = operator_session.get(f"{API}{path}")
        assert r.status_code == 200, f"{path}: expected 200 got {r.status_code}"

    def test_put_company_profile_forbidden(self, operator_session):
        r = operator_session.put(f"{API}/company-profile", json={"name": "X"})
        assert r.status_code == 403

    def test_dashboard_hides_farmer_balance(self, operator_session):
        r = operator_session.get(f"{API}/dashboard/summary")
        assert r.status_code == 200
        assert r.json().get("farmer_balance") is None

    def test_operator_can_do_entry_work(self, operator_session):
        # create farmer
        fname = f"TEST_IT3_Farmer_{int(time.time())}"
        rf = operator_session.post(f"{API}/farmers", json={"name": fname, "phone": "1"})
        assert rf.status_code == 200
        fid = rf.json()["id"]
        # create product
        pname = f"TEST_IT3_Prod_{int(time.time())}"
        rp = operator_session.post(f"{API}/products", json={"category": "seeds", "name": pname, "unit": "bag"})
        assert rp.status_code == 200
        pid = rp.json()["id"]
        # purchase
        rpur = operator_session.post(f"{API}/purchases", json={
            "category": "seeds", "date": "2026-01-15", "party_type": "farmer", "party_id": fid,
            "product_id": pid, "bags": 5, "rate": 90, "rate_basis": "bag",
        })
        assert rpur.status_code == 200
        # sale
        rsale = operator_session.post(f"{API}/sales", json={
            "category": "seeds", "date": "2026-01-15", "party_type": "farmer", "party_id": fid,
            "product_id": pid, "bags": 3, "rate": 110, "rate_basis": "bag", "gst_rate": 18,
        })
        assert rsale.status_code == 200
        # cleanup
        operator_session.delete(f"{API}/sales/{rsale.json()['id']}")
        operator_session.delete(f"{API}/purchases/{rpur.json()['id']}")
        operator_session.delete(f"{API}/products/{pid}")
        operator_session.delete(f"{API}/farmers/{fid}")
