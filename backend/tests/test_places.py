import unittest

from services.places import (
    PHOTO_NAME_PATTERN,
    SESSION_TOKEN_PATTERN,
    parse_autocomplete_response,
)


class PlacesTests(unittest.TestCase):
    def test_parses_and_limits_place_predictions(self) -> None:
        suggestions = []
        for index in range(7):
            suggestions.append(
                {
                    "placePrediction": {
                        "place": f"places/ChIJ_valid_place_{index}",
                        "placeId": f"ChIJ_valid_place_{index}",
                        "text": {"text": f"Lokasi {index}, Jakarta"},
                        "structuredFormat": {
                            "mainText": {"text": f"Lokasi {index}"},
                            "secondaryText": {"text": "Jakarta"},
                        },
                    }
                }
            )

        parsed = parse_autocomplete_response({"suggestions": suggestions})

        self.assertEqual(len(parsed), 5)
        self.assertEqual(parsed[0]["main_text"], "Lokasi 0")
        self.assertEqual(parsed[0]["secondary_text"], "Jakarta")

    def test_ignores_query_predictions_and_invalid_place_ids(self) -> None:
        parsed = parse_autocomplete_response(
            {
                "suggestions": [
                    {"queryPrediction": {"text": {"text": "Kafe Jakarta"}}},
                    {
                        "placePrediction": {
                            "placeId": "../../invalid",
                            "text": {"text": "Tidak aman"},
                        }
                    },
                ]
            }
        )
        self.assertEqual(parsed, [])

    def test_photo_name_and_session_token_validation_patterns(self) -> None:
        self.assertIsNotNone(
            PHOTO_NAME_PATTERN.fullmatch(
                "places/ChIJ_valid_place/photos/Aaw_valid_photo_reference"
            )
        )
        self.assertIsNone(
            PHOTO_NAME_PATTERN.fullmatch("https://example.com/photo.jpg")
        )
        self.assertIsNotNone(
            SESSION_TOKEN_PATTERN.fullmatch("550e8400-e29b-41d4-a716-446655440000")
        )
        self.assertIsNone(SESSION_TOKEN_PATTERN.fullmatch("token with spaces"))


if __name__ == "__main__":
    unittest.main()
