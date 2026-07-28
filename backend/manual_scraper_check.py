import asyncio
import argparse

from services.scraper import scrape_google_maps_reviews


async def run(location: str, max_reviews: int) -> None:
    print(f"=== Memeriksa scraper untuk: {location} ===")
    async for msg in scrape_google_maps_reviews(location, max_reviews=max_reviews):
        status = msg.get("status", "")
        print(f"  -> {status}")
        if "place" in msg:
            place = msg["place"]
            print(f"     Place: {place.get('display_name', '-')}")
            print(f"     Address: {place.get('formatted_address', '-')}")
            print(f"     Photo: {place.get('photo_url') or 'tidak tersedia'}")
        if "data" in msg:
            reviews = msg["data"]
            print(f"\n  SUCCESS! Got {len(reviews)} reviews.")
            for r in reviews[:3]:
                print(f"  [{r['rating']}*] {r['text'][:70]}...")
        if msg.get("error"):
            print(f"  ERROR: {status}")
            break


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "location",
        nargs="?",
        default="https://www.google.com/maps/place/Plaza+Indonesia",
    )
    parser.add_argument("--max-reviews", type=int, default=10)
    arguments = parser.parse_args()
    asyncio.run(run(arguments.location, arguments.max_reviews))
