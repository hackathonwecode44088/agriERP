"""In-app notifications. Saved per company, auto-purged after NOTIF_TTL_DAYS."""
from datetime import datetime, timedelta, timezone

from core import now_iso

NOTIF_TTL_DAYS = 2

# feature key a notification belongs to -> used to hide it from staff without that access
GENERAL = "general"


def _cutoff() -> str:
    return (datetime.now(timezone.utc) - timedelta(days=NOTIF_TTL_DAYS)).isoformat()


async def notify(sdb, *, feature: str, kind: str, title: str, body: str = "",
                 meta: dict = None, dedupe_key: str = None, level: str = "info") -> None:
    if dedupe_key and await sdb.notifications.find_one({"dedupe_key": dedupe_key}):
        return
    await sdb.notifications.insert_one({
        "feature": feature, "kind": kind, "title": title, "body": body,
        "meta": meta or {}, "level": level, "dedupe_key": dedupe_key or "",
        "read_by": [], "created_at": now_iso(),
    })


async def purge(sdb) -> None:
    await sdb.notifications.delete_many({"created_at": {"$lt": _cutoff()}})
