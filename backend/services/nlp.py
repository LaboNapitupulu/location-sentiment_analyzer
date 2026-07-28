import gc
import re
import threading
from collections import Counter
from typing import Any

from config import settings


class ModelUnavailableError(RuntimeError):
    pass


class NLPAnalyzer:
    def __init__(self) -> None:
        self._pipeline: Any = None
        self._inference_lock = threading.Lock()
        self.is_ready = False
        self.last_error: str | None = None

    def initialize_model(self) -> bool:
        if self.is_ready:
            return True

        print(f"Memuat model sentimen: {settings.model_id}")
        try:
            from transformers import pipeline

            kwargs: dict[str, Any] = {
                "task": "sentiment-analysis",
                "model": settings.model_id,
            }
            if settings.model_revision:
                kwargs["revision"] = settings.model_revision

            self._pipeline = pipeline(**kwargs)
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

    def analyze_batch(self, reviews: list[str]) -> list[dict[str, Any]]:
        if not reviews:
            return []
        if not self.is_ready or self._pipeline is None:
            raise ModelUnavailableError(
                "Model sentimen belum siap. Periksa koneksi saat pengunduhan model "
                "atau konfigurasi SENTIMENT_MODEL_ID."
            )

        normalized = [str(review).strip() for review in reviews]
        try:
            with self._inference_lock:
                results = self._pipeline(
                    normalized,
                    truncation=True,
                    max_length=512,
                    batch_size=settings.model_batch_size,
                )
        except Exception as exc:
            raise RuntimeError(f"Inferensi model gagal: {exc}") from exc

        if len(results) != len(normalized):
            raise RuntimeError("Model mengembalikan jumlah hasil yang tidak sesuai.")
        return results

    def extract_keywords(
        self,
        reviews: list[str],
        top_n: int = 10,
    ) -> list[dict[str, int | str]]:
        stopwords = {
            "dan", "di", "ke", "dari", "untuk", "pada", "dengan", "oleh", "atau",
            "yang", "ini", "itu", "juga", "sudah", "belum", "tidak", "tak", "bukan",
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
        for text in reviews:
            words = re.findall(r"\b[^\W\d_]{3,}\b", str(text).lower(), flags=re.UNICODE)
            all_words.extend(word for word in words if word not in stopwords)

        counter = Counter(all_words)
        return [{"text": word, "value": count} for word, count in counter.most_common(top_n)]

    def cleanup(self) -> None:
        self._pipeline = None
        self.is_ready = False
        gc.collect()


nlp_analyzer = NLPAnalyzer()
