import asyncio
import os
from pathlib import Path

from playwright.async_api import async_playwright


PROJECT_ROOT = Path(__file__).resolve().parent.parent
PROFILE_DIR = Path(
    os.getenv("PLAYWRIGHT_USER_DATA_DIR", PROJECT_ROOT / ".browser-profile")
).resolve()


async def create_session() -> None:
    PROFILE_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Profil browser lokal: {PROFILE_DIR}")
    print(
        "Jendela Google Maps akan dibuka. Login secara manual jika Google menampilkan "
        "'tampilan terbatas'. Jangan memasukkan kata sandi ke terminal atau source code."
    )

    async with async_playwright() as playwright:
        context = await playwright.chromium.launch_persistent_context(
            user_data_dir=str(PROFILE_DIR),
            headless=False,
            locale="id-ID",
            timezone_id="Asia/Jakarta",
            viewport={"width": 1365, "height": 900},
        )
        page = context.pages[0] if context.pages else await context.new_page()
        await page.goto(
            "https://www.google.com/maps?hl=id",
            wait_until="domcontentloaded",
            timeout=60_000,
        )
        await asyncio.to_thread(
            input,
            "Setelah Maps dapat menampilkan ulasan, kembali ke terminal dan tekan Enter...",
        )
        await context.close()

    print("Sesi tersimpan. Set PLAYWRIGHT_USER_DATA_DIR=.browser-profile pada file .env.")


if __name__ == "__main__":
    asyncio.run(create_session())
