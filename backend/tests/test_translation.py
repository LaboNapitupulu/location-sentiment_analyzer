import unittest

from services.translation import is_probably_english, split_for_translation


class TranslationTests(unittest.TestCase):
    def test_detects_clear_english_reviews(self) -> None:
        self.assertTrue(is_probably_english("The service was excellent."))
        self.assertTrue(is_probably_english("This is a very nice place."))

    def test_does_not_treat_indonesian_as_english(self) -> None:
        self.assertFalse(is_probably_english("Tempatnya sangat nyaman dan bersih."))
        self.assertFalse(is_probably_english("Pelayanan bagus dan makanannya enak."))
        self.assertFalse(
            is_probably_english("The mall bagus dan sangat nyaman untuk keluarga.")
        )

    def test_splits_long_reviews_without_losing_words(self) -> None:
        text = (
            "Kalimat pertama sangat bagus. "
            "Kalimat kedua menjelaskan pelayanan yang ramah dan cepat."
        )
        chunks = split_for_translation(text, max_characters=35)
        self.assertGreater(len(chunks), 1)
        self.assertEqual(" ".join(chunks), text)


if __name__ == "__main__":
    unittest.main()
