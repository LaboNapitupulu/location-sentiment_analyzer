import asyncio
import hashlib
import re
import traceback
import urllib.parse
from dataclasses import dataclass
from typing import Any, AsyncIterator

from playwright.async_api import (
    Browser,
    BrowserContext,
    Error as PlaywrightError,
    Locator,
    Page,
    Playwright,
    TimeoutError as PlaywrightTimeoutError,
    async_playwright,
)

from config import settings


REVIEW_BLOCK_SELECTOR = "div[data-review-id], div.jftiEf"
SEARCH_RESULT_SELECTOR = "a.hfpxzc, a[href*='/maps/place/']"
PLACE_HEADING_SELECTOR = "h1.DUwDvf, h1.fontHeadlineLarge"

REVIEW_TEXT_SELECTORS = (
    ".wiI7pd",
    ".MyEned span",
    "span[data-expandable-section]",
)

REVIEW_FEED_SELECTORS = (
    "div[role='feed']",
    "div.m6QErb.DxyBCb.kA9KIf.dS8AEf",
    "div.m6QErb.DxyBCb.kA9KIf",
)

SORT_BUTTON_SELECTORS = (
    "button[aria-label*='Urutkan ulasan']",
    "button[aria-label*='Sort reviews']",
    "button[data-value='Sort']",
)

GOOGLE_BASE_DOMAINS = {
    "google.com",
    "google.co.id",
    "google.co.uk",
    "google.com.au",
    "google.ca",
    "google.de",
    "google.fr",
    "google.co.jp",
    "google.co.kr",
    "google.com.sg",
    "google.com.my",
}

SHORT_MAP_HOSTS = {"maps.app.goo.gl", "goo.gl"}
GOOGLE_IMAGE_HOST_SUFFIXES = (
    ".googleusercontent.com",
    ".ggpht.com",
)
PLACE_TYPE_TRANSLATIONS = {
    "Bandara": "Airport",
    "Hotel": "Hotel",
    "Kafe": "Cafe",
    "Museum": "Museum",
    "Pusat Perbelanjaan": "Shopping mall",
    "Restoran": "Restaurant",
    "Rumah Sakit": "Hospital",
    "Sekolah": "School",
    "Taman": "Park",
    "Tempat Wisata": "Tourist attraction",
    "Universitas": "University",
}


class InvalidMapsInput(ValueError):
    pass


class ScrapeError(RuntimeError):
    pass


class LimitedViewError(ScrapeError):
    pass


@dataclass(frozen=True)
class ScrapeTarget:
    original: str
    url: str
    kind: str


def review_identity(review: dict[str, Any]) -> str:
    """Return a stable identity even when Google omits data-review-id."""
    review_id = str(review.get("review_id") or "").strip()
    if review_id:
        return review_id

    parts = (
        str(review.get("author") or "").strip().casefold(),
        str(review.get("date") or "").strip().casefold(),
        str(review.get("rating") or "").strip(),
        " ".join(str(review.get("text") or "").split()).casefold(),
    )
    digest = hashlib.sha256("\x1f".join(parts).encode("utf-8")).hexdigest()
    return f"generated-{digest[:24]}"


def _is_google_host(hostname: str) -> bool:
    host = hostname.lower().rstrip(".")
    if host in SHORT_MAP_HOSTS:
        return True
    for prefix in ("", "www.", "maps."):
        if host.startswith(prefix) and host.removeprefix(prefix) in GOOGLE_BASE_DOMAINS:
            return True
    return False


