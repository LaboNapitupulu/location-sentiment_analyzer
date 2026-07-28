"""Run an end-to-end API/SSE check without starting a separate web server."""

from __future__ import annotations

import argparse
import asyncio
import json

import httpx

from main import app


async def check_api(location: str) -> int:
    transport = httpx.ASGITransport(app=app)
    payloads: list[dict] = []
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
            timeout=360,
        ) as client:
            health = await client.get("/health")
            health.raise_for_status()

            async with client.stream(
                "GET",
                "/api/analyze",
                params={"url": location},
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    payload = json.loads(line.removeprefix("data: "))
                    payloads.append(payload)
                    print(
                        f"  -> {payload.get('stage', '?')}: "
                        f"{payload.get('status', '')}"
                    )

    errors = [payload for payload in payloads if payload.get("error")]
    completed = [payload for payload in payloads if payload.get("stage") == "complete"]
    if errors:
        print(f"ERROR: {errors[-1]}")
        return 1
    if not completed:
        print("ERROR: event SSE complete tidak ditemukan.")
        return 1

    final = completed[-1]
    reviews = final.get("reviews", [])
    stats = final.get("stats", {})
    print(
        "SUCCESS: "
        f"events={len(payloads)}, "
        f"reviews={len(reviews)}, "
        f"stats_total={sum(stats.values())}, "
        f"keywords={len(final.get('keywords', []))}, "
        f"anomalies={len(final.get('anomalies', []))}"
    )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("location", help="Nama lokasi atau tautan Google Maps")
    args = parser.parse_args()
    return asyncio.run(check_api(args.location))


if __name__ == "__main__":
    raise SystemExit(main())
