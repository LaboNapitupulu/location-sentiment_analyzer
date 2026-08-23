import gc
import re
import threading
from collections import Counter
from typing import Any

from config import settings


class ModelUnavailableError(RuntimeError):
    pass


_INDONESIAN_MARKERS = {
    "ada", "adalah", "aku", "anda", "bagus", "banget", "bersih", "bisa",
    "buruk", "dan", "dari", "dengan", "di", "enak", "ini", "itu", "juga",
    "karena", "ke", "kami", "kurang", "mantap", "makanan", "murah", "nyaman",
    "pelayanan", "ramah", "sangat", "saya", "sekali", "tempat", "tidak",
    "untuk", "yang",
}
_ENGLISH_MARKERS = {
    "and", "awful", "bad", "beautiful", "clean", "excellent", "food", "good",
    "great", "is", "location", "nice", "not", "place", "service", "staff",
    "the", "this", "very", "was", "with", "worst",
}


def detect_review_language(text: str) -> str:
    """Route clear Indonesian text locally and everything else multilingual."""
    words = re.findall(r"[a-z]+", str(text).casefold())
    indonesian_score = sum(word in _INDONESIAN_MARKERS for word in words)
    english_score = sum(word in _ENGLISH_MARKERS for word in words)
    if indonesian_score > 0 and indonesian_score >= english_score:
        return "id"
    return "multilingual"


