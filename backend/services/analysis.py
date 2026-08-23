from typing import Any


SENTIMENT_LABELS = {
    "LABEL_0": "Positive",
    "LABEL_1": "Neutral",
    "LABEL_2": "Negative",
    "POSITIVE": "Positive",
    "NEUTRAL": "Neutral",
    "NEGATIVE": "Negative",
    "1 STAR": "Negative",
    "2 STARS": "Negative",
    "3 STARS": "Neutral",
    "4 STARS": "Positive",
    "5 STARS": "Positive",
}


def normalize_sentiment_label(label: str) -> str:
    normalized = str(label).strip().upper()
    if normalized in SENTIMENT_LABELS:
        return SENTIMENT_LABELS[normalized]
    raise ValueError(f"Label sentimen tidak dikenal: {label}")


def enrich_reviews(
    reviews: list[dict[str, Any]],
    model_results: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if len(reviews) != len(model_results):
        raise ValueError("Jumlah hasil model tidak sama dengan jumlah ulasan.")

    enriched: list[dict[str, Any]] = []
    for review, result in zip(reviews, model_results, strict=True):
        item = dict(review)
        item["sentiment"] = normalize_sentiment_label(result["label"])
        item["confidence"] = round(float(result["score"]), 6)
        enriched.append(item)
    return enriched


def build_statistics(reviews: list[dict[str, Any]]) -> dict[str, int]:
    counts = {"Positive": 0, "Negative": 0, "Neutral": 0}
    for review in reviews:
        sentiment = review.get("sentiment")
        if sentiment in counts:
            counts[sentiment] += 1
    return counts


def find_anomalies(reviews: list[dict[str, Any]]) -> list[dict[str, Any]]:
    anomalies = []
    for review in reviews:
        rating = review.get("rating")
        sentiment = review.get("sentiment")
        confidence = review.get("confidence")
        if not isinstance(rating, (int, float)):
            continue
        if not isinstance(confidence, (int, float)) or confidence < 0.7:
            continue
        if rating >= 4 and sentiment == "Negative":
            anomalies.append(review)
        elif rating <= 2 and sentiment == "Positive":
            anomalies.append(review)
    return anomalies
