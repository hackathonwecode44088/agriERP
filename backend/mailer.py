import logging
import os
import re
import ipaddress
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException

logger = logging.getLogger(__name__)

EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ["EMERGENT_EMAIL_KEY"]
EMAIL_FROM_NAME = os.environ["EMAIL_FROM_NAME"]
EMAIL_REPLY_TO = os.environ.get("EMAIL_REPLY_TO")

_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "confirm your card number",
             "your full card number", "seed phrase", "recovery phrase", "verify your card",
             "social security number", "confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan()
    scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Shortened, numeric-host or credential-bearing URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} != real link host {real!r} (G3)")


async def send_email(*, to: str, subject: str, html: str, reply_to: str | None = None) -> str | None:
    _assert_safe_email(subject, html)
    payload = {"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
    if reply_to or EMAIL_REPLY_TO:
        payload["contact_email"] = reply_to or EMAIL_REPLY_TO
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{EMAIL_BASE_URL}/api/v1/email/send",
                headers={"X-Email-Key": EMAIL_KEY},
                json=payload,
            )
        resp.raise_for_status()
        return resp.json().get("id")
    except httpx.HTTPStatusError as e:
        logger.error(f"Email send failed: {e.response.status_code} {e.response.text}")
        raise HTTPException(status_code=502, detail="Failed to send email")
    except Exception as e:
        logger.error(f"Email send error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to send email")


def statement_html(*, company_name: str, farmer_name: str, rows: list, totals: dict) -> str:
    tr = ""
    for r in rows:
        tr += (
            "<tr>"
            f"<td style='padding:6px 8px;border-bottom:1px solid #eee'>{escape(str(r.get('date') or '-'))}</td>"
            f"<td style='padding:6px 8px;border-bottom:1px solid #eee'>{escape(str(r.get('particulars') or '-'))}</td>"
            f"<td style='padding:6px 8px;border-bottom:1px solid #eee;text-align:right'>{float(r.get('debit') or 0):.2f}</td>"
            f"<td style='padding:6px 8px;border-bottom:1px solid #eee;text-align:right'>{float(r.get('credit') or 0):.2f}</td>"
            f"<td style='padding:6px 8px;border-bottom:1px solid #eee;text-align:right'>{float(r.get('balance') or 0):.2f}</td>"
            "</tr>"
        )
    if not tr:
        tr = "<tr><td colspan='5' style='padding:12px;text-align:center;color:#888'>No entries yet.</td></tr>"

    return (
        "<table role='presentation' width='100%' style='font-family:Arial,sans-serif;color:#111'>"
        "<tr><td style='padding:24px'>"
        f"<h2 style='margin:0 0 4px'>{escape(company_name)}</h2>"
        f"<p style='margin:0 0 18px;color:#555'>Account statement for <strong>{escape(farmer_name)}</strong></p>"
        "<table role='presentation' width='100%' style='border-collapse:collapse;font-size:13px'>"
        "<tr style='background:#f4f6f5;text-align:left'>"
        "<th style='padding:8px'>Date</th><th style='padding:8px'>Particulars</th>"
        "<th style='padding:8px;text-align:right'>Debit</th>"
        "<th style='padding:8px;text-align:right'>Credit</th>"
        "<th style='padding:8px;text-align:right'>Balance</th></tr>"
        f"{tr}"
        "</table>"
        f"<p style='margin:18px 0 0;font-size:14px'><strong>Total debit:</strong> {float(totals.get('debit') or 0):.2f} "
        f"&nbsp; <strong>Total credit:</strong> {float(totals.get('credit') or 0):.2f} "
        f"&nbsp; <strong>Closing balance:</strong> {float(totals.get('balance') or 0):.2f}</p>"
        f"<p style='margin-top:24px;font-size:12px;color:#888'>Sent by {escape(company_name)}. "
        "We never ask for your password, PIN or bank details by email.</p>"
        "</td></tr></table>"
    )