def build_scrape_target(value: str) -> ScrapeTarget:
    cleaned = value.strip()
    if len(cleaned) < 2:
        raise InvalidMapsInput("Paste a Google Maps place link.")
    if len(cleaned) > 2048:
        raise InvalidMapsInput("The input is too long.")

    if re.match(r"^(?:www\.|maps\.)?google\.", cleaned, flags=re.IGNORECASE):
        cleaned = f"https://{cleaned}"
    elif cleaned.lower().startswith(("maps.app.goo.gl/", "goo.gl/maps/")):
        cleaned = f"https://{cleaned}"

    parsed = urllib.parse.urlparse(cleaned)
    if parsed.scheme or parsed.netloc:
        if parsed.scheme.lower() != "https":
            raise InvalidMapsInput("The Google Maps link must use HTTPS.")
        if parsed.username or parsed.password:
            raise InvalidMapsInput("Links containing credentials are not allowed.")
        hostname = (parsed.hostname or "").lower()
        if not _is_google_host(hostname):
            raise InvalidMapsInput("Only official Google Maps links are allowed.")
        if hostname == "goo.gl" and not parsed.path.startswith("/maps"):
            raise InvalidMapsInput("That goo.gl link is not a Google Maps link.")
        if hostname not in SHORT_MAP_HOSTS and "/maps" not in parsed.path:
            raise InvalidMapsInput("The Google link does not point to Google Maps.")
        return ScrapeTarget(original=value, url=cleaned, kind="url")

    raise InvalidMapsInput(
        "The input must be an official Google Maps link, not a place name."
    )


def _safe_google_photo_url(value: str) -> str | None:
    cleaned = value.strip()
    if cleaned.startswith("//"):
        cleaned = f"https:{cleaned}"
    parsed = urllib.parse.urlparse(cleaned)
    hostname = (parsed.hostname or "").lower()
    if parsed.scheme != "https":
        return None
    if not any(hostname.endswith(suffix) for suffix in GOOGLE_IMAGE_HOST_SUFFIXES):
        return None
    return cleaned


async def _extract_place_preview(page: Page) -> dict[str, Any] | None:
    """Read lightweight place metadata already rendered by Google Maps."""
    try:
        raw = await page.evaluate(
            """() => {
                const text = (selector) => {
                    const element = document.querySelector(selector);
                    return element?.textContent?.trim() || "";
                };
                const attribute = (selector, name) =>
                    document.querySelector(selector)?.getAttribute(name)?.trim() || "";

                const imageSelectors = [
                    "button[jsaction*='heroHeaderImage'] img",
                    "button[jsaction*='pane.heroHeaderImage'] img",
                    "img[src*='googleusercontent.com']",
                    "img[src*='ggpht.com']",
                ];
                let photoUrl = "";
                for (const selector of imageSelectors) {
                    const image = document.querySelector(selector);
                    const candidate =
                        image?.currentSrc ||
                        image?.getAttribute("src") ||
                        image?.getAttribute("data-src") ||
                        "";
                    if (candidate) {
                        photoUrl = candidate;
                        break;
                    }
                }

                const addressElement = document.querySelector(
                    "button[data-item-id='address'], [data-item-id='address']"
                );
                const addressLabel =
                    addressElement?.getAttribute("aria-label")?.replace(
                        /^(Alamat|Address)\\s*:\\s*/i,
                        ""
                    ) || "";

                return {
                    displayName: text("h1.DUwDvf, h1.fontHeadlineLarge"),
                    address: addressLabel || addressElement?.textContent?.trim() || "",
                    primaryType: text(
                        "button[jsaction*='category'], button.DkEaL"
                    ),
                    photoUrl,
                    canonicalUrl:
                        attribute("link[rel='canonical']", "href") || window.location.href,
                };
            }"""
        )
    except Exception:
        return None

    display_name = str(raw.get("displayName") or "").strip()
    if not display_name:
        return None

    current_url = str(raw.get("canonicalUrl") or page.url).strip()
    if not current_url.startswith("https://"):
        current_url = page.url
    coordinate_match = re.search(
        r"@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)",
        page.url,
    )
    latitude = float(coordinate_match.group(1)) if coordinate_match else None
    longitude = float(coordinate_match.group(2)) if coordinate_match else None

    primary_type = str(raw.get("primaryType") or "").strip()
    return {
        "place_id": current_url,
        "display_name": display_name,
        "formatted_address": str(raw.get("address") or "").strip(),
        "primary_type": PLACE_TYPE_TRANSLATIONS.get(primary_type, primary_type),
        "google_maps_uri": current_url,
        "map_uri": current_url,
        "map_provider": "Google Maps",
        "analysis_value": current_url,
        "photo_url": _safe_google_photo_url(str(raw.get("photoUrl") or "")),
        "photo_attributions": [],
        "provider": "google",
        "data_attribution": "Google Maps",
        "latitude": latitude,
        "longitude": longitude,
    }


