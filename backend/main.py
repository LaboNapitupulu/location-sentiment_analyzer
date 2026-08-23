import asyncio
import gc
import json
import sys
import time
import urllib.parse
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse

from config import settings
from services.analysis import build_statistics, enrich_reviews, find_anomalies
from services.free_places import autocomplete_free_places, get_free_place_details
from services.nlp import ModelUnavailableError, nlp_analyzer
from services.places import (
    PlacesAPIError,
    autocomplete_places,
    get_place_details,
    get_place_photo,
)
from services.scraper import (
    InvalidMapsInput,
    build_scrape_target,
    scrape_google_maps_reviews,
)
from services.translation import english_translator


if sys.platform == "win32" and hasattr(asyncio, "WindowsProactorEventLoopPolicy"):
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())


class InMemoryRateLimiter:
    def __init__(self, limit: int, window_seconds: int) -> None:
        self.limit = limit
        self.window_seconds = window_seconds
        self._requests: dict[str, deque[float]] = defaultdict(deque)
        self._lock = asyncio.Lock()

    async def allow(self, key: str) -> bool:
        now = time.monotonic()
        cutoff = now - self.window_seconds
        async with self._lock:
            if len(self._requests) > 1_000:
                stale_keys = [
                    request_key
                    for request_key, timestamps in self._requests.items()
                    if not timestamps or timestamps[-1] < cutoff
                ]
                for stale_key in stale_keys:
                    self._requests.pop(stale_key, None)
            entries = self._requests[key]
            while entries and entries[0] < cutoff:
                entries.popleft()
            if len(entries) >= self.limit:
                return False
            entries.append(now)
            return True


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.job_semaphore = asyncio.Semaphore(settings.max_concurrent_jobs)
    app.state.rate_limiter = InMemoryRateLimiter(
        settings.rate_limit_requests,
        settings.rate_limit_window_seconds,
    )
    app.state.places_rate_limiter = InMemoryRateLimiter(
        settings.places_rate_limit_requests,
        settings.rate_limit_window_seconds,
    )
    await asyncio.to_thread(nlp_analyzer.initialize_model)
    yield
    nlp_analyzer.cleanup()
    english_translator.cleanup()


app = FastAPI(
    title="GeoSentiment Analyzer API",
    description="Real-time sentiment analysis for Google Maps reviews.",
    version="1.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=False,
    allow_methods=["GET", "OPTIONS"],
    allow_headers=["*"],
)


def _event(payload: dict) -> str:
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def _client_key(request: Request) -> str:
    return request.client.host if request.client else "unknown"


async def _enforce_places_rate_limit(request: Request) -> None:
    if not await app.state.places_rate_limiter.allow(_client_key(request)):
        raise HTTPException(
            status_code=429,
            detail="Terlalu banyak permintaan pencarian lokasi. Coba lagi sebentar.",
        )


@app.get("/")
async def root() -> dict[str, str]:
    return {"message": "GeoSentiment Analyzer API is running.", "version": app.version}


@app.get("/health")
async def health() -> dict:
    return {
        "status": "ready" if nlp_analyzer.is_ready else "degraded",
        "model_ready": nlp_analyzer.is_ready,
        "model_id": settings.model_id,
        "multilingual_model_ready": nlp_analyzer.is_multilingual_ready,
        "multilingual_model_id": settings.multilingual_model_id,
        "translation_ready": english_translator.is_ready,
        "translation_model_id": settings.translation_model_id,
        "max_concurrent_jobs": settings.max_concurrent_jobs,
        "places_configured": True,
        "places_provider": (
            "google" if settings.google_maps_api_key else "openstreetmap"
        ),
    }


