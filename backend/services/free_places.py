import html
import re
import time
import urllib.parse
from typing import Any

import httpx

from config import settings
from services.places import PlacesAPIError, google_maps_search_url


PHOTON_URL = "https://photon.komoot.io/api"
OSM_API_BASE = "https://api.openstreetmap.org/api/0.6"
WIKIDATA_ENTITY_BASE = "https://www.wikidata.org/wiki/Special:EntityData"
COMMONS_API_URL = "https://commons.wikimedia.org/w/api.php"
WIKIPEDIA_API_URLS = (
    "https://id.wikipedia.org/w/api.php",
    "https://en.wikipedia.org/w/api.php",
)
OSM_PLACE_ID_PATTERN = re.compile(r"^osm-([NWR])-(\d{1,20})$")
WIKIDATA_ID_PATTERN = re.compile(r"^Q\d{1,20}$")
_HTML_TAG_PATTERN = re.compile(r"<[^>]+>")
_CACHE_TTL_SECONDS = 300
_autocomplete_cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}


def _user_agent() -> str:
    return "GeoSentimentAnalyzer/1.1 (local educational application)"


def _plain_text(value: Any) -> str:
    return html.unescape(_HTML_TAG_PATTERN.sub("", str(value or ""))).strip()


def _join_unique(parts: list[Any]) -> str:
    result: list[str] = []
    seen: set[str] = set()
    for part in parts:
        cleaned = str(part or "").strip()
        normalized = cleaned.casefold()
        if cleaned and normalized not in seen:
            seen.add(normalized)
            result.append(cleaned)
    return ", ".join(result)


def _photon_feature_score(feature: dict[str, Any], query: str) -> float:
    properties = feature.get("properties") or {}
    name = str(properties.get("name") or "").casefold()
    searchable = _join_unique(
        [
            name,
            properties.get("district"),
            properties.get("city"),
            properties.get("state"),
            properties.get("country"),
        ]
    ).casefold()
    query_normalized = " ".join(query.casefold().split())
    query_tokens = set(re.findall(r"\w+", query_normalized))
    name_tokens = set(re.findall(r"\w+", name))
    overlap = len(query_tokens & name_tokens)
    score = overlap * 20 + (overlap / max(len(name_tokens), 1)) * 30
    if name == query_normalized:
        score += 1000
    elif name and name in query_normalized:
        score += 500 + len(name_tokens) * 10
    score += len(query_tokens & set(re.findall(r"\w+", searchable))) * 2
    return score


def parse_photon_response(
    payload: dict[str, Any],
    query: str = "",
) -> list[dict[str, Any]]:
    suggestions: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    features = [
        feature
        for feature in payload.get("features", [])
        if isinstance(feature, dict)
    ]
    if query:
        features.sort(
            key=lambda feature: _photon_feature_score(feature, query),
            reverse=True,
        )
    for feature in features:
        if not isinstance(feature, dict):
            continue
        properties = feature.get("properties") or {}
        geometry = feature.get("geometry") or {}
        coordinates = geometry.get("coordinates") or []
        osm_type = str(properties.get("osm_type") or "").upper()
        osm_id = properties.get("osm_id")
        name = str(properties.get("name") or "").strip()
        if osm_type not in {"N", "W", "R"} or not str(osm_id).isdigit() or not name:
            continue
        if (
            not isinstance(coordinates, list)
            or len(coordinates) < 2
            or not all(isinstance(value, (int, float)) for value in coordinates[:2])
        ):
            continue
        longitude, latitude = float(coordinates[0]), float(coordinates[1])
        if not (-180 <= longitude <= 180 and -90 <= latitude <= 90):
            continue

        place_id = f"osm-{osm_type}-{osm_id}"
        if place_id in seen_ids:
            continue
        seen_ids.add(place_id)

        street_line = " ".join(
            part
            for part in (
                str(properties.get("housenumber") or "").strip(),
                str(properties.get("street") or "").strip(),
            )
            if part
        )
        secondary = _join_unique(
            [
                street_line,
                properties.get("district"),
                properties.get("city"),
                properties.get("county"),
                properties.get("state"),
                properties.get("country"),
            ]
        )
        suggestions.append(
            {
                "place_id": place_id,
                "text": _join_unique([name, secondary]),
                "main_text": name,
                "secondary_text": secondary,
                "latitude": latitude,
                "longitude": longitude,
            }
        )
        if len(suggestions) >= 5:
            break
    return suggestions


