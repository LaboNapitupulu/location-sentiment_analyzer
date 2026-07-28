import unittest

from services.scraper import InvalidMapsInput, build_scrape_target


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


if __name__ == "__main__":
    unittest.main()
