#!/usr/bin/env python3
"""Use the actual vendored MIT-licensed tommhe14/CS2API Python HTTP client.

This queries bo3.gg for current/upcoming fixtures; it does not fake matches or
claim the API is reliable. Failure leaves the Node collector free to try its
own request and report a source problem. Raw responses are never committed.
"""
import asyncio
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "vendor" / "CS2API"))
from cs2api.api import CS2APIClient  # type: ignore


async def main() -> int:
    target = ROOT / "data" / "tmp" / "cs2_sdk_payload.json"
    client = CS2APIClient()
    params = {
        "scope": "widget-matches",
        "page[offset]": 0,
        "page[limit]": 100,
        "sort": "tier_rank,-start_date",
        "filter[matches.status][in]": "upcoming,current",
        "filter[matches.discipline_id][eq]": 1,
        "with": "teams,tournament,games,streams",
    }
    try:
        payload = await client._make_request("/matches", params)
        if not isinstance(payload, (dict, list)):
            raise ValueError("Unrecognized bo3 response type")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        print("CS2API actual upstream client: response received, payload root is",
              type(payload).__name__,
              "keys", list(payload)[:12] if isinstance(payload, dict) else "array length "+str(len(payload)))
        return 0
    except Exception as error:
        print("CS2API client could not retrieve fixtures:", str(error)[:400], file=sys.stderr)
        return 1
    finally:
        await client.close()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
