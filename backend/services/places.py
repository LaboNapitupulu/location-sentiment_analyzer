import re
import urllib.parse
from typing import Any

import httpx

from config import settings


PLACES_API_BASE = "https://places.googleapis.com/v1"
PLACE_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{5,200}$")
PHOTO_NAME_PATTERN = re.compile(
    r"^places/[A-Za-z0-9_-]{5,200}/photos/[A-Za-z0-9_-]{5,1000}$"
)
SESSION_TOKEN_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,36}$")


class PlacesAPIError(RuntimeError):
    pass


def google_maps_search_url(*parts: str) -> str:
    query = ", ".join(part.strip() for part in parts if part and part.strip())
    return (
        "https://www.google.com/maps/search/?api=1&"
        + urllib.parse.urlencode({"query": query})
    )


def _headers(field_mask: str) -> dict[str, str]:
    if not settings.google_maps_api_key:
        raise PlacesAPIError("Google Places API belum dikonfigurasi.")
    return {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": settings.google_maps_api_key,
        "X-Goog-FieldMask": field_mask,
    }


def _validate_session_token(session_token: str | None) -> str | None:
    if not session_token:
        return None
    if not SESSION_TOKEN_PATTERN.fullmatch(session_token):
        raise ValueError("Session token autocomplete tidak valid.")
    return session_token


def _raise_places_error(response: httpx.Response) -> None:
    if response.is_success:
        return
    if response.status_code in {401, 403}:
        raise PlacesAPIError(
            "Places API menolak API key. Pastikan Places API (New), billing, "
            "dan pembatasan key sudah dikonfigurasi."
        )
    if response.status_code == 429:
        raise PlacesAPIError("Kuota Places API sedang habis. Coba lagi nanti.")
    raise PlacesAPIError(
        f"Places API gagal merespons (HTTP {response.status_code})."
    )


def parse_autocomplete_response(payload: dict[str, Any]) -> list[dict[str, str]]:
    results: list[dict[str, str]] = []
    for suggestion in payload.get("suggestions", []):
        prediction = suggestion.get("placePrediction")
        if not isinstance(prediction, dict):
            continue
        place_id = prediction.get("placeId")
        if not place_id:
            resource_name = str(prediction.get("place", ""))
            place_id = resource_name.removeprefix("places/")
        if not isinstance(place_id, str) or not PLACE_ID_PATTERN.fullmatch(place_id):
            continue

        text = prediction.get("text") or {}
        structured = prediction.get("structuredFormat") or {}
        main = (structured.get("mainText") or {}).get("text")
        secondary = (structured.get("secondaryText") or {}).get("text")
        full_text = text.get("text")
        if not isinstance(full_text, str) or not full_text.strip():
            continue
        results.append(
            {
                "place_id": place_id,
                "text": full_text.strip(),
                "main_text": str(main or full_text).strip(),
                "secondary_text": str(secondary or "").strip(),
            }
        )
        if len(results) >= 5:
            break
    return results


async def autocomplete_places(
    query: str,
    session_token: str | None,
) -> list[dict[str, str]]:
    token = _validate_session_token(session_token)
    body: dict[str, Any] = {
        "input": query,
        "languageCode": settings.places_language_code,
        "regionCode": settings.places_region_code,
        "includedRegionCodes": [settings.places_region_code.lower()],
    }
    if token:
        body["sessionToken"] = token

    field_mask = ",".join(
        (
            "suggestions.placePrediction.place",
            "suggestions.placePrediction.placeId",
            "suggestions.placePrediction.text.text",
            "suggestions.placePrediction.structuredFormat.mainText.text",
            "suggestions.placePrediction.structuredFormat.secondaryText.text",
        )
    )
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                f"{PLACES_API_BASE}/places:autocomplete",
                headers=_headers(field_mask),
                json=body,
            )
    except httpx.RequestError as exc:
        raise PlacesAPIError("Tidak dapat terhubung ke Places API.") from exc
    _raise_places_error(response)
    return parse_autocomplete_response(response.json())


async def get_place_details(
    place_id: str,
    session_token: str | None,
) -> dict[str, Any]:
    if not PLACE_ID_PATTERN.fullmatch(place_id):
        raise ValueError("Place ID tidak valid.")
    token = _validate_session_token(session_token)
    params: dict[str, str] = {
        "languageCode": settings.places_language_code,
        "regionCode": settings.places_region_code,
    }
    if token:
        params["sessionToken"] = token

    field_mask = ",".join(
        (
            "id",
            "displayName",
            "formattedAddress",
            "googleMapsUri",
            "primaryTypeDisplayName",
            "photos",
        )
    )
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                f"{PLACES_API_BASE}/places/{urllib.parse.quote(place_id, safe='')}",
                headers=_headers(field_mask),
                params=params,
            )
    except httpx.RequestError as exc:
        raise PlacesAPIError("Tidak dapat terhubung ke Places API.") from exc
    _raise_places_error(response)
    payload = response.json()

    photo = next(
        (
            item
            for item in payload.get("photos", [])
            if isinstance(item, dict)
            and PHOTO_NAME_PATTERN.fullmatch(str(item.get("name", "")))
        ),
        None,
    )
    attributions = []
    if photo:
        for attribution in photo.get("authorAttributions", []):
            if not isinstance(attribution, dict):
                continue
            attributions.append(
                {
                    "display_name": str(
                        attribution.get("displayName") or "Kontributor Google Maps"
                    ),
                    "uri": str(attribution.get("uri") or ""),
                }
            )

    display_name = str((payload.get("displayName") or {}).get("text") or "")
    address = str(payload.get("formattedAddress") or "")
    google_maps_uri = str(payload.get("googleMapsUri") or "")
    analysis_value = google_maps_uri or google_maps_search_url(display_name, address)
    primary_type = str(
        (payload.get("primaryTypeDisplayName") or {}).get("text") or ""
    )
    return {
        "place_id": str(payload.get("id") or place_id),
        "display_name": display_name,
        "formatted_address": address,
        "primary_type": primary_type,
        "google_maps_uri": google_maps_uri,
        "analysis_value": analysis_value,
        "photo_name": str(photo.get("name")) if photo else None,
        "photo_attributions": attributions,
    }


async def get_place_photo(photo_name: str, max_width: int) -> tuple[bytes, str]:
    if not PHOTO_NAME_PATTERN.fullmatch(photo_name):
        raise ValueError("Nama resource foto tidak valid.")
    media_url = f"{PLACES_API_BASE}/{photo_name}/media"
    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            response = await client.get(
                media_url,
                headers={
                    "X-Goog-Api-Key": settings.google_maps_api_key,
                },
                params={"maxWidthPx": max_width},
            )
    except httpx.RequestError as exc:
        raise PlacesAPIError("Tidak dapat mengambil foto dari Places API.") from exc
    _raise_places_error(response)
    content_type = response.headers.get("content-type", "").split(";", 1)[0]
    if not content_type.startswith("image/"):
        raise PlacesAPIError("Places API tidak mengembalikan data gambar.")
    if len(response.content) > 8 * 1024 * 1024:
        raise PlacesAPIError("Ukuran foto lokasi melebihi batas aman.")
    return response.content, content_type