def _safe_status(
    status: str,
    *,
    stage: str,
    current: int | None = None,
    total: int | None = None,
    warning: bool = False,
    error: bool = False,
    code: str | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {"status": status, "stage": stage}
    if current is not None:
        payload["current"] = current
    if total is not None:
        payload["total"] = total
        payload["progress"] = round((current or 0) / max(total, 1) * 100)
    if warning:
        payload["warning"] = True
    if error:
        payload["error"] = True
    if code:
        payload["code"] = code
    return payload


async def _block_heavy_resources(route: Any, request: Any) -> None:
    if request.resource_type in {"image", "media", "font"}:
        await route.abort()
    else:
        await route.continue_()


async def _accept_google_consent(page: Page) -> None:
    labels = (
        "Terima semua",
        "Saya setuju",
        "Accept all",
        "I agree",
    )
    for label in labels:
        try:
            button = page.get_by_role("button", name=re.compile(label, re.IGNORECASE)).first
            if await button.is_visible(timeout=700):
                await button.click(timeout=3000)
                await page.wait_for_timeout(1000)
                return
        except Exception:
            continue


async def _wait_for_place_or_results(page: Page) -> None:
    try:
        await page.wait_for_selector(
            f"{PLACE_HEADING_SELECTOR}, {SEARCH_RESULT_SELECTOR}",
            timeout=15_000,
        )
    except PlaywrightTimeoutError:
        return


async def _has_place_heading(page: Page) -> bool:
    headings = page.locator(PLACE_HEADING_SELECTOR)
    for index in range(min(await headings.count(), 3)):
        heading = headings.nth(index)
        try:
            if await heading.is_visible(timeout=300) and (await heading.inner_text()).strip():
                return True
        except Exception:
            continue
    return False


def _query_from_maps_url(url: str) -> str | None:
    parsed = urllib.parse.urlparse(url)
    segments = [segment for segment in parsed.path.split("/") if segment]
    if "place" in segments:
        index = segments.index("place")
        if index + 1 < len(segments):
            query = urllib.parse.unquote_plus(segments[index + 1]).strip()
            if query:
                return query
    query_values = urllib.parse.parse_qs(parsed.query).get("query", [])
    if query_values and query_values[0].strip():
        return query_values[0].strip()
    return None


async def _navigate_with_retries(page: Page, url: str, attempts: int = 3) -> bool:
    retryable_markers = (
        "ERR_NETWORK_CHANGED",
        "ERR_CONNECTION_RESET",
        "ERR_CONNECTION_CLOSED",
        "ERR_TIMED_OUT",
        "ERR_NAME_NOT_RESOLVED",
    )
    last_error: Exception | None = None

    for attempt in range(1, attempts + 1):
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=60_000)
            return True
        except PlaywrightTimeoutError as exc:
            last_error = exc
            # Google Maps can keep network activity alive after the useful DOM
            # has loaded. Continue when navigation already reached Google Maps.
            current_host = (urllib.parse.urlparse(page.url).hostname or "").lower()
            if _is_google_host(current_host) and await page.locator("body").count() > 0:
                return False
        except PlaywrightError as exc:
            last_error = exc
            if not any(marker in str(exc) for marker in retryable_markers):
                raise

        if attempt < attempts:
            await page.wait_for_timeout(1000 * attempt)

    if last_error is not None:
        raise last_error
    return False


async def _select_first_place(page: Page) -> bool:
    if await _has_place_heading(page):
        return True

    results = page.locator(SEARCH_RESULT_SELECTOR)
    count = await results.count()
    for index in range(min(count, 5)):
        result = results.nth(index)
        try:
            if not await result.is_visible(timeout=800):
                continue
            await result.click(timeout=5000)
            try:
                await page.wait_for_selector(PLACE_HEADING_SELECTOR, timeout=12_000)
            except PlaywrightTimeoutError:
                await page.wait_for_timeout(1500)
            return await _has_place_heading(page)
        except Exception:
            continue
    return False


