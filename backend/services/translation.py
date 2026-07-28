import gc
import re
import threading
from typing import Any

from config import settings


class TranslationUnavailableError(RuntimeError):
    pass


_ENGLISH_MARKERS = {
    "a", "an", "and", "are", "as", "at", "awesome", "bad", "be", "beautiful",
    "best", "but", "clean", "comfortable", "excellent", "food", "for", "from",
    "good", "great", "had", "has", "have", "here", "hotel", "i", "in", "is",
    "it", "location", "mall", "my", "nice", "not", "of", "on", "place", "really",
    "restaurant", "service", "staff", "the", "this", "to", "very", "was", "we",
    "were", "with", "worst", "you",
}
_INDONESIAN_MARKERS = {
    "ada", "adalah", "aku", "bagus", "banget", "bersih", "dan", "dari", "di",
    "enak", "ini", "itu", "juga", "karena", "ke", "lokasi", "makanan", "mall",
    "nyaman", "pelayanan", "sangat", "saya", "sekali", "staff", "tempat", "tidak",
    "untuk", "yang",
}


def is_probably_english(text: str) -> bool:
    words = re.findall(r"[a-z]+", text.casefold())
    if not words:
        return False
    english_score = sum(word in _ENGLISH_MARKERS for word in words)
    indonesian_score = sum(word in _INDONESIAN_MARKERS for word in words)
    return english_score >= 2 and indonesian_score == 0


def split_for_translation(text: str, max_characters: int = 320) -> list[str]:
    cleaned = " ".join(str(text).split())
    if not cleaned:
        return []
    sentences = [
        part.strip()
        for part in re.split(r"(?<=[.!?])\s+", cleaned)
        if part.strip()
    ]
    chunks: list[str] = []
    for sentence in sentences:
        if len(sentence) <= max_characters:
            chunks.append(sentence)
            continue
        words = sentence.split()
        current: list[str] = []
        current_length = 0
        for word in words:
            added_length = len(word) + (1 if current else 0)
            if current and current_length + added_length > max_characters:
                chunks.append(" ".join(current))
                current = [word]
                current_length = len(word)
            else:
                current.append(word)
                current_length += added_length
        if current:
            chunks.append(" ".join(current))
    return chunks


class EnglishTranslator:
    def __init__(self) -> None:
        self._tokenizer: Any = None
        self._model: Any = None
        self._inference_lock = threading.Lock()
        self.is_ready = False
        self.last_error: str | None = None

    def initialize_model(self) -> bool:
        if self.is_ready:
            return True

        print(f"Loading translation model: {settings.translation_model_id}")
        try:
            from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

            tokenizer_kwargs: dict[str, Any] = {}
            model_kwargs: dict[str, Any] = {}
            if settings.translation_model_revision:
                tokenizer_kwargs["revision"] = settings.translation_model_revision
                model_kwargs["revision"] = settings.translation_model_revision

            self._tokenizer = AutoTokenizer.from_pretrained(
                settings.translation_model_id,
                **tokenizer_kwargs,
            )
            self._model = AutoModelForSeq2SeqLM.from_pretrained(
                settings.translation_model_id,
                **model_kwargs,
            )
            self._model.eval()
            self.is_ready = True
            self.last_error = None
            print("English translation model is ready.")
            return True
        except Exception as exc:
            self._tokenizer = None
            self._model = None
            self.is_ready = False
            self.last_error = f"{type(exc).__name__}: {exc}"
            print(f"Translation model failed to load: {self.last_error}")
            return False

    def translate_batch(self, texts: list[str]) -> list[str]:
        if not texts:
            return []
        if not self.is_ready or self._tokenizer is None or self._model is None:
            raise TranslationUnavailableError(
                "The English translation model is not ready."
            )

        normalized = [str(text).strip() for text in texts]
        translated_chunks = [
            split_for_translation(text)
            for text in normalized
        ]
        pending_chunks = [
            (text_index, chunk_index, chunk)
            for text_index, chunks in enumerate(translated_chunks)
            for chunk_index, chunk in enumerate(chunks)
            if not is_probably_english(chunk)
        ]
        if not pending_chunks:
            return [" ".join(chunks) for chunks in translated_chunks]

        try:
            import torch

            with self._inference_lock, torch.inference_mode():
                for start in range(
                    0,
                    len(pending_chunks),
                    settings.translation_batch_size,
                ):
                    batch_metadata = pending_chunks[
                        start : start + settings.translation_batch_size
                    ]
                    batch = [metadata[2] for metadata in batch_metadata]
                    encoded = self._tokenizer(
                        batch,
                        return_tensors="pt",
                        padding=True,
                        truncation=True,
                        max_length=512,
                    )
                    generated = self._model.generate(
                        **encoded,
                        max_length=512,
                        num_beams=2,
                    )
                    decoded = self._tokenizer.batch_decode(
                        generated,
                        skip_special_tokens=True,
                    )
                    for metadata, text in zip(batch_metadata, decoded, strict=True):
                        text_index, chunk_index, _ = metadata
                        translated_chunks[text_index][chunk_index] = text.strip()
        except Exception as exc:
            raise RuntimeError(f"Translation inference failed: {exc}") from exc

        translated = [" ".join(chunks) for chunks in translated_chunks]
        if len(translated) != len(normalized):
            raise RuntimeError("The translation model returned an invalid result count.")
        return translated

    def cleanup(self) -> None:
        self._tokenizer = None
        self._model = None
        self.is_ready = False
        gc.collect()


english_translator = EnglishTranslator()
