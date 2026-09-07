"""RBAC + custom roles backend tests."""
import os
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")

OWNER = {"email": "merge_test_1788760554@demo.com", "password": "Owner@123"}
ACC = {"email": "acc1@demo.com", "password": "Acc@123"}


def _login(creds):
    r = requests.post(f"{BASE}/api/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _headers(token, company_id=None):
    h = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    if company_id:
        h["X-Company-Id"] = company_id
    return h


@pytest.fixture(scope="module")
def owner_ctx():
    tok = _login(OWNER)
    me = requests.get(f"{BASE}/api/auth/me", headers=_headers(tok), timeout=20).json()
    cid = me.get("default_company_id") or (me.get("companies") or [{}])[0].get("id")
    return {"token": tok, "company_id": cid, "me": me}


@pytest.fixture(scope="module")
def acc_ctx():
    tok = _login(ACC)
    me = requests.get(f"{BASE}/api/auth/me", headers=_headers(tok), timeout=20).json()
    cid = me.get("default_company_id") or (me.get("companies") or [{}])[0].get("id")
    return {"token": tok, "company_id": cid, "me": me}


# ---- Accountant /auth/me perms ----
def test_accountant_auth_me_perms(acc_ctx):
    perms = acc_ctx["me"].get("perms") or {}
    assert perms.get("dashboard") == ["view"], perms
    assert perms.get("ledger") == ["view"], perms
    assert set(perms.get("receipts") or []) == {"view", "create"}, perms
    assert perms.get("invoices") == ["view"], perms
    assert "sales" not in perms and "parties" not in perms, perms
    assert acc_ctx["me"].get("is_admin") in (False, None)


# ---- Access enforcement ----
@pytest.mark.parametrize("path,expected", [
    ("/api/ledger", 200),
    ("/api/receipts", 200),
    ("/api/sales", 403),
    ("/api/parties", 403),
    ("/api/users", 403),
])
def test_accountant_get_access(acc_ctx, path, expected):
    r = requests.get(f"{BASE}{path}", headers=_headers(acc_ctx["token"], acc_ctx["company_id"]), timeout=20)
    assert r.status_code == expected, f"{path} -> {r.status_code} {r.text[:200]}"


def test_accountant_post_sales_forbidden(acc_ctx):
    r = requests.post(f"{BASE}/api/sales",
                      headers=_headers(acc_ctx["token"], acc_ctx["company_id"]),
                      json={"party_id": "x", "items": []}, timeout=20)
    assert r.status_code == 403


# ---- Owner has full access ----
def test_owner_full_access(owner_ctx):
    for p in ["/api/sales", "/api/parties", "/api/users", "/api/ledger", "/api/receipts", "/api/roles", "/api/roles/features"]:
        r = requests.get(f"{BASE}{p}", headers=_headers(owner_ctx["token"], owner_ctx["company_id"]), timeout=20)
        assert r.status_code == 200, f"{p} -> {r.status_code}"


# ---- Roles CRUD ----
def test_roles_features_shape(owner_ctx):
    r = requests.get(f"{BASE}/api/roles/features", headers=_headers(owner_ctx["token"], owner_ctx["company_id"]), timeout=20)
    assert r.status_code == 200
    features = r.json().get("features") or {}
    assert "sales" in features and "view" in features["sales"]


def test_role_create_edit_delete(owner_ctx):
    h = _headers(owner_ctx["token"], owner_ctx["company_id"])
    name = "TEST_role_qa"
    # create
    r = requests.post(f"{BASE}/api/roles", headers=h,
                      json={"name": name, "permissions": {"dashboard": ["view"], "sales": ["view"]}}, timeout=20)
    assert r.status_code in (200, 201), r.text
    role = r.json()
    assert role["name"] == name
    role_id = role["id"]

    # verify persisted via GET list
    r2 = requests.get(f"{BASE}/api/roles", headers=h, timeout=20)
    assert any(x["id"] == role_id for x in r2.json())

    # update
    r3 = requests.put(f"{BASE}/api/roles/{role_id}", headers=h,
                      json={"name": name + "_upd", "permissions": {"dashboard": ["view"], "ledger": ["view"]}}, timeout=20)
    assert r3.status_code == 200, r3.text
    assert r3.json()["name"] == name + "_upd"

    # delete
    r4 = requests.delete(f"{BASE}/api/roles/{role_id}", headers=h, timeout=20)
    assert r4.status_code in (200, 204)


def test_role_delete_blocked_when_assigned(owner_ctx, acc_ctx):
    # Find role assigned to acc user
    h = _headers(owner_ctx["token"], owner_ctx["company_id"])
    role_id = (acc_ctx["me"].get("user") or {}).get("role_id") or acc_ctx["me"].get("role_id")
    if not role_id:
        pytest.skip("acc user has no role_id")
    r = requests.delete(f"{BASE}/api/roles/{role_id}", headers=h, timeout=20)
    assert r.status_code >= 400, "Delete of assigned role should be blocked"


# ---- Accountant cannot manage roles/users ----
def test_accountant_cannot_access_roles(acc_ctx):
    r = requests.get(f"{BASE}/api/roles", headers=_headers(acc_ctx["token"], acc_ctx["company_id"]), timeout=20)
    assert r.status_code == 403
