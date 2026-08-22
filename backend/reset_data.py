"""One-time reset for the unified parties + category model. Keeps users and company settings."""
import asyncio
import os

from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / ".env")

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

DROP = [
    "vendors", "farmers", "companies", "parties", "products", "product_categories",
    "purchases", "sales", "ledger", "receipts", "credit_notes", "godowns",
    "counters", "cron_runs",
]


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    for name in DROP:
        await db[name].drop()
    print("dropped:", ", ".join(DROP))


asyncio.run(main())