async def _reviews_are_visible(page: Page, timeout: int = 1500) -> bool:
    try:
        await page.wait_for_selector(REVIEW_BLOCK_SELECTOR, timeout=timeout)
        return True
    except PlaywrightTimeoutError:
        return False


async def _reviews_panel_is_open(page: Page) -> bool:
    review_tabs = page.locator(
        "button[role='tab'][aria-label*='Ulasan'], "
        "button[role='tab'][aria-label*='Reviews'], "
        "button[role='tab']:has-text('Ulasan'), "
        "button[role='tab']:has-text('Reviews')"
    )
    if await review_tabs.count() > 0:
        active_review_tab = False
        for index in range(min(await review_tabs.count(), 4)):
            tab = review_tabs.nth(index)
            try:
                aria_selected = await tab.get_attribute("aria-selected")
                class_name = await tab.get_attribute("class") or ""
                if aria_selected == "true" or "G7m0Af" in class_name.split():
                    active_review_tab = True
                    break
            except Exception:
                continue
        if not active_review_tab:
            # The summary tab embeds a few review previews and even a sort
            # control farther down the DOM. Do not mistake those previews for
            # the dedicated, scrollable reviews panel.
            return False

    if not await _reviews_are_visible(page, timeout=500):
        return False

    for selector in REVIEW_FEED_SELECTORS:
        candidates = page.locator(selector)
        for index in range(min(await candidates.count(), 5)):
            candidate = candidates.nth(index)
            try:
                if (
                    await candidate.is_visible(timeout=300)
                    and await candidate.locator(REVIEW_BLOCK_SELECTOR).count() > 0
                ):
                    return True
            except Exception:
                continue

    for selector in SORT_BUTTON_SELECTORS:
        try:
            if await page.locator(selector).first.is_visible(timeout=300):
                return True
        except Exception:
            continue
    return False


async def _wait_for_reviews_panel(page: Page, timeout_ms: int = 7000) -> bool:
    deadline = asyncio.get_running_loop().time() + timeout_ms / 1000
    while asyncio.get_running_loop().time() < deadline:
        if await _reviews_panel_is_open(page):
            return True
        await page.wait_for_timeout(250)
    return False


async def _is_limited_view(page: Page) -> bool:
    for selector in (
        "[aria-label*='tampilan terbatas' i]",
        "[aria-label*='limited view' i]",
        "[aria-label*='limited experience' i]",
    ):
        try:
            if await page.locator(selector).count() > 0:
                return True
        except Exception:
            continue

    patterns = (
        r"tampilan terbatas",
        r"limited view",
        r"limited experience",
    )
    for pattern in patterns:
        try:
            if await page.get_by_text(re.compile(pattern, re.IGNORECASE)).count() > 0:
                return True
        except Exception:
            continue
    return False


async def _debug_page_state(page: Page, label: str) -> None:
    if not settings.scraper_debug:
        return
    try:
        controls = await page.locator(
            "button, [role='button'], [role='tab'], a[href*='/maps/']"
        ).evaluate_all(
            """elements => elements.slice(0, 80).map(element => ({
                tag: element.tagName,
                text: (element.innerText || "").trim().replace(/\\s+/g, " ").slice(0, 120),
                aria: element.getAttribute("aria-label") || "",
                role: element.getAttribute("role") || "",
                jsaction: element.getAttribute("jsaction") || "",
                className: typeof element.className === "string" ? element.className : "",
            }))"""
        )
        print(f"[Scraper debug:{label}] URL={page.url}")
        for index, control in enumerate(controls):
            print(f"[Scraper debug:{label}] {index}: {control}")
        feeds = await page.locator("div[role='feed'], div.m6QErb").evaluate_all(
            """elements => elements.slice(0, 20).map(element => ({
                aria: element.getAttribute("aria-label") || "",
                role: element.getAttribute("role") || "",
                className: typeof element.className === "string" ? element.className : "",
                reviewCount: element.querySelectorAll("div[data-review-id], div.jftiEf").length,
                clientHeight: element.clientHeight,
                scrollHeight: element.scrollHeight,
                scrollTop: element.scrollTop,
            }))"""
        )
        for index, feed in enumerate(feeds):
            print(f"[Scraper debug:{label}] feed {index}: {feed}")
    except Exception as exc:
        print(f"[Scraper debug:{label}] gagal membaca DOM: {exc}")


