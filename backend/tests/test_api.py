import asyncio
import json
import unittest
from unittest.mock import patch

import httpx

import main


def _sse_payloads(response: httpx.Response) -> list[dict]:
    return [
        json.loads(line.removeprefix("data: "))
        for line in response.text.splitlines()
        if line.startswith("data: ")
    ]


class APITests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        main.app.state.job_semaphore = asyncio.Semaphore(1)
        main.app.state.rate_limiter = main.InMemoryRateLimiter(10, 60)
        main.app.state.places_rate_limiter = main.InMemoryRateLimiter(10, 60)

    async def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            transport=httpx.ASGITransport(app=main.app),
            base_url="http://testserver",
        )

    async def test_invalid_analysis_input_returns_structured_sse_error(self) -> None:
        async with await self._client() as client:
            response = await client.get("/api/analyze", params={"url": "not a map"})

        self.assertEqual(response.status_code, 200)
        payloads = _sse_payloads(response)
        self.assertEqual(payloads[-1]["code"], "INVALID_INPUT")
        self.assertTrue(payloads[-1]["error"])

    async def test_analysis_rate_limit_returns_429(self) -> None:
        main.app.state.rate_limiter = main.InMemoryRateLimiter(1, 60)
        async with await self._client() as client:
            first = await client.get("/api/analyze", params={"url": "not a map"})
            second = await client.get("/api/analyze", params={"url": "not a map"})

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 429)

    async def test_places_rate_limit_returns_429_without_external_request(self) -> None:
        main.app.state.places_rate_limiter = main.InMemoryRateLimiter(1, 60)
        params = {"q": "https://maps.app.goo.gl/example"}
        async with await self._client() as client:
            first = await client.get("/api/places/autocomplete", params=params)
            second = await client.get("/api/places/autocomplete", params=params)

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 429)

    async def test_cors_uses_configured_origin(self) -> None:
        origin = main.settings.cors_origins[0]
        async with await self._client() as client:
            response = await client.options(
                "/api/analyze",
                headers={
                    "Origin": origin,
                    "Access-Control-Request-Method": "GET",
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["access-control-allow-origin"], origin)

    async def test_complete_payload_reports_actual_translation_count(self) -> None:
        reviews = [
            {
                "review_id": "one",
                "author": "A***",
                "date": "kemarin",
                "rating": 5,
                "text": "Tempat sangat bagus",
            },
            {
                "review_id": "two",
                "author": "B***",
                "date": "kemarin",
                "rating": 1,
                "text": "The service was bad",
            },
        ]

        async def fake_scraper(*_args, **_kwargs):
            yield {
                "status": "done",
                "stage": "scrape_complete",
                "progress": 78,
                "data": reviews,
            }

        model_results = [
            {"label": "LABEL_0", "score": 0.95},
            {"label": "NEGATIVE", "score": 0.91},
        ]
        original_ready = main.nlp_analyzer.is_ready
        original_translation_ready = main.english_translator.is_ready
        main.nlp_analyzer.is_ready = True
        main.english_translator.is_ready = True
        main.nlp_analyzer.last_language_counts = {"id": 1, "multilingual": 1}
        main.nlp_analyzer.last_multilingual_fallback_count = 0
        try:
            with (
                patch.object(main, "scrape_google_maps_reviews", fake_scraper),
                patch.object(main.nlp_analyzer, "analyze_batch", return_value=model_results),
                patch.object(main.nlp_analyzer, "extract_keywords", return_value=[]),
                patch.object(
                    main.english_translator,
                    "translate_batch",
                    return_value=["A very good place", "The service was bad"],
                ),
            ):
                async with await self._client() as client:
                    response = await client.get(
                        "/api/analyze",
                        params={
                            "url": "https://www.google.com/maps/place/Test"
                        },
                    )
        finally:
            main.nlp_analyzer.is_ready = original_ready
            main.english_translator.is_ready = original_translation_ready

        payloads = _sse_payloads(response)
        completed = next(payload for payload in payloads if payload.get("stage") == "complete")
        self.assertEqual(completed["meta"]["translated_review_count"], 1)
        self.assertEqual(completed["meta"]["language_counts"]["multilingual"], 1)


if __name__ == "__main__":
    unittest.main()
