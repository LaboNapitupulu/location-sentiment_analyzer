import unittest

from services.scraper import InvalidMapsInput, build_scrape_target, review_identity


class ScrapeTargetTests(unittest.TestCase):
    def test_location_name_is_rejected(self) -> None:
        with self.assertRaisesRegex(InvalidMapsInput, "official Google Maps link"):
            build_scrape_target("Plaza Indonesia Jakarta")

    def test_full_google_maps_url_is_accepted(self) -> None:
        value = "https://www.google.com/maps/place/Plaza+Indonesia"
        target = build_scrape_target(value)
        self.assertEqual(target.kind, "url")
        self.assertEqual(target.url, value)

    def test_short_maps_link_is_accepted(self) -> None:
        value = "https://maps.app.goo.gl/abc123"
        self.assertEqual(build_scrape_target(value).kind, "url")

    def test_url_without_scheme_is_normalized(self) -> None:
        value = "www.google.com/maps/place/Monas"
        self.assertEqual(build_scrape_target(value).url, f"https://{value}")

    def test_http_and_non_google_urls_are_rejected(self) -> None:
        for value in (
            "http://www.google.com/maps/place/Monas",
            "https://example.com/maps/place/Monas",
            "https://user:password@www.google.com/maps/place/Monas",
            "https://www.google.com/search?q=Monas",
        ):
            with self.subTest(value=value):
                with self.assertRaises(InvalidMapsInput):
                    build_scrape_target(value)

    def test_generated_review_identity_is_stable(self) -> None:
        review = {
            "review_id": None,
            "author": "A***",
            "date": "2 hari lalu",
            "rating": 4,
            "text": "  Tempat   sangat nyaman. ",
        }
        first = review_identity(review)
        second = review_identity({**review, "text": "tempat sangat nyaman."})
        self.assertEqual(first, second)
        self.assertTrue(first.startswith("generated-"))

    def test_google_review_id_takes_precedence(self) -> None:
        self.assertEqual(
            review_identity({"review_id": "google-review-123", "text": "Review"}),
            "google-review-123",
        )


if __name__ == "__main__":
    unittest.main()
