import unittest

from services.analysis import (
    build_statistics,
    enrich_reviews,
    find_anomalies,
    normalize_sentiment_label,
)
from services.nlp import NLPAnalyzer, detect_review_language


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

    def test_keyword_extraction_preserves_negation_phrase(self) -> None:
        analyzer = NLPAnalyzer()
        keywords = analyzer.extract_keywords(["Pelayanan tidak ramah dan tidak cepat"])
        terms = [item["text"] for item in keywords]
        self.assertIn("tidak ramah", terms)
        self.assertIn("tidak cepat", terms)

    def test_low_confidence_rating_conflict_is_not_an_anomaly(self) -> None:
        reviews = [
            {
                "rating": 5,
                "sentiment": "Negative",
                "confidence": 0.55,
            }
        ]
        self.assertEqual(find_anomalies(reviews), [])

    def test_language_routing(self) -> None:
        self.assertEqual(detect_review_language("Tempatnya bagus dan nyaman"), "id")
        self.assertEqual(detect_review_language("The service was excellent"), "multilingual")
        self.assertEqual(detect_review_language("Très bon restaurant"), "multilingual")

    def test_analyzer_preserves_order_across_language_models(self) -> None:
        analyzer = NLPAnalyzer()
        analyzer._pipeline = lambda texts, **_: [
            {"label": "LABEL_0", "score": 0.9} for _ in texts
        ]
        analyzer._multilingual_pipeline = lambda texts, **_: [
            {"label": "negative", "score": 0.8} for _ in texts
        ]
        analyzer.is_ready = True
        analyzer.is_multilingual_ready = True

        results = analyzer.analyze_batch(
            ["The service was bad", "Tempat ini sangat bagus"]
        )

        self.assertEqual([result["label"] for result in results], ["negative", "LABEL_0"])
        self.assertEqual(analyzer.last_language_counts, {"id": 1, "multilingual": 1})


if __name__ == "__main__":
    unittest.main()