async def _open_reviews_panel(page: Page) -> bool:
    if await _reviews_panel_is_open(page):
        return True

    selectors = (
        "button[jsaction*='reviewChart.moreReviews']",
        "button[aria-label*='Ulasan']",
        "button[aria-label*='ulasan']",
        "button[aria-label*='Reviews']",
        "button[aria-label*='reviews']",
        "button[role='tab']:has-text('Ulasan')",
        "button[role='tab']:has-text('Reviews')",
        "button:has-text('Lihat semua ulasan')",
        "button:has-text('See all reviews')",
        ".F7nice",
    )

    for selector in selectors:
        candidates = page.locator(selector)
        for index in range(min(await candidates.count(), 4)):
            candidate = candidates.nth(index)
            try:
                if not await candidate.is_visible(timeout=500):
                    continue
                await candidate.click(timeout=4000)
                if await _wait_for_reviews_panel(page):
                    return True
            except Exception:
                continue

    # Last-resort strategy for localized UI: click a visible control whose
    # accessible text contains "ulasan" or "reviews".
    for pattern in (r"\bulasan\b", r"\breviews?\b"):
        candidates = page.get_by_text(re.compile(pattern, re.IGNORECASE))
        for index in range(min(await candidates.count(), 6)):
            candidate = candidates.nth(index)
            try:
                if not await candidate.is_visible(timeout=400):
                    continue
                tag_name = await candidate.evaluate("(element) => element.tagName")
                if tag_name not in {"BUTTON", "A", "DIV"}:
                    continue
                await candidate.click(timeout=3000)
                if await _wait_for_reviews_panel(page, timeout_ms=5000):
                    return True
            except Exception:
                continue

    return False


async def _sort_reviews_newest(page: Page) -> bool:
    sort_button: Locator | None = None
    for selector in SORT_BUTTON_SELECTORS:
        candidate = page.locator(selector).first
        try:
            if await candidate.is_visible(timeout=700):
                sort_button = candidate
                break
        except Exception:
            continue

    if sort_button is None:
        return False

    try:
        await sort_button.click(timeout=3000)
        for label in ("Terbaru", "Newest", "Paling baru", "Most recent"):
            options = page.locator(
                "[role='menuitemradio'], [role='menuitem']"
            ).filter(has_text=re.compile(rf"^\s*{re.escape(label)}\s*$", re.IGNORECASE))
            for index in range(min(await options.count(), 4)):
                option = options.nth(index)
                try:
                    if await option.is_visible(timeout=700):
                        await option.click(timeout=3000)
                        try:
                            await page.wait_for_selector(
                                ", ".join(REVIEW_TEXT_SELECTORS),
                                state="visible",
                                timeout=8000,
                            )
                        except PlaywrightTimeoutError:
                            pass
                        return True
                except Exception:
                    continue
    except Exception:
        return False
    return False


async def _find_review_feed(page: Page) -> Locator | None:
    for selector in REVIEW_FEED_SELECTORS:
        candidates = page.locator(selector)
        for index in range(min(await candidates.count(), 5)):
            candidate = candidates.nth(index)
            try:
                if not await candidate.is_visible(timeout=500):
                    continue
                contains_reviews = await candidate.locator(REVIEW_BLOCK_SELECTOR).count()
                is_scrollable = await candidate.evaluate(
                    "(element) => element.scrollHeight > element.clientHeight + 50"
                )
                if contains_reviews or is_scrollable:
                    return candidate
            except Exception:
                continue
    return None


