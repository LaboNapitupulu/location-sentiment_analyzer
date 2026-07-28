import unittest

from services.free_places import OSM_PLACE_ID_PATTERN, parse_photon_response


class FreePlacesTests(unittest.TestCase):
    def test_parses_photon_features(self) -> None:
        parsed = parse_photon_response(
            {
                "features": [
                    {
                        "properties": {
                            "name": "Plaza Indonesia",
                            "street": "Jalan M.H. Thamrin",
                            "housenumber": "28",
                            "city": "Jakarta",
                            "state": "DKI Jakarta",
                            "country": "Indonesia",
                            "osm_type": "W",
                            "osm_id": 12345,
                        },
                        "geometry": {
                            "type": "Point",
                            "coordinates": [106.823, -6.193],
                        },
                    }
                ]
            }
        )

        self.assertEqual(len(parsed), 1)
        self.assertEqual(parsed[0]["place_id"], "osm-W-12345")
        self.assertEqual(parsed[0]["main_text"], "Plaza Indonesia")
        self.assertEqual(parsed[0]["latitude"], -6.193)
        self.assertIn("Jakarta", parsed[0]["secondary_text"])

    def test_ignores_invalid_or_duplicate_features(self) -> None:
        valid = {
            "properties": {
                "name": "Lokasi",
                "osm_type": "N",
                "osm_id": 10,
            },
            "geometry": {"coordinates": [106.8, -6.2]},
        }
        parsed = parse_photon_response(
            {
                "features": [
                    valid,
                    valid,
                    {
                        "properties": {"name": "Invalid", "osm_type": "X", "osm_id": 5},
                        "geometry": {"coordinates": [999, 999]},
                    },
                ]
            }
        )
        self.assertEqual(len(parsed), 1)

    def test_osm_place_id_pattern(self) -> None:
        self.assertIsNotNone(OSM_PLACE_ID_PATTERN.fullmatch("osm-R-123456"))
        self.assertIsNone(OSM_PLACE_ID_PATTERN.fullmatch("../../etc/passwd"))


if __name__ == "__main__":
    unittest.main()
