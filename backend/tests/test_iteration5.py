"""Iteration 5 backend tests:
- Sale payment_status: default paid/unpaid on cash/credit; company outstanding
  reflects paid sales; farmer ledger gets sale_payment credit when paid;
  toggling & delete update ledger/outstanding.
- Season chart /api/dashboard/season-chart shape (Nov->Oct months).
- Low stock /api/dashboard/low-stock uses company profile threshold.
- Company profile low_stock_threshold saves & persists.
- /api/cron/monthly-statements auth, idempotency, background run;
  /api/cron/runs admin-only.
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
CRON_SECRET = "c47f19ab8e2d4a6f95b70c3e18d52af6b9134e7c0a8d6f2b5e91c34a7d08fb62"


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_h():
    return {"Authorization": f"Bearer {_login(ADMIN)}"}


@pytest.fixture(scope="module")
def oper_h():
    try:
        return {"Authorization": f"Bearer {_login(OPER)}"}
    except AssertionError:
        pytest.skip("Operator missing")


def _seed_product_purchase(admin_h, bags=100, category="seeds"):
    ts = int(time.time() * 1000)
    pr = requests.post(f"{API}/products", headers=admin_h, json={
        "name": f"TEST_it5_prod_{ts}", "category": category, "unit": "bag", "opening_qty": 0})
    assert pr.status_code == 200, pr.text
    pid = pr.json()["id"]
    fr = requests.post(f"{API}/farmers", headers=admin_h,
                       json={"name": f"TEST_it5_f_{ts}", "phone": "9990000000"})
    fid = fr.json()["id"]
    ph = requests.post(f"{API}/purchases", headers=admin_h, json={
        "category": category, "date": "2025-01-10", "party_type": "farmer",
        "party_id": fid, "product_id": pid, "bags": bags, "rate": 100, "rate_basis": "bag"})
    assert ph.status_code == 200, ph.text
    return pid, fid, ph.json()["id"]


def _seed_company(admin_h):
    ts = int(time.time() * 1000)
    r = requests.post(f"{API}/companies", headers=admin_h,
                      json={"name": f"TEST_it5_co_{ts}"})
    return r.json()["id"]


def _outstanding_company(admin_h, cid):
    r = requests.get(f"{API}/outstanding", headers=admin_h)
    assert r.status_code == 200
    for row in r.json().get("companies", []):
        if row.get("party_id") == cid:
            return row
    return None


# ================= Payment Status: default + company outstanding =========
class TestPaymentStatusCompany:
    def test_defaults_cash_paid_credit_unpaid(self, admin_h):
        pid, fid, phid = _seed_product_purchase(admin_h)
        cid = _seed_company(admin_h)
        # cash sale -> default paid
        s1 = requests.post(f"{API}/sales", headers=admin_h, json={
            "category": "seeds", "date": "2025-02-01", "party_type": "company",
            "party_id": cid, "product_id": pid, "bags": 5, "rate": 120,
            "rate_basis": "bag", "payment_type": "cash",
        })
        assert s1.status_code == 200, s1.text
        assert s1.json().get("payment_status") == "paid"
        # credit sale -> default unpaid
        s2 = requests.post(f"{API}/sales", headers=admin_h, json={
            "category": "seeds", "date": "2025-02-02", "party_type": "company",
            "party_id": cid, "product_id": pid, "bags": 5, "rate": 120,
            "rate_basis": "bag", "payment_type": "credit",
        })
        assert s2.status_code == 200, s2.text
        assert s2.json().get("payment_status") == "unpaid"
        # cleanup
        for sid in (s1.json()["id"], s2.json()["id"]):
            requests.delete(f"{API}/sales/{sid}", headers=admin_h)
        requests.delete(f"{API}/purchases/{phid}", headers=admin_h)
        requests.delete(f"{API}/products/{pid}", headers=admin_h)
        requests.delete(f"{API}/farmers/{fid}", headers=admin_h)
        requests.delete(f"{API}/companies/{cid}", headers=admin_h)

    def test_paid_sale_settles_outstanding(self, admin_h):
        pid, fid, phid = _seed_product_purchase(admin_h)
        cid = _seed_company(admin_h)
        # UNPAID credit sale
        s = requests.post(f"{API}/sales", headers=admin_h, json={
            "category": "seeds", "date": "2025-02-05", "party_type": "company",
            "party_id": cid, "product_id": pid, "bags": 10, "rate": 200,
            "rate_basis": "bag", "payment_type": "credit", "payment_status": "unpaid",
        })
        assert s.status_code == 200, s.text
        sid = s.json()["id"]
        row = _outstanding_company(admin_h, cid)
        assert row is not None
        assert round(row["balance"], 2) > 0

        # Change to PAID
        upd = requests.put(f"{API}/sales/{sid}", headers=admin_h, json={
            **s.json(), "payment_status": "paid"})
        assert upd.status_code == 200
        row = _outstanding_company(admin_h, cid)
        assert row is None or abs(row["balance"]) < 0.01, f"expected 0 balance, got {row}"

        # Back to UNPAID
        upd2 = requests.put(f"{API}/sales/{sid}", headers=admin_h, json={
            **upd.json(), "payment_status": "unpaid"})
        assert upd2.status_code == 200
        row = _outstanding_company(admin_h, cid)
        assert row is not None and row["balance"] > 0

        # Delete
        requests.delete(f"{API}/sales/{sid}", headers=admin_h)
        row = _outstanding_company(admin_h, cid)
        assert row is None

        # cleanup
        requests.delete(f"{API}/purchases/{phid}", headers=admin_h)
        requests.delete(f"{API}/products/{pid}", headers=admin_h)
        requests.delete(f"{API}/farmers/{fid}", headers=admin_h)
        requests.delete(f"{API}/companies/{cid}", headers=admin_h)


# ================= Payment Status: farmer ledger =====================
class TestPaymentStatusFarmer:
    def _ledger(self, admin_h, fid):
        r = requests.get(f"{API}/ledger", headers=admin_h, params={"farmer_id": fid})
        assert r.status_code == 200, r.text
        return r.json().get("entries", [])

    def test_paid_farmer_sale_creates_sale_payment_credit(self, admin_h):
        pid, fid, phid = _seed_product_purchase(admin_h)
        # sale to farmer, paid
        s = requests.post(f"{API}/sales", headers=admin_h, json={
            "category": "seeds", "date": "2025-02-10", "party_type": "farmer",
            "party_id": fid, "product_id": pid, "bags": 4, "rate": 150,
            "rate_basis": "bag", "payment_type": "cash", "payment_status": "paid",
        })
        assert s.status_code == 200, s.text
        sid = s.json()["id"]
        entries = self._ledger(admin_h, fid)
        sale_pmt = [e for e in entries if e.get("ref_type") == "sale_payment" and e.get("ref_id") == sid]
        assert len(sale_pmt) == 1, f"expected 1 sale_payment entry, got {sale_pmt}"
        assert round(float(sale_pmt[0].get("credit") or 0), 2) > 0

        # Change to unpaid -> credit removed
        upd = requests.put(f"{API}/sales/{sid}", headers=admin_h, json={
            **s.json(), "payment_status": "unpaid"})
        assert upd.status_code == 200
        entries = self._ledger(admin_h, fid)
        assert not [e for e in entries if e.get("ref_type") == "sale_payment" and e.get("ref_id") == sid]

        # Delete sale -> both entries removed
        requests.delete(f"{API}/sales/{sid}", headers=admin_h)
        entries = self._ledger(admin_h, fid)
        assert not [e for e in entries if e.get("ref_id") == sid]

        # cleanup
        requests.delete(f"{API}/purchases/{phid}", headers=admin_h)
        requests.delete(f"{API}/products/{pid}", headers=admin_h)
        requests.delete(f"{API}/farmers/{fid}", headers=admin_h)


# ================= Season Chart ===================================
class TestSeasonChart:
    def test_shape(self, admin_h):
        r = requests.get(f"{API}/dashboard/season-chart", headers=admin_h)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "months" in d and "season" in d
        months = d["months"]
        assert len(months) == 12
        # First should be Nov, last Oct
        assert months[0]["month"] == "Nov"
        assert months[-1]["month"] == "Oct"
        for row in months:
            for k in ("purchases", "sales", "prev_purchases", "prev_sales"):
                assert k in row


# ================= Company profile low_stock_threshold ================
class TestLowStockThreshold:
    def test_profile_has_and_persists_threshold(self, admin_h):
        cur = requests.get(f"{API}/company-profile", headers=admin_h).json()
        assert "low_stock_threshold" in cur
        original = cur.get("low_stock_threshold", 10)
        payload = {**cur, "low_stock_threshold": 200}
        r = requests.put(f"{API}/company-profile", headers=admin_h, json=payload)
        assert r.status_code == 200
        assert int(r.json()["low_stock_threshold"]) == 200
        g = requests.get(f"{API}/company-profile", headers=admin_h).json()
        assert int(g["low_stock_threshold"]) == 200
        # restore
        payload["low_stock_threshold"] = original
        requests.put(f"{API}/company-profile", headers=admin_h, json=payload)


class TestLowStockEndpoint:
    def test_low_stock_threshold_affects_results(self, admin_h):
        # Seed product with small purchase (100 bags), no sales -> balance 100
        pid, fid, phid = _seed_product_purchase(admin_h, bags=100)
        try:
            # Set threshold high (500) so this product should appear
            cur = requests.get(f"{API}/company-profile", headers=admin_h).json()
            original = cur.get("low_stock_threshold", 10)
            requests.put(f"{API}/company-profile", headers=admin_h,
                         json={**cur, "low_stock_threshold": 500})
            ls = requests.get(f"{API}/dashboard/low-stock", headers=admin_h)
            assert ls.status_code == 200, ls.text
            data = ls.json()
            assert data["threshold"] == 500
            hit = [p for p in data.get("products", []) if p.get("product_id") == pid]
            assert hit, "product should appear when threshold=500 and balance=100"
            assert hit[0]["state"] in ("low", "out")

            # Lower threshold to 10 -> product should NOT appear (balance 100 > 10)
            requests.put(f"{API}/company-profile", headers=admin_h,
                         json={**cur, "low_stock_threshold": 10})
            ls2 = requests.get(f"{API}/dashboard/low-stock", headers=admin_h).json()
            hit2 = [p for p in ls2.get("products", []) if p.get("product_id") == pid]
            assert not hit2
        finally:
            # restore threshold
            requests.put(f"{API}/company-profile", headers=admin_h,
                         json={**cur, "low_stock_threshold": original})
            requests.delete(f"{API}/purchases/{phid}", headers=admin_h)
            requests.delete(f"{API}/products/{pid}", headers=admin_h)
            requests.delete(f"{API}/farmers/{fid}", headers=admin_h)


# ================= Cron endpoint ===================================
class TestCronMonthlyStatements:
    def test_no_secret_401(self):
        r = requests.post(f"{API}/cron/monthly-statements", json={})
        assert r.status_code == 401

    def test_wrong_secret_401(self):
        r = requests.post(f"{API}/cron/monthly-statements",
                          headers={"Authorization": "Bearer wrong"}, json={})
        assert r.status_code == 401

    def test_correct_secret_and_idempotency(self, admin_h):
        webhook_id = f"TEST_it5_run_{int(time.time()*1000)}"
        hdrs = {"Authorization": f"Bearer {CRON_SECRET}", "X-Webhook-Id": webhook_id}
        r1 = requests.post(f"{API}/cron/monthly-statements", headers=hdrs, json={})
        assert r1.status_code == 200, r1.text
        j1 = r1.json()
        assert j1.get("ok") is True
        assert j1.get("run_id") == webhook_id
        assert j1.get("queued") is True

        # duplicate
        r2 = requests.post(f"{API}/cron/monthly-statements", headers=hdrs, json={})
        assert r2.status_code == 200
        j2 = r2.json()
        assert j2.get("duplicate") is True
        assert j2.get("run_id") == webhook_id

        # cron/runs (admin) should show it
        time.sleep(3)  # let background finish for tiny farmer set
        runs = requests.get(f"{API}/cron/runs", headers=admin_h)
        assert runs.status_code == 200
        found = next((x for x in runs.json() if x["run_id"] == webhook_id), None)
        assert found is not None, f"run {webhook_id} not in runs list"
        # status should be queued or done
        assert found["status"] in ("queued", "done")

    def test_cron_runs_operator_forbidden(self, oper_h):
        r = requests.get(f"{API}/cron/runs", headers=oper_h)
        assert r.status_code == 403
