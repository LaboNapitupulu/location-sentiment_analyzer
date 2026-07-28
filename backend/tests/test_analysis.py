import unittest

from services.analysis import (
    build_statistics,
    enrich_reviews,
    find_anomalies,
    normalize_sentiment_label,
)
from services.nlp import NLPAnalyzer


class AnalysisTests(unittest.TestCase):
    def test_model_label_mapping(self) -> None:
        self.assertEqual(normalize_sentiment_label("LABEL_0"), "Positive")
        self.assertEqual(normalize_sentiment_label("LABEL_1"), "Neutral")
        self.assertEqual(normalize_sentiment_label("LABEL_2"), "Negative")
        self.assertEqual(normalize_sentiment_label("negative"), "Negative")

    def test_unknown_model_label_is_not_silently_neutral(self) -> None:
        with self.assertRaises(ValueError):
            normalize_sentiment_label("UNKNOWN")

    def test_enrichment_statistics_and_anomalies(self) -> None:
        reviews = [
            {"text": "Buruk sekali", "rating": 5},
            {"text": "Sangat bagus", "rating": 1},
            {"text": "Biasa saja", "rating": None},
        ]
        results = [
            {"label": "LABEL_2", "score": 0.98},
            {"label": "LABEL_0", "score": 0.91},
            {"label": "LABEL_1", "score": 0.75},
        ]

        enriched = enrich_reviews(reviews, results)
        self.assertEqual(
            build_statistics(enriched),
            {"Positive": 1, "Negative": 1, "Neutral": 1},
        )
        self.assertEqual(len(find_anomalies(enriched)), 2)

    def test_keyword_extraction_handles_unicode(self) -> None:
        analyzer = NLPAnalyzer()
        keywords = analyzer.extract_keywords(
            ["Kafe nyaman, pelayanan ramah dan makanan enak."],
            top_n=3,
        )
        self.assertEqual([item["text"] for item in keywords], ["kafe", "nyaman", "pelayanan"])


if __name__ == "__main__":
    unittest.main()