async def autocomplete_free_places(query: str) -> list[dict[str, Any]]:
    cache_key = query.strip().casefold()
    cached = _autocomplete_cache.get(cache_key)
    if cached and time.monotonic() - cached[0] < _CACHE_TTL_SECONDS:
        return [dict(item) for item in cached[1]]

    params = {
        "q": query,
        # Photon relevance can place an exact venue below similarly named
        # landmarks. Fetch a bounded candidate pool and rank locally.
        "limit": 20,
        "countrycode": settings.places_region_code.lower(),
    }
    # The public Photon instance currently rejects unsupported language codes
    # such as "id" with HTTP 400. Omitting it preserves local OSM names.
    if settings.places_language_code in {"de", "en", "fr", "it"}:
        params["lang"] = settings.places_language_code
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                PHOTON_URL,
                params=params,
                headers={"User-Agent": _user_agent()},
            )
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise PlacesAPIError(
            "Layanan autocomplete gratis sedang tidak tersedia; input manual tetap dapat digunakan."
        ) from exc

    results = parse_photon_response(response.json(), query)
    if len(_autocomplete_cache) >= 100:
        oldest_key = min(_autocomplete_cache, key=lambda key: _autocomplete_cache[key][0])
        _autocomplete_cache.pop(oldest_key, None)
    _autocomplete_cache[cache_key] = (time.monotonic(), results)
    return [dict(item) for item in results]


async def _get_osm_tags(osm_type: str, osm_id: str) -> dict[str, str]:
    type_name = {"N": "node", "W": "way", "R": "relation"}[osm_type]
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                f"{OSM_API_BASE}/{type_name}/{osm_id}.json",
                headers={
                    "Accept": "application/json",
                    "User-Agent": _user_agent(),
                },
            )
        response.raise_for_status()
    except httpx.HTTPError:
        return {}
    elements = response.json().get("elements", [])
    if not elements or not isinstance(elements[0], dict):
        return {}
    tags = elements[0].get("tags") or {}
    return {
        str(key): str(value)
        for key, value in tags.items()
        if isinstance(key, str)
    }


async def _wikidata_image_filename(wikidata_id: str) -> str | None:
    if not WIKIDATA_ID_PATTERN.fullmatch(wikidata_id):
        return None
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                f"{WIKIDATA_ENTITY_BASE}/{wikidata_id}.json",
                headers={"User-Agent": _user_agent()},
            )
        response.raise_for_status()
        entity = response.json().get("entities", {}).get(wikidata_id, {})
        statements = entity.get("claims", {}).get("P18", [])
        return str(
            statements[0]["mainsnak"]["datavalue"]["value"]
        ).strip()
    except (httpx.HTTPError, KeyError, IndexError, TypeError):
        return None


async def _commons_photo(filename: str) -> dict[str, Any] | None:
    cleaned = filename.removeprefix("File:").strip()
    if not cleaned or cleaned.lower().startswith("category:"):
        return None
    params = {
        "action": "query",
        "format": "json",
        "formatversion": 2,
        "prop": "imageinfo",
        "titles": f"File:{cleaned}",
        "iiprop": "url|extmetadata",
        "iiurlwidth": 1200,
        "iiextmetadatafilter": "Artist|Credit|LicenseShortName|LicenseUrl",
        "iiextmetadatalanguage": settings.places_language_code,
    }
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            response = await client.get(
                COMMONS_API_URL,
                params=params,
                headers={"User-Agent": _user_agent()},
            )
        response.raise_for_status()
        pages = response.json().get("query", {}).get("pages", [])
        image_info = pages[0].get("imageinfo", [])[0]
    except (httpx.HTTPError, KeyError, IndexError, TypeError):
        return None

    photo_url = str(image_info.get("thumburl") or image_info.get("url") or "")
    parsed_url = urllib.parse.urlparse(photo_url)
    if parsed_url.scheme != "https" or parsed_url.hostname != "upload.wikimedia.org":
        return None
    metadata = image_info.get("extmetadata") or {}
    artist = _plain_text((metadata.get("Artist") or {}).get("value"))
    credit = _plain_text((metadata.get("Credit") or {}).get("value"))
    license_name = _plain_text(
        (metadata.get("LicenseShortName") or {}).get("value")
    )
    license_url = str((metadata.get("LicenseUrl") or {}).get("value") or "")
    return {
        "photo_url": photo_url,
        "photo_attributions": [
            {
                "display_name": artist or credit or "Kontributor Wikimedia Commons",
                "uri": str(image_info.get("descriptionurl") or ""),
                "license": license_name,
                "license_uri": license_url,
            }
        ],
    }


