"""Multi-tenant SaaS backend tests (iteration 8)."""
import os
import uuid
import time

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://business-process-erp.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

SUPER_EMAIL = "platform@potatoerp.com"
SUPER_PASSWORD = "Platform@123"


def _uniq(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:8]}"


# -------------------------------------------- helpers / fixtures
def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    return r


def _signup(workspace, company, name, email, password, phone="9999999999"):
    return requests.post(f"{API}/auth/signup", json={
        "workspace_name": workspace, "company_name": company, "phone": phone,
        "name": name, "email": email, "password": password,
    }, timeout=20)


def _hdr(token, company_id=None):
    h = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    if company_id:
        h["X-Company-Id"] = company_id
    return h


@pytest.fixture(scope="module")
def superadmin_token():
    r = _login(SUPER_EMAIL, SUPER_PASSWORD)
    assert r.status_code == 200, f"Superadmin login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def tenant_a():
    """Tenant A signup: returns dict with token, tenant_id, company_id, email."""
    email = f"{_uniq('tenanta')}@demo.test"
    r = _signup("Alpha Traders", "Alpha Traders Pvt Ltd", "Alice", email, "Owner@123")
    assert r.status_code == 200, f"Signup A failed: {r.status_code} {r.text}"
    body = r.json()
    return {"token": body["access_token"], "tenant_id": body["tenant_id"],
            "company_id": body["company_id"], "email": email}


@pytest.fixture(scope="module")
def tenant_b():
    email = f"{_uniq('tenantb')}@demo.test"
    r = _signup("Bravo Traders", "Bravo Traders Pvt Ltd", "Bob", email, "Owner@123")
    assert r.status_code == 200, f"Signup B failed: {r.status_code} {r.text}"
    body = r.json()
    return {"token": body["access_token"], "tenant_id": body["tenant_id"],
            "company_id": body["company_id"], "email": email}