_EXTRACT_REVIEWS_JS = """
(args) => {
    let blocks = [...document.querySelectorAll(args.reviewSelector)];
    
    // Fallback for new Google Maps DOM where data-review-id / jftiEf is missing
    if (blocks.length === 0) {
        const stars = [...document.querySelectorAll("span[role='img'][aria-label*='bintang'], span[role='img'][aria-label*='star']")];
        blocks = stars.map(star => {
            let parent = star.parentElement;
            for (let i = 0; i < 8; i++) {
                if (!parent) break;
                // Review blocks usually contain date text and author text
                if (parent.tagName === 'DIV' && parent.innerText && parent.innerText.length > 15) {
                    const text = parent.innerText.toLowerCase();
                    if (text.includes('lalu') || text.includes('ago') || text.includes('baru ini')) {
                        // Return the topmost container that still looks like a single review (usually has a specific class length or isn't the whole feed)
                        if (parent.parentElement && parent.parentElement.children.length > 2) {
                             return parent;
                        }
                    }
                }
                parent = parent.parentElement;
            }
            return null;
        }).filter(Boolean);
        blocks = [...new Set(blocks)];
    }

    const results = [];
    const seenElements = new Set();

    for (const block of blocks) {
        if (seenElements.has(block)) continue;
        seenElements.add(block);

        let text = "";
        for (const selector of args.textSelectors) {
            const element = block.querySelector(selector);
            const candidate = element?.innerText?.trim() || "";
            if (candidate && !["Lainnya", "More"].includes(candidate)) {
                text = candidate;
                break;
            }
        }
        // Fallback for text if selectors fail (get the longest text block)
        if (!text) {
             const spans = [...block.querySelectorAll("span")];
             let longest = "";
             for (const span of spans) {
                 const t = span.innerText?.trim() || "";
                 if (t.length > longest.length && !t.includes("bintang") && !t.includes("star") && t.length > 10) {
                     longest = t;
                 }
             }
             if (longest.length > 15) text = longest;
        }
        if (!text) continue;

        const ratingElement = block.querySelector(
            "span[role='img'][aria-label*='bintang'], " +
            "span[role='img'][aria-label*='star'], " +
            "span.kvMYJc[aria-label], span[aria-label*='bintang'], span[aria-label*='star']"
        );
        const ratingLabel = ratingElement?.getAttribute("aria-label") || "";
        const ratingMatch = ratingLabel.match(/([1-5])(?:[.,]\\d+)?/);
        const rating = ratingMatch ? Number(ratingMatch[1]) : null;

        const authorElement = block.querySelector(".d4r55, [class*='fontHeadlineSmall']") || block.querySelector("div[class*='title'], div[class*='name']");
        const rawAuthor = authorElement?.innerText?.trim() || "Anonim";
        const author = rawAuthor === "Anonim"
            ? rawAuthor
            : rawAuthor.split(/\\s+/).map(part => {
                const characters = [...part];
                return characters.length > 1
                    ? characters[0] + "*".repeat(Math.min(characters.length - 1, 20))
                    : part;
            }).join(" ");

        const dateElement = block.querySelector(".rsqaWe") || block.querySelector("span:not([aria-label])");
        const date = dateElement?.innerText?.trim() || "";
        const idElement = block.matches("[data-review-id]")
            ? block
            : block.querySelector("[data-review-id]");
        const reviewId = idElement?.getAttribute("data-review-id") || null;

        results.push({
            review_id: reviewId,
            author,
            date,
            rating,
            text: text.slice(0, 5000),
        });
    }
    return results;
}
"""


async def _expand_visible_reviews(page: Page) -> None:
    try:
        await page.evaluate(
            """() => {
                const selectors = [
                    "button[aria-label='Lainnya']",
                    "button[aria-label='More']",
                    "button[jsaction*='expandReview']",
                    "button.w8nwRe",
                ];
                for (const selector of selectors) {
                    document.querySelectorAll(selector).forEach(button => {
                        if (button.offsetParent !== null) button.click();
                    });
                }
            }"""
        )
    except Exception:
        return


async def _scroll_feed(page: Page, feed: Locator | None) -> bool:
    try:
        if feed is not None:
            return bool(
                await feed.evaluate(
                    """element => {
                        const before = element.scrollTop;
                        element.scrollTop = element.scrollHeight;
                        element.dispatchEvent(new Event("scroll", { bubbles: true }));
                        return element.scrollTop > before || element.scrollHeight > element.clientHeight;
                    }"""
                )
            )
        return bool(
            await page.evaluate(
                """() => {
                    const candidates = [...document.querySelectorAll("div")]
                        .filter(element => element.scrollHeight > element.clientHeight + 200)
                        .sort((a, b) => b.scrollHeight - a.scrollHeight);
                    if (!candidates.length) return false;
                    candidates[0].scrollTop = candidates[0].scrollHeight;
                    candidates[0].dispatchEvent(new Event("scroll", { bubbles: true }));
                    return true;
                }"""
            )
        )
    except Exception:
        return False