@app.get("/api/places/autocomplete")
async def places_autocomplete(
    request: Request,
    query: str = Query(alias="q", min_length=3, max_length=160),
    session_token: str | None = Query(default=None, max_length=36),
) -> dict:
    await _enforce_places_rate_limit(request)
    if query.lstrip().lower().startswith(("http://", "https://", "www.")):
        return {
            "configured": True,
            "provider": (
                "google" if settings.google_maps_api_key else "openstreetmap"
            ),
            "suggestions": [],
        }
    try:
        if settings.google_maps_api_key:
            suggestions = await autocomplete_places(query.strip(), session_token)
            provider = "google"
        else:
            suggestions = await autocomplete_free_places(query.strip())
            provider = "openstreetmap"
        return {
            "configured": True,
            "provider": provider,
            "suggestions": suggestions,
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except PlacesAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/api/places/details/{place_id}")
async def place_details(
    request: Request,
    place_id: str,
    session_token: str | None = Query(default=None, max_length=36),
    latitude: float | None = Query(default=None, alias="lat", ge=-90, le=90),
    longitude: float | None = Query(default=None, alias="lon", ge=-180, le=180),
    place_name: str = Query(default="", alias="name", max_length=160),
    address: str = Query(default="", max_length=300),
) -> dict:
    await _enforce_places_rate_limit(request)
    try:
        if place_id.startswith("osm-"):
            return await get_free_place_details(
                place_id,
                latitude=latitude,
                longitude=longitude,
                fallback_name=place_name,
                fallback_address=address,
            )
        if not settings.google_maps_api_key:
            raise PlacesAPIError(
                "Detail Google Places membutuhkan GOOGLE_MAPS_API_KEY."
            )
        details = await get_place_details(place_id, session_token)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except PlacesAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    photo_name = details.pop("photo_name", None)
    details["map_uri"] = details.get("google_maps_uri", "")
    details["map_provider"] = "Google Maps"
    details["provider"] = "google"
    details["data_attribution"] = "Google"
    details["photo_url"] = (
        "/api/places/photo?"
        + urllib.parse.urlencode({"name": photo_name, "max_width": 1200})
        if photo_name
        else None
    )
    return details


@app.get("/api/places/photo", name="place_photo")
async def place_photo(
    request: Request,
    name: str = Query(min_length=10, max_length=1400),
    max_width: int = Query(default=1200, ge=100, le=1600),
) -> Response:
    await _enforce_places_rate_limit(request)
    if not settings.google_maps_api_key:
        raise HTTPException(status_code=503, detail="Places API belum dikonfigurasi.")
    try:
        content, content_type = await get_place_photo(name, max_width)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except PlacesAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return Response(
        content=content,
        media_type=content_type,
        headers={"Cache-Control": "private, max-age=3600"},
    )


@app.get("/api/analyze")
async def analyze_url(
    request: Request,
    value: str = Query(alias="url", min_length=2, max_length=2048),
) -> EventSourceResponse:
    validation_error: str | None = None
    try:
        build_scrape_target(value)
    except InvalidMapsInput as exc:
        validation_error = str(exc)

    client_key = _client_key(request)
    if not await app.state.rate_limiter.allow(client_key):
        raise HTTPException(
            status_code=429,
            detail=(
                "Terlalu banyak permintaan analisis. "
                f"Coba lagi setelah {settings.rate_limit_window_seconds} detik."
            ),
        )

    async def event_generator() -> AsyncIterator[str]:
        reviews_data: list[dict] = []
        scraper = None
        try:
            if validation_error:
                yield _event(
                    {
                        "status": validation_error,
                        "stage": "error",
                        "error": True,
                        "code": "INVALID_INPUT",
                    }
                )
                return

            yield _event(
                {
                    "status": "Waiting for an analysis slot...",
                    "stage": "queued",
                    "progress": 0,
                }
            )

            async with app.state.job_semaphore:
                if await request.is_disconnected():
                    return

                if not nlp_analyzer.is_ready:
                    yield _event(
                        {
                            "status": "Preparing the sentiment model...",
                            "stage": "model",
                            "progress": 2,
                        }
                    )
                    ready = await asyncio.to_thread(nlp_analyzer.initialize_model)
                    if not ready:
                        yield _event(
                            {
                                "status": (
                                    "The sentiment model could not be loaded. Ensure internet "
                                    "access is available on first use and check the model configuration."
                                ),
                                "stage": "error",
                                "error": True,
                                "code": "MODEL_UNAVAILABLE",
                            }
                        )
                        return

                scraper = scrape_google_maps_reviews(value, settings.max_reviews)
                async for update in scraper:
                    if await request.is_disconnected():
                        return

                    outgoing = dict(update)
                    extracted = outgoing.pop("data", None)
                    if extracted is not None:
                        reviews_data = extracted
                    yield _event(outgoing)

                    if outgoing.get("error"):
                        return

                if not reviews_data:
                    yield _event(
                        {
                            "status": "Google Maps did not return any reviews that could be analyzed.",
                            "stage": "error",
                            "error": True,
                            "code": "NO_REVIEWS",
                        }
                    )
                    return

                yield _event(
                    {
                        "status": f"Analyzing {len(reviews_data)} reviews with IndoBERT...",
                        "stage": "nlp",
                        "progress": 82,
                    }
                )

                texts = [str(review["text"]) for review in reviews_data]
                try:
                    model_results = await asyncio.to_thread(nlp_analyzer.analyze_batch, texts)
                    reviews_data = enrich_reviews(reviews_data, model_results)
                except ModelUnavailableError as exc:
                    yield _event(
                        {
                            "status": str(exc),
                            "stage": "error",
                            "error": True,
                            "code": "MODEL_UNAVAILABLE",
                        }
                    )
                    return
                except Exception as exc:
                    print(f"Sentiment analysis failed: {type(exc).__name__}: {exc}")
                    yield _event(
                        {
                            "status": "Sentiment analysis failed; fabricated results will not be shown.",
                            "stage": "error",
                            "error": True,
                            "code": "INFERENCE_FAILED",
                        }
                    )
                    return

                anomalies = find_anomalies(reviews_data)
                display_reviews: list[dict] = []
                for sentiment in ("Positive", "Negative"):
                    display_reviews.extend(
                        sorted(
                            (
                                review
                                for review in reviews_data
                                if review["sentiment"] == sentiment
                            ),
                            key=lambda review: review["confidence"],
                            reverse=True,
                        )[:5]
                    )
                display_reviews.extend(anomalies[:3])
                unique_display_reviews: list[dict] = []
                seen_review_objects: set[int] = set()
                for review in display_reviews:
                    object_id = id(review)
                    if object_id not in seen_review_objects:
                        seen_review_objects.add(object_id)
                        unique_display_reviews.append(review)

                yield _event(
                    {
                        "status": (
                            f"Translating {len(unique_display_reviews)} featured "
                            "reviews into English..."
                        ),
                        "stage": "translation",
                        "progress": 90,
                    }
                )
                translated_review_count = 0
                if not english_translator.is_ready:
                    await asyncio.to_thread(english_translator.initialize_model)
                if english_translator.is_ready:
                    try:
                        translations = await asyncio.to_thread(
                            english_translator.translate_batch,
                            [
                                str(review["text"])
                                for review in unique_display_reviews
                            ],
                        )
                        for review, translation in zip(
                            unique_display_reviews,
                            translations,
                            strict=True,
                        ):
                            review["translation_en"] = translation
                            if translation.strip() and translation.strip() != str(review["text"]).strip():
                                translated_review_count += 1
                    except Exception as exc:
                        print(f"English translation failed: {type(exc).__name__}: {exc}")
                        yield _event(
                            {
                                "status": (
                                    "English translation is temporarily unavailable; "
                                    "original reviews are still shown."
                                ),
                                "stage": "translation",
                                "progress": 94,
                                "warning": True,
                            }
                        )
                else:
                    yield _event(
                        {
                            "status": (
                                "English translation is temporarily unavailable; "
                                "original reviews are still shown."
                            ),
                            "stage": "translation",
                            "progress": 94,
                            "warning": True,
                        }
                    )

                yield _event(
                    {
                        "status": "Building statistics and keywords...",
                        "stage": "summary",
                        "progress": 97,
                    }
                )

                positive_texts = [
                    review["text"]
                    for review in reviews_data
                    if review["sentiment"] == "Positive"
                ]
                negative_texts = [
                    review["text"]
                    for review in reviews_data
                    if review["sentiment"] == "Negative"
                ]

                final_payload = {
                    "status": "Complete",
                    "stage": "complete",
                    "progress": 100,
                    "stats": build_statistics(reviews_data),
                    "reviews": reviews_data,
                    "anomalies": anomalies,
                    "keywords": nlp_analyzer.extract_keywords(texts),
                    "keyword_groups": {
                        "positive": nlp_analyzer.extract_keywords(positive_texts, top_n=8),
                        "negative": nlp_analyzer.extract_keywords(negative_texts, top_n=8),
                    },
                    "meta": {
                        "analyzed_count": len(reviews_data),
                        "requested_count": settings.max_reviews,
                        "model_id": settings.model_id,
                        "multilingual_model_id": settings.multilingual_model_id,
                        "language_counts": nlp_analyzer.last_language_counts,
                        "multilingual_fallback_count": (
                            nlp_analyzer.last_multilingual_fallback_count
                        ),
                        "translation_model_id": settings.translation_model_id,
                        "translated_review_count": translated_review_count,
                        "source": "Google Maps",
                        "stateless": True,
                    },
                }
                yield _event(final_payload)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            print(f"Analysis job failed: {type(exc).__name__}: {exc}")
            yield _event(
                {
                    "status": "An internal error occurred while processing the analysis.",
                    "stage": "error",
                    "error": True,
                    "code": "INTERNAL_ERROR",
                }
            )
        finally:
            if scraper is not None:
                try:
                    await scraper.aclose()
                except Exception:
                    pass
            reviews_data.clear()
            gc.collect()

    return EventSourceResponse(
        event_generator(),
        ping=15,
        headers={
            "Cache-Control": "no-cache, no-store",
            "X-Accel-Buffering": "no",
        },
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=settings.host, port=settings.port)