# -------------------------------------------- auth / signup
class TestAuthSignup:
    def test_signup_creates_workspace_and_returns_token(self, tenant_a):
        assert tenant_a["token"]
        assert tenant_a["tenant_id"]
        assert tenant_a["company_id"]

    def test_me_returns_tenant_and_companies(self, tenant_a):
        r = requests.get(f"{API}/auth/me", headers=_hdr(tenant_a["token"]), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["user"]["email"] == tenant_a["email"]
        assert data["user"]["role"] == "owner"
        assert data["tenant"]["plan"] == "trial"
        assert data["tenant"]["status"] == "active"
        assert len(data["companies"]) == 1

    def test_signup_duplicate_email_400(self, tenant_a):
        r = _signup("Whatever", "Whatever Co", "Foo", tenant_a["email"], "Owner@123")
        assert r.status_code == 400

    def test_signup_short_password_400(self):
        r = _signup("X", "X Co", "Foo", f"{_uniq('short')}@t.test", "abc")
        assert r.status_code == 400

    def test_signup_missing_workspace_400(self):
        r = _signup("", "X", "Foo", f"{_uniq('nows')}@t.test", "Password1")
        assert r.status_code == 400

    def test_login_wrong_password_401(self, tenant_a):
        r = _login(tenant_a["email"], "WrongPass!")
        assert r.status_code == 401


# -------------------------------------------- data isolation between tenants
class TestTenantIsolation:
    def test_create_party_in_tenant_a(self, tenant_a):
        r = requests.post(f"{API}/parties",
                          headers=_hdr(tenant_a["token"], tenant_a["company_id"]),
                          json={"name": "TEST_A_Party", "roles": ["customer"], "phone": "1111111111"},
                          timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["name"] == "TEST_A_Party"

    def test_tenant_b_cannot_see_tenant_a_parties(self, tenant_a, tenant_b):
        r = requests.get(f"{API}/parties",
                         headers=_hdr(tenant_b["token"], tenant_b["company_id"]), timeout=15)
        assert r.status_code == 200
        names = [p["name"] for p in r.json()]
        assert "TEST_A_Party" not in names

    def test_tenant_a_sees_own_party(self, tenant_a):
        r = requests.get(f"{API}/parties",
                         headers=_hdr(tenant_a["token"], tenant_a["company_id"]), timeout=15)
        assert r.status_code == 200
        names = [p["name"] for p in r.json()]
        assert "TEST_A_Party" in names

    def test_categories_isolated(self, tenant_a, tenant_b):
        # Each signup seeds DEFAULT_CATEGORIES = 3 for its own company. B shouldn't see A's if custom.
        r = requests.post(f"{API}/product-categories",
                          headers=_hdr(tenant_a["token"], tenant_a["company_id"]),
                          json={"name": "TEST_A_Cat", "unit": "bag", "gst_default": 5}, timeout=15)
        assert r.status_code == 200
        r2 = requests.get(f"{API}/product-categories",
                          headers=_hdr(tenant_b["token"], tenant_b["company_id"]), timeout=15)
        assert r2.status_code == 200
        names = [c["name"] for c in r2.json()]
        assert "TEST_A_Cat" not in names


# -------------------------------------------- multi-company / plan enforcement
class TestPlanLimits:
    def test_trial_second_company_402(self, tenant_a):
        r = requests.post(f"{API}/companies",
                          headers=_hdr(tenant_a["token"], tenant_a["company_id"]),
                          json={"name": "Second Company"}, timeout=15)
        assert r.status_code == 402, f"Expected 402, got {r.status_code} {r.text}"
        assert "upgrade" in r.text.lower() or "plan" in r.text.lower()

    def test_upgrade_plan_via_superadmin_then_add_second_company(self, tenant_a, superadmin_token):
        # Upgrade to pro
        r = requests.put(f"{API}/platform/tenants/{tenant_a['tenant_id']}",
                         headers=_hdr(superadmin_token),
                         json={"plan": "pro"}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["plan"] == "pro"

        # Now create 2nd company
        r2 = requests.post(f"{API}/companies",
                           headers=_hdr(tenant_a["token"], tenant_a["company_id"]),
                           json={"name": "TEST_Alpha_Second"}, timeout=15)
        assert r2.status_code == 200, r2.text
        second_id = r2.json()["id"]
        tenant_a["second_company_id"] = second_id

        # Verify /auth/me lists 2 companies
        rm = requests.get(f"{API}/auth/me", headers=_hdr(tenant_a["token"]), timeout=15)
        assert rm.status_code == 200
        assert len(rm.json()["companies"]) == 2

    def test_switch_to_second_company_products_empty(self, tenant_a):
        # Products in second company should be empty (they are company-scoped)
        second = tenant_a.get("second_company_id")
        assert second, "requires prior test to have run"
        r = requests.get(f"{API}/products", headers=_hdr(tenant_a["token"], second), timeout=15)
        assert r.status_code == 200
        assert r.json() == []

    def test_parties_shared_tenant_wide(self, tenant_a):
        # Parties are TENANT_ONLY; TEST_A_Party should appear in the second company too
        second = tenant_a.get("second_company_id")
        r = requests.get(f"{API}/parties", headers=_hdr(tenant_a["token"], second), timeout=15)
        assert r.status_code == 200
        names = [p["name"] for p in r.json()]
        assert "TEST_A_Party" in names


# -------------------------------------------- suspension flow
class TestSuspensionFlow:
    def test_suspend_tenant_b_and_scoped_returns_402(self, tenant_b, superadmin_token):
        r = requests.put(f"{API}/platform/tenants/{tenant_b['tenant_id']}",
                         headers=_hdr(superadmin_token), json={"status": "suspended"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["status"] == "suspended"

        r2 = requests.get(f"{API}/parties",
                          headers=_hdr(tenant_b["token"], tenant_b["company_id"]), timeout=15)
        assert r2.status_code == 402
        assert "suspend" in r2.text.lower()

    def test_reactivate_tenant_b_access_restored(self, tenant_b, superadmin_token):
        r = requests.put(f"{API}/platform/tenants/{tenant_b['tenant_id']}",
                         headers=_hdr(superadmin_token), json={"status": "active"}, timeout=15)
        assert r.status_code == 200

        r2 = requests.get(f"{API}/parties",
                          headers=_hdr(tenant_b["token"], tenant_b["company_id"]), timeout=15)
        assert r2.status_code == 200


# -------------------------------------------- role boundaries
class TestRoleBoundaries:
    def test_superadmin_cannot_read_tenant_data(self, superadmin_token):
        r = requests.get(f"{API}/parties", headers=_hdr(superadmin_token), timeout=15)
        assert r.status_code == 403

    def test_tenant_user_cannot_read_platform(self, tenant_a):
        r = requests.get(f"{API}/platform/tenants", headers=_hdr(tenant_a["token"]), timeout=15)
        assert r.status_code == 403

    def test_tenant_user_cannot_call_platform_stats(self, tenant_a):
        r = requests.get(f"{API}/platform/stats", headers=_hdr(tenant_a["token"]), timeout=15)
        assert r.status_code == 403


# -------------------------------------------- super admin console endpoints
class TestPlatformConsole:
    def test_platform_stats(self, superadmin_token):
        r = requests.get(f"{API}/platform/stats", headers=_hdr(superadmin_token), timeout=15)
        assert r.status_code == 200
        data = r.json()
        for key in ("tenants", "active", "suspended", "trials", "users", "companies", "mrr"):
            assert key in data
        assert data["tenants"] >= 2

    def test_platform_tenants_list(self, superadmin_token, tenant_a):
        r = requests.get(f"{API}/platform/tenants", headers=_hdr(superadmin_token), timeout=15)
        assert r.status_code == 200
        rows = r.json()
        ids = [t["id"] for t in rows]
        assert tenant_a["tenant_id"] in ids

    def test_platform_plans(self, superadmin_token):
        r = requests.get(f"{API}/platform/plans", headers=_hdr(superadmin_token), timeout=15)
        assert r.status_code == 200
        keys = [p["key"] for p in r.json()]
        assert set(["trial", "basic", "pro"]).issubset(set(keys))

    def test_platform_extend_days(self, superadmin_token, tenant_a):
        r = requests.put(f"{API}/platform/tenants/{tenant_a['tenant_id']}",
                         headers=_hdr(superadmin_token), json={"extend_days": 30}, timeout=15)
        assert r.status_code == 200
        assert r.json()["plan_expires"]


# -------------------------------------------- core ERP still works
class TestCoreERPFlow:
    def test_full_purchase_sale_flow(self, tenant_a):
        h = _hdr(tenant_a["token"], tenant_a["company_id"])
        # Create farmer + customer
        r = requests.post(f"{API}/parties", headers=h,
                          json={"name": "TEST_A_Farmer", "roles": ["farmer"], "phone": "2222"}, timeout=15)
        assert r.status_code == 200
        farmer_id = r.json()["id"]

        r = requests.post(f"{API}/parties", headers=h,
                          json={"name": "TEST_A_Customer", "roles": ["customer"], "phone": "3333"}, timeout=15)
        assert r.status_code == 200
        cust_id = r.json()["id"]

        # Use seeded Potato category
        cats = requests.get(f"{API}/product-categories", headers=h, timeout=15).json()
        potato = next((c for c in cats if c["name"] == "Potato"), None)
        assert potato, "Potato category should be seeded"
        cat_id = potato["id"]

        # Godown
        r = requests.post(f"{API}/godowns", headers=h,
                          json={"name": "TEST_A_Godown", "kind": "cold_storage"}, timeout=15)
        assert r.status_code == 200
        godown_id = r.json()["id"]

        # Product
        r = requests.post(f"{API}/products", headers=h,
                          json={"category_id": cat_id, "name": "TEST_A_Potato",
                                "variety": "Kufri", "unit": "bag"}, timeout=15)
        assert r.status_code == 200
        prod_id = r.json()["id"]

        # Purchase 100 bags @ 10
        r = requests.post(f"{API}/purchases", headers=h,
                          json={"date": "2025-01-15", "category_id": cat_id, "party_id": farmer_id,
                                "product_id": prod_id, "godown_id": godown_id, "bags": 100,
                                "rate": 10, "rate_basis": "bag", "payment_type": "credit"}, timeout=15)
        assert r.status_code == 200, r.text
        purchase_id = r.json()["id"]
        assert r.json()["invoice_no"].startswith("PUR-")

        # Sale 30 bags @ 15 (should pass)
        r = requests.post(f"{API}/sales", headers=h,
                          json={"date": "2025-01-16", "category_id": cat_id, "party_id": cust_id,
                                "product_id": prod_id, "godown_id": godown_id, "bags": 30,
                                "rate": 15, "rate_basis": "bag", "payment_type": "credit"}, timeout=15)
        assert r.status_code == 200, r.text
        sale_id = r.json()["id"]

        # Overselling should 400
        r = requests.post(f"{API}/sales", headers=h,
                          json={"date": "2025-01-17", "category_id": cat_id, "party_id": cust_id,
                                "product_id": prod_id, "bags": 500, "rate": 15, "rate_basis": "bag"}, timeout=15)
        assert r.status_code == 400

        # Ledger for farmer
        r = requests.get(f"{API}/ledger?party_id={farmer_id}", headers=h, timeout=15)
        assert r.status_code == 200
        assert r.json()["totals"]["credit"] >= 1000

        # Receipt against sale invoice
        r = requests.post(f"{API}/sales/{sale_id}/payments", headers=h,
                          json={"amount": 200, "payment_mode": "cash"}, timeout=15)
        assert r.status_code == 200

        # Invoices list
        r = requests.get(f"{API}/invoices", headers=h, timeout=15)
        assert r.status_code == 200
        assert len(r.json()) >= 2

        # Dashboard
        r = requests.get(f"{API}/dashboard/summary", headers=h, timeout=15)
        assert r.status_code == 200
        assert r.json()["counts"]["products"] >= 1

        # Reports
        r = requests.get(f"{API}/reports/transactions?kind=sales", headers=h, timeout=15)
        assert r.status_code == 200


# -------------------------------------------- staff users & plan-based limits
class TestStaffUsers:
    def test_create_operator_and_check_role_gating(self, tenant_a):
        h = _hdr(tenant_a["token"], tenant_a["company_id"])
        op_email = f"{_uniq('op')}@demo.test"
        r = requests.post(f"{API}/users", headers=h,
                          json={"email": op_email, "password": "Operator@123",
                                "name": "OpFoo", "role": "operator"}, timeout=15)
        # tenant_a is now on 'pro' plan (upgraded earlier). max_users=20 -> should succeed
        assert r.status_code == 200, r.text
        # Login as operator
        lr = _login(op_email, "Operator@123")
        assert lr.status_code == 200
        op_token = lr.json()["access_token"]
        op_h = _hdr(op_token, tenant_a["company_id"])
        # Operator should be blocked from ledger, receipts, invoices, reports, users
        assert requests.get(f"{API}/ledger?party_id=x", headers=op_h, timeout=15).status_code == 403
        assert requests.get(f"{API}/receipts", headers=op_h, timeout=15).status_code == 403
        assert requests.get(f"{API}/invoices", headers=op_h, timeout=15).status_code == 403
        assert requests.get(f"{API}/reports/transactions?kind=sales", headers=op_h, timeout=15).status_code == 403
        assert requests.get(f"{API}/users", headers=op_h, timeout=15).status_code == 403
        # Operator can read parties + products (masters)
        assert requests.get(f"{API}/parties", headers=op_h, timeout=15).status_code == 200

    def test_trial_max_users_402(self, superadmin_token):
        """Fresh trial tenant: 3 user limit — 1 owner already exists, add 2 more, 4th must 402."""
        # New trial tenant
        email = f"{_uniq('trial')}@demo.test"
        r = _signup("Trial Cap Workspace", "Trial Cap Co", "Cap Owner", email, "Owner@123")
        assert r.status_code == 200
        b = r.json()
        h = _hdr(b["access_token"], b["company_id"])

        # Add users 2 & 3 (should succeed)
        for i in range(2):
            u_email = f"{_uniq('trialu')}@demo.test"
            rr = requests.post(f"{API}/users", headers=h,
                               json={"email": u_email, "password": "Password1", "role": "operator"}, timeout=15)
            assert rr.status_code == 200, f"user {i+2} failed: {rr.text}"

        # 4th must fail with 402
        u_email = f"{_uniq('trialu')}@demo.test"
        rr = requests.post(f"{API}/users", headers=h,
                           json={"email": u_email, "password": "Password1", "role": "operator"}, timeout=15)
        assert rr.status_code == 402, f"Expected 402, got {rr.status_code}: {rr.text}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-p", "no:cacheprovider"])