async def _run_scraper(
    playwright: Playwright,
    target: ScrapeTarget,
    max_reviews: int,
) -> AsyncIterator[dict[str, Any]]:
    browser: Browser | None = None
    context: BrowserContext | None = None
    launch_args = ["--disable-setuid-sandbox", "--no-sandbox"] if settings.disable_browser_sandbox else []

    try:
        context_options = {
            "viewport": {"width": 1365, "height": 900},
            "user_agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/131.0.0.0 Safari/537.36"
            ),
            # Keep Google Maps in Indonesian so review text is collected in its
            # original form instead of Google's automatic English translation.
            "locale": "id-ID",
            "timezone_id": "Asia/Jakarta",
            "service_workers": "block",
        }
        if settings.playwright_user_data_dir:
            context = await playwright.chromium.launch_persistent_context(
                user_data_dir=settings.playwright_user_data_dir,
                headless=settings.playwright_headless,
                args=launch_args,
                **context_options,
            )
        else:
            browser = await playwright.chromium.launch(
                headless=settings.playwright_headless,
                args=launch_args,
            )
            context = await browser.new_context(**context_options)
        await context.route("**/*", _block_heavy_resources)
        page = await context.new_page()

        yield _safe_status("Opening Google Maps...", stage="navigate", current=5, total=100)
        try:
            fully_loaded = await _navigate_with_retries(page, target.url)
            if not fully_loaded:
                yield _safe_status(
                    "Google Maps is still loading some resources; continuing with the available page...",
                    stage="navigate",
                    current=10,
                    total=100,
                    warning=True,
                )
        except PlaywrightTimeoutError:
            yield _safe_status(
                "The page is loading slowly; attempting to continue...",
                stage="navigate",
                current=10,
                total=100,
                warning=True,
            )

        await _accept_google_consent(page)
        await _wait_for_place_or_results(page)

        final_host = (urllib.parse.urlparse(page.url).hostname or "").lower()
        if not _is_google_host(final_host) and final_host != "consent.google.com":
            raise ScrapeError("Google Maps redirected to a host that is not allowed.")

        if target.kind == "url" and not await _has_place_heading(page):
            fallback_query = _query_from_maps_url(target.url)
            if fallback_query:
                encoded_query = urllib.parse.quote(fallback_query, safe="")
                fallback_url = f"https://www.google.com/maps/search/{encoded_query}?hl=id"
                yield _safe_status(
                    "The link did not open place details directly; searching by place name...",
                    stage="location",
                    current=12,
                    total=100,
                    warning=True,
                )
                await _navigate_with_retries(page, fallback_url)
                await _wait_for_place_or_results(page)

        yield _safe_status("Selecting the place...", stage="location", current=15, total=100)
        selected = await _select_first_place(page)
        if not selected and not await _has_place_heading(page):
            raise ScrapeError(
                "No place was found from that link. Make sure it opens a place details "
                "page in Google Maps."
            )

        place_preview = await _extract_place_preview(page)
        preview_update = _safe_status(
            "Place found. Opening the reviews panel...",
            stage="location",
            current=18,
            total=100,
        )
        if place_preview:
            preview_update["place"] = place_preview
        yield preview_update

        yield _safe_status("Opening the reviews panel...", stage="reviews", current=20, total=100)
        await _debug_page_state(page, "before-reviews-panel")
        if not await _open_reviews_panel(page):
            await _debug_page_state(page, "reviews-panel")
            if await _is_limited_view(page):
                raise LimitedViewError(
                    "Google Maps is showing a limited view and hiding reviews. "
                    "Create a local session with google_maps_session.py, sign in once "
                    "in the browser window, then use PLAYWRIGHT_USER_DATA_DIR=.browser-profile."
                )
            raise ScrapeError(
                "The reviews panel could not be opened. The place may not have reviews, "
                "or the Google Maps interface may have changed."
            )

        if settings.sort_newest:
            sorted_newest = await _sort_reviews_newest(page)
            if sorted_newest:
                yield _safe_status(
                    "Reviews were sorted from newest to oldest.",
                    stage="reviews",
                    current=25,
                    total=100,
                )

        feed = await _find_review_feed(page)
        reviews: list[dict[str, Any]] = []
        seen_keys: set[str] = set()
        stagnant_rounds = 0
        max_stagnant_rounds = 12

        while len(reviews) < max_reviews and stagnant_rounds < max_stagnant_rounds:
            await _expand_visible_reviews(page)
            extracted = await page.evaluate(
                _EXTRACT_REVIEWS_JS,
                {
                    "reviewSelector": REVIEW_BLOCK_SELECTOR,
                    "textSelectors": REVIEW_TEXT_SELECTORS,
                },
            )

            new_count = 0
            for review in extracted:
                key = review_identity(review)
                if key in seen_keys:
                    continue
                seen_keys.add(key)
                review["review_id"] = key
                reviews.append(review)
                new_count += 1
                if len(reviews) >= max_reviews:
                    break

            stagnant_rounds = stagnant_rounds + 1 if new_count == 0 else 0
            current = min(len(reviews), max_reviews)
            progress_update = _safe_status(
                f"Collecting reviews ({current}/{max_reviews})...",
                stage="scrape",
                current=current,
                total=max_reviews,
            )
            progress_update["progress"] = 25 + round(current / max_reviews * 50)
            yield progress_update

            if current >= max_reviews:
                break

            did_scroll = await _scroll_feed(page, feed)
            if not did_scroll:
                stagnant_rounds += 1
            await page.wait_for_timeout(1500)

        final_reviews = reviews[:max_reviews]
        if not final_reviews:
            raise ScrapeError(
                "No review text could be read from that place."
            )

        warning = len(final_reviews) < max_reviews
        final_update = _safe_status(
            (
                f"Scraping complete: {len(final_reviews)} reviews found."
                if not warning
                else f"Only {len(final_reviews)} reviews were available or could be loaded."
            ),
            stage="scrape_complete",
            current=len(final_reviews),
            total=max_reviews,
            warning=warning,
        )
        final_update["progress"] = 78
        final_update["data"] = final_reviews
        yield final_update
    finally:
        if context is not None:
            try:
                await context.close()
            except Exception:
                pass
        if browser is not None:
            try:
                await browser.close()
            except Exception:
                pass