class NLPAnalyzer:
    def __init__(self) -> None:
        self._pipeline: Any = None
        self._multilingual_pipeline: Any = None
        self._initialization_lock = threading.Lock()
        self._inference_lock = threading.Lock()
        self.is_ready = False
        self.is_multilingual_ready = False
        self.last_error: str | None = None
        self.multilingual_last_error: str | None = None
        self.last_language_counts = {"id": 0, "multilingual": 0}
        self.last_multilingual_fallback_count = 0

    def initialize_model(self) -> bool:
        if self.is_ready:
            return True

        with self._initialization_lock:
            if self.is_ready:
                return True
            print(f"Memuat model sentimen: {settings.model_id}")
            try:
                self._pipeline = self._load_pipeline(
                    settings.model_id,
                    settings.model_revision,
                )
                self.is_ready = True
                self.last_error = None
                print("Model sentimen siap.")
                return True
            except Exception as exc:
                self._pipeline = None
                self.is_ready = False
                self.last_error = f"{type(exc).__name__}: {exc}"
                print(f"Model sentimen gagal dimuat: {self.last_error}")
                return False

    @staticmethod
    def _load_pipeline(model_id: str, revision: str | None) -> Any:
        from transformers import pipeline

        kwargs: dict[str, Any] = {
            "task": "sentiment-analysis",
            "model": model_id,
        }
        if revision:
            kwargs["revision"] = revision
        return pipeline(**kwargs)

    def initialize_multilingual_model(self) -> bool:
        if self.is_multilingual_ready:
            return True
        with self._initialization_lock:
            if self.is_multilingual_ready:
                return True
            print(f"Memuat model sentimen multilingual: {settings.multilingual_model_id}")
            try:
                self._multilingual_pipeline = self._load_pipeline(
                    settings.multilingual_model_id,
                    settings.multilingual_model_revision,
                )
                self.is_multilingual_ready = True
                self.multilingual_last_error = None
                print("Model sentimen multilingual siap.")
                return True
            except Exception as exc:
                self._multilingual_pipeline = None
                self.is_multilingual_ready = False
                self.multilingual_last_error = f"{type(exc).__name__}: {exc}"
                print(
                    "Model sentimen multilingual gagal dimuat: "
                    f"{self.multilingual_last_error}"
                )
                return False

    def _run_pipeline(self, pipeline_instance: Any, texts: list[str]) -> list[dict[str, Any]]:
        with self._inference_lock:
            results = pipeline_instance(
                texts,
                truncation=True,
                max_length=512,
                batch_size=settings.model_batch_size,
            )
        if len(results) != len(texts):
            raise RuntimeError("Model mengembalikan jumlah hasil yang tidak sesuai.")
        return results

    def analyze_batch(self, reviews: list[str]) -> list[dict[str, Any]]:
        if not reviews:
            return []
        if not self.is_ready or self._pipeline is None:
            raise ModelUnavailableError(
                "Model sentimen belum siap. Periksa koneksi saat pengunduhan model "
                "atau konfigurasi SENTIMENT_MODEL_ID."
            )

        normalized = [str(review).strip() for review in reviews]
        groups = {"id": [], "multilingual": []}
        for index, text in enumerate(normalized):
            groups[detect_review_language(text)].append((index, text))

        self.last_language_counts = {
            language: len(items) for language, items in groups.items()
        }
        self.last_multilingual_fallback_count = 0
        ordered_results: list[dict[str, Any] | None] = [None] * len(normalized)
        try:
            if groups["id"]:
                id_results = self._run_pipeline(
                    self._pipeline,
                    [text for _, text in groups["id"]],
                )
                for (index, _), result in zip(groups["id"], id_results, strict=True):
                    ordered_results[index] = result

            if groups["multilingual"]:
                if self.initialize_multilingual_model():
                    multilingual_pipeline = self._multilingual_pipeline
                else:
                    multilingual_pipeline = self._pipeline
                    self.last_multilingual_fallback_count = len(groups["multilingual"])
                multilingual_results = self._run_pipeline(
                    multilingual_pipeline,
                    [text for _, text in groups["multilingual"]],
                )
                for (index, _), result in zip(
                    groups["multilingual"],
                    multilingual_results,
                    strict=True,
                ):
                    ordered_results[index] = result
        except Exception as exc:
            raise RuntimeError(f"Inferensi model gagal: {exc}") from exc

        if any(result is None for result in ordered_results):
            raise RuntimeError("Model tidak mengembalikan hasil untuk seluruh ulasan.")
        return [result for result in ordered_results if result is not None]

    def extract_keywords(
        self,
        reviews: list[str],
        top_n: int = 10,
    ) -> list[dict[str, int | str]]:
        stopwords = {
            "dan", "di", "ke", "dari", "untuk", "pada", "dengan", "oleh", "atau",
            "yang", "ini", "itu", "juga", "sudah", "belum",
            "saya", "aku", "kami", "kita", "kamu", "anda", "dia", "mereka", "nya",
            "ada", "bisa", "dapat", "harus", "mau", "akan", "punya", "perlu",
            "adalah", "merupakan", "menjadi", "sangat", "banget", "sekali", "lebih",
            "paling", "cukup", "agak", "lumayan", "sedikit", "banyak", "semua",
            "setiap", "beberapa", "ya", "yg", "yah", "nih", "deh", "sih", "loh",
            "kok", "pun", "saja", "lagi", "masih", "tetap", "saat", "ketika",
            "jadi", "karena", "kalau", "jika", "tapi", "namun", "walaupun", "meski",
            "hingga", "sampai", "tempat", "lokasi", "sini", "sana", "dalam", "luar",
            "hari", "kali", "waktu", "jam", "menit", "google", "maps",
        }

        all_words: list[str] = []
        negations = {"tidak", "tak", "bukan", "kurang"}
        for text in reviews:
            words = re.findall(r"\b[^\W\d_]{3,}\b", str(text).lower(), flags=re.UNICODE)
            for index, word in enumerate(words):
                if word in negations:
                    next_word = next(
                        (
                            candidate
                            for candidate in words[index + 1 : index + 3]
                            if candidate not in stopwords and candidate not in negations
                        ),
                        None,
                    )
                    if next_word:
                        all_words.append(f"{word} {next_word}")
                    continue
                if word not in stopwords:
                    all_words.append(word)

        counter = Counter(all_words)
        return [{"text": word, "value": count} for word, count in counter.most_common(top_n)]

    def cleanup(self) -> None:
        self._pipeline = None
        self._multilingual_pipeline = None
        self.is_ready = False
        self.is_multilingual_ready = False
        gc.collect()


nlp_analyzer = NLPAnalyzer()