async def _wikipedia_image_filename(title: str) -> str | None:
    cleaned_title = title.strip()
    if not cleaned_title:
        return None
    params = {
        "action": "query",
        "format": "json",
        "formatversion": 2,
        "redirects": 1,
        "prop": "pageimages",
        "piprop": "name",
        "pilicense": "free",
        "titles": cleaned_title,
    }
    for api_url in WIKIPEDIA_API_URLS:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.get(
                    api_url,
                    params=params,
                    headers={"User-Agent": _user_agent()},
                )
            response.raise_for_status()
            pages = response.json().get("query", {}).get("pages", [])
            if not pages or pages[0].get("missing"):
                continue
            page_title = str(pages[0].get("title") or "")
            if page_title.casefold() != cleaned_title.casefold():
                continue
            filename = str(pages[0].get("pageimage") or "").strip()
            if filename:
                return filename
        except (httpx.HTTPError, KeyError, IndexError, TypeError):
            continue
    return None


async def get_free_place_details(
    place_id: str,
    *,
    latitude: float | None,
    longitude: float | None,
    fallback_name: str,
    fallback_address: str,
) -> dict[str, Any]:
    match = OSM_PLACE_ID_PATTERN.fullmatch(place_id)
    if not match:
        raise ValueError("Place ID OpenStreetMap tidak valid.")
    osm_type, osm_id = match.groups()
    tags = await _get_osm_tags(osm_type, osm_id)

    display_name = (
        tags.get("name:id")
        or tags.get("name")
        or fallback_name.strip()
        or "Lokasi OpenStreetMap"
    )
    address = _join_unique(
        [
            " ".join(
                part
                for part in (
                    tags.get("addr:housenumber", ""),
                    tags.get("addr:street", ""),
                )
                if part
            ),
            tags.get("addr:suburb"),
            tags.get("addr:city"),
            tags.get("addr:state"),
            tags.get("addr:postcode"),
            tags.get("addr:country"),
        ]
    ) or fallback_address.strip()

    photo_filename: str | None = None
    tagged_image = tags.get("wikimedia_commons") or tags.get("image")
    if tagged_image and (
        tagged_image.startswith("File:")
        or not urllib.parse.urlparse(tagged_image).scheme
    ):
        photo_filename = tagged_image
    if not photo_filename and tags.get("wikidata"):
        photo_filename = await _wikidata_image_filename(tags["wikidata"])
    if not photo_filename:
        photo_filename = await _wikipedia_image_filename(display_name)
    photo = await _commons_photo(photo_filename) if photo_filename else None

    type_name = {"N": "node", "W": "way", "R": "relation"}[osm_type]
    primary_type = (
        tags.get("tourism")
        or tags.get("amenity")
        or tags.get("shop")
        or tags.get("leisure")
        or tags.get("building")
        or ""
    ).replace("_", " ").title()
    result = {
        "place_id": place_id,
        "display_name": display_name,
        "formatted_address": address,
        "primary_type": primary_type,
        "map_uri": f"https://www.openstreetmap.org/{type_name}/{osm_id}",
        "map_provider": "OpenStreetMap",
        "analysis_value": google_maps_search_url(display_name, address),
        "photo_url": None,
        "photo_attributions": [],
        "provider": "openstreetmap",
        "data_attribution": "© OpenStreetMap contributors · Pencarian oleh Photon",
        "latitude": latitude,
        "longitude": longitude,
    }
    if photo:
        result.update(photo)
    return result