async def scrape_google_maps_reviews(
    value: str,
    max_reviews: int | None = None,
) -> AsyncIterator[dict[str, Any]]:
    requested_max = max(1, min(max_reviews or settings.max_reviews, settings.max_reviews))
    try:
        target = build_scrape_target(value)
    except InvalidMapsInput as exc:
        yield _safe_status(
            str(exc),
            stage="validation",
            error=True,
            code="INVALID_INPUT",
        )
        return

    yield _safe_status("Preparing the browser...", stage="starting", current=0, total=100)
    try:
        async with asyncio.timeout(settings.scrape_timeout_seconds):
            async with async_playwright() as playwright:
                async for update in _run_scraper(playwright, target, requested_max):
                    yield update
    except asyncio.TimeoutError:
        yield _safe_status(
            "Scraping timed out. Try again or use a different Google Maps place link.",
            stage="error",
            error=True,
            code="SCRAPE_TIMEOUT",
        )
    except asyncio.CancelledError:
        raise
    except LimitedViewError as exc:
        yield _safe_status(
            str(exc),
            stage="error",
            error=True,
            code="GOOGLE_LIMITED_VIEW",
        )
    except ScrapeError as exc:
        yield _safe_status(
            str(exc),
            stage="error",
            error=True,
            code="SCRAPE_FAILED",
        )
    except Exception:
        traceback.print_exc()
        yield _safe_status(
            "An error occurred while opening Google Maps. Check the connection and Chromium installation.",
            stage="error",
            error=True,
            code="BROWSER_ERROR",
        )
