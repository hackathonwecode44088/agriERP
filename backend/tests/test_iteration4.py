"""Iteration 4 backend tests:
- Alert threshold saved on company-profile (admin only, default 20)
- Farmer email field persists
- Season Comparison /api/dashboard/seasons
- Entry validation on sales (product & lot stock)
- Farmer statement email endpoint (admin only)
"""
import os
import time
import pytest
import requests
from dotenv import load_dotenv
load_dotenv("/app/frontend/.env")

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"
ADMIN = {"email": "admin@potatoerp.com", "password": "Admin@123"}
OPER = {"email": "operator@potatoerp.com", "password": "Operator@123"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def oper_token():
    try:
        return _login(OPER)
    except AssertionError:
        pytest.skip("Operator user missing")


@pytest.fixture(scope="module")
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def oper_h(oper_token):
    return {"Authorization": f"Bearer {oper_token}"}


# ---------------- company profile / rate threshold ----------------
class TestCompanyProfileThreshold:
    def test_get_profile_has_threshold(self, admin_h):
        r = requests.get(f"{API}/company-profile", headers=admin_h)
        assert r.status_code == 200
        data = r.json()
        assert "rate_alert_threshold" in data

    def test_admin_can_update_threshold_persists(self, admin_h):
        # Get current, set to 50, verify, restore
        cur = requests.get(f"{API}/company-profile", headers=admin_h).json()
        original = cur.get("rate_alert_threshold", 20)
        payload = {**cur, "rate_alert_threshold": 50}
        r = requests.put(f"{API}/company-profile", headers=admin_h, json=payload)
        assert r.status_code == 200
        assert int(r.json()["rate_alert_threshold"]) == 50
        # verify persistence via GET
        g = requests.get(f"{API}/company-profile", headers=admin_h).json()
        assert int(g["rate_alert_threshold"]) == 50
        # restore
        payload["rate_alert_threshold"] = original
        requests.put(f"{API}/company-profile", headers=admin_h, json=payload)

    def test_operator_cannot_update_profile(self, oper_h):
        r = requests.put(f"{API}/company-profile", headers=oper_h, json={"rate_alert_threshold": 30})
        assert r.status_code == 403


# ---------------- farmer email field ----------------
class TestFarmerEmailField:
    def test_create_farmer_with_email_and_persist(self, admin_h):
        payload = {
            "name": f"TEST_it4_farmer_{int(time.time())}",
            "phone": "9990001111",
            "email": "delivered@resend.dev",
            "village": "TEST_Village",
        }
        r = requests.post(f"{API}/farmers", headers=admin_h, json=payload)
        assert r.status_code == 200, r.text
        fid = r.json()["id"]
        assert r.json()["email"] == "delivered@resend.dev"
        # Get via list & confirm
        lst = requests.get(f"{API}/farmers", headers=admin_h).json()
        got = next((x for x in lst if x["id"] == fid), None)
        assert got and got["email"] == "delivered@resend.dev"
        # Cleanup
        requests.delete(f"{API}/farmers/{fid}", headers=admin_h)


# ---------------- dashboard seasons ----------------
class TestSeasonComparison:
    def test_seasons_shape(self, admin_h):
        r = requests.get(f"{API}/dashboard/seasons", headers=admin_h)
        assert r.status_code == 200, r.text
        d = r.json()
        for key in ("current", "previous", "growth"):
            assert key in d
        cur = d["current"]
        # labels & window
        assert "-" in cur["label"]
        assert cur["from"].endswith("-11-01")
        assert cur["to"].endswith("-10-31")
        # subtotals present
        for k in ("purchase", "sale"):
            assert "amount" in cur[k]
            assert "bags" in cur[k]
        assert "margin" in cur
        # growth keys
        for k in ("purchase_amount", "sale_amount", "margin", "purchase_bags"):
            assert k in d["growth"]

    def test_seasons_operator_allowed(self, oper_h):
        r = requests.get(f"{API}/dashboard/seasons", headers=oper_h)
        assert r.status_code == 200


# ---------------- entry validation (sales stock) ----------------
class TestSaleStockValidation:
    def _make_fresh_product_and_purchase(self, admin_h, bags=20, category="seeds"):
        pname = f"TEST_it4_prod_{int(time.time()*1000)}"
        pr = requests.post(
            f"{API}/products", headers=admin_h,
            json={"name": pname, "category": category, "unit": "bag", "opening_qty": 0}
        )
        assert pr.status_code == 200, pr.text
        pid = pr.json()["id"]
        # need a party (vendor) for purchase
        # But purchases accept without party too? clean_txn allows minimal. Use a farmer.
        fr = requests.post(f"{API}/farmers", headers=admin_h,
                           json={"name": f"TEST_it4_f_{int(time.time()*1000)}"})
        fid = fr.json()["id"]
        # Create a purchase
        purch = requests.post(f"{API}/purchases", headers=admin_h, json={
            "category": category, "date": "2025-01-15", "party_type": "farmer",
            "party_id": fid, "product_id": pid, "bags": bags, "rate": 100,
            "rate_basis": "bag",
        })
        assert purch.status_code == 200, purch.text
        return pid, fid, purch.json()["id"]

    def test_sale_within_stock_succeeds(self, admin_h):
        pid, fid, purid = self._make_fresh_product_and_purchase(admin_h, bags=20)
        # Company party
        cr = requests.post(f"{API}/companies", headers=admin_h,
                           json={"name": f"TEST_it4_co_{int(time.time()*1000)}"})
        cid = cr.json()["id"]
        sr = requests.post(f"{API}/sales", headers=admin_h, json={
            "category": "seeds", "date": "2025-01-16", "party_type": "company",
            "party_id": cid, "product_id": pid, "bags": 10, "rate": 120,
            "rate_basis": "bag",
        })
        assert sr.status_code == 200, sr.text
        sid = sr.json()["id"]
        # cleanup
        requests.delete(f"{API}/sales/{sid}", headers=admin_h)
        requests.delete(f"{API}/purchases/{purid}", headers=admin_h)
        requests.delete(f"{API}/products/{pid}", headers=admin_h)
        requests.delete(f"{API}/farmers/{fid}", headers=admin_h)
        requests.delete(f"{API}/companies/{cid}", headers=admin_h)

    def test_sale_over_stock_rejected(self, admin_h):
        pid, fid, purid = self._make_fresh_product_and_purchase(admin_h, bags=5)
        cr = requests.post(f"{API}/companies", headers=admin_h,
                           json={"name": f"TEST_it4_co_{int(time.time()*1000)}"})
        cid = cr.json()["id"]
        sr = requests.post(f"{API}/sales", headers=admin_h, json={
            "category": "seeds", "date": "2025-01-16", "party_type": "company",
            "party_id": cid, "product_id": pid, "bags": 50, "rate": 120,
            "rate_basis": "bag",
        })
        assert sr.status_code == 400, sr.text
        msg = sr.json().get("detail", "")
        assert "bags" in msg.lower()
        assert "5" in msg  # available count mentioned
        # cleanup
        requests.delete(f"{API}/purchases/{purid}", headers=admin_h)
        requests.delete(f"{API}/products/{pid}", headers=admin_h)
        requests.delete(f"{API}/farmers/{fid}", headers=admin_h)
        requests.delete(f"{API}/companies/{cid}", headers=admin_h)

    def test_sale_over_lot_rejected(self, admin_h):
        # potato with lot
        pname = f"TEST_it4_potato_{int(time.time()*1000)}"
        pr = requests.post(f"{API}/products", headers=admin_h,
                           json={"name": pname, "category": "potato", "unit": "bag"})
        pid = pr.json()["id"]
        fr = requests.post(f"{API}/farmers", headers=admin_h,
                           json={"name": f"TEST_it4_pf_{int(time.time()*1000)}"})
        fid = fr.json()["id"]
        cr = requests.post(f"{API}/companies", headers=admin_h,
                           json={"name": f"TEST_it4_pc_{int(time.time()*1000)}"})
        cid = cr.json()["id"]
        lot = f"LOT-{int(time.time()*1000)}"
        purch = requests.post(f"{API}/purchases", headers=admin_h, json={
            "category": "potato", "date": "2025-01-15", "party_type": "farmer",
            "party_id": fid, "product_id": pid, "bags": 100, "rate": 50,
            "rate_basis": "bag", "lot_no": lot,
        })
        assert purch.status_code == 200, purch.text
        purid = purch.json()["id"]
        # Sell more from that lot than the lot has (still within product total via a "different" lot? no, only this lot exists)
        sr = requests.post(f"{API}/sales", headers=admin_h, json={
            "category": "potato", "date": "2025-01-16", "party_type": "company",
            "party_id": cid, "product_id": pid, "bags": 200, "rate": 60,
            "rate_basis": "bag", "lot_no": lot,
        })
        assert sr.status_code == 400
        detail = sr.json()["detail"]
        # It might hit product-level limit first (product has 100). Either message acceptable but must be 400
        assert "bags" in detail.lower()

        # Now sell exactly what lot has - should succeed
        sr2 = requests.post(f"{API}/sales", headers=admin_h, json={
            "category": "potato", "date": "2025-01-16", "party_type": "company",
            "party_id": cid, "product_id": pid, "bags": 30, "rate": 60,
            "rate_basis": "bag", "lot_no": lot,
        })
        assert sr2.status_code == 200, sr2.text
        sid = sr2.json()["id"]

        # Editing this sale to same bags should succeed (excludes own bags)
        up = requests.put(f"{API}/sales/{sid}", headers=admin_h, json={
            "category": "potato", "date": "2025-01-16", "party_type": "company",
            "party_id": cid, "product_id": pid, "bags": 30, "rate": 65,
            "rate_basis": "bag", "lot_no": lot,
        })
        assert up.status_code == 200, up.text

        # cleanup
        requests.delete(f"{API}/sales/{sid}", headers=admin_h)
        requests.delete(f"{API}/purchases/{purid}", headers=admin_h)
        requests.delete(f"{API}/products/{pid}", headers=admin_h)
        requests.delete(f"{API}/farmers/{fid}", headers=admin_h)
        requests.delete(f"{API}/companies/{cid}", headers=admin_h)


# ---------------- email statement ----------------
class TestEmailStatement:
    def test_email_statement_admin_only(self, oper_h, admin_h):
        farmers = requests.get(f"{API}/farmers", headers=admin_h).json()
        target = next((f for f in farmers if f.get("email")), None)
        if not target:
            pytest.skip("no farmer with email")
        r = requests.post(f"{API}/ledger/{target['id']}/email-statement", headers=oper_h)
        assert r.status_code == 403

    def test_email_statement_no_email_returns_400(self, admin_h):
        # Create farmer without email
        fr = requests.post(f"{API}/farmers", headers=admin_h,
                           json={"name": f"TEST_it4_noemail_{int(time.time()*1000)}"})
        fid = fr.json()["id"]
        try:
            r = requests.post(f"{API}/ledger/{fid}/email-statement", headers=admin_h)
            assert r.status_code == 400
            assert "email" in r.json()["detail"].lower()
        finally:
            requests.delete(f"{API}/farmers/{fid}", headers=admin_h)

    def test_email_statement_sends(self, admin_h):
        # Create farmer with delivered@resend.dev
        fr = requests.post(f"{API}/farmers", headers=admin_h, json={
            "name": f"TEST_it4_mail_{int(time.time()*1000)}",
            "email": "delivered@resend.dev",
        })
        fid = fr.json()["id"]
        try:
            r = requests.post(f"{API}/ledger/{fid}/email-statement", headers=admin_h, timeout=60)
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["ok"] is True
            assert body["sent_to"] == "delivered@resend.dev"
        finally:
            requests.delete(f"{API}/farmers/{fid}", headers=admin_h)
