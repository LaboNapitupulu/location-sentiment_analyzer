import os
from dataclasses import dataclass
from pathlib import Path


def _load_local_env() -> None:
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if not env_path.is_file():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


_load_local_env()


def _as_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _as_int(name: str, default: int, minimum: int = 1) -> int:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return max(minimum, int(value))
    except ValueError:
        return default


def _as_origins(value: str | None) -> tuple[str, ...]:
    if not value:
        return ("http://localhost:5173", "http://127.0.0.1:5173")
    return tuple(origin.strip().rstrip("/") for origin in value.split(",") if origin.strip())


def _as_optional_path(name: str) -> str | None:
    value = os.getenv(name)
    if not value:
        return None
    path = Path(value).expanduser()
    if not path.is_absolute():
        path = Path(__file__).resolve().parent.parent / path
    return str(path.resolve())


@dataclass(frozen=True)
class Settings:
    host: str = os.getenv("API_HOST", "127.0.0.1")
    port: int = _as_int("API_PORT", 8001)
    cors_origins: tuple[str, ...] = _as_origins(os.getenv("CORS_ORIGINS"))
    max_reviews: int = _as_int("MAX_REVIEWS", 100)
    scrape_timeout_seconds: int = _as_int("SCRAPE_TIMEOUT_SECONDS", 240, minimum=30)
    max_concurrent_jobs: int = _as_int("MAX_CONCURRENT_JOBS", 1)
    rate_limit_requests: int = _as_int("RATE_LIMIT_REQUESTS", 5)
    rate_limit_window_seconds: int = _as_int("RATE_LIMIT_WINDOW_SECONDS", 60)
    places_rate_limit_requests: int = _as_int("PLACES_RATE_LIMIT_REQUESTS", 60)
    playwright_headless: bool = _as_bool("PLAYWRIGHT_HEADLESS", True)
    disable_browser_sandbox: bool = _as_bool("PLAYWRIGHT_DISABLE_SANDBOX", False)
    scraper_debug: bool = _as_bool("SCRAPER_DEBUG", False)
    playwright_user_data_dir: str | None = _as_optional_path("PLAYWRIGHT_USER_DATA_DIR")
    sort_newest: bool = _as_bool("SORT_REVIEWS_NEWEST", True)
    model_id: str = os.getenv(
        "SENTIMENT_MODEL_ID",
        "mdhugol/indonesia-bert-sentiment-classification",
    )
    model_revision: str | None = os.getenv("SENTIMENT_MODEL_REVISION") or None
    model_batch_size: int = _as_int("MODEL_BATCH_SIZE", 8)
    multilingual_model_id: str = os.getenv(
        "MULTILINGUAL_SENTIMENT_MODEL_ID",
        "cardiffnlp/twitter-xlm-roberta-base-sentiment",
    )
    multilingual_model_revision: str | None = (
        os.getenv("MULTILINGUAL_SENTIMENT_MODEL_REVISION") or None
    )
    translation_model_id: str = os.getenv(
        "TRANSLATION_MODEL_ID",
        "Helsinki-NLP/opus-mt-id-en",
    )
    translation_model_revision: str | None = (
        os.getenv("TRANSLATION_MODEL_REVISION") or None
    )
    translation_batch_size: int = _as_int("TRANSLATION_BATCH_SIZE", 8)
    google_maps_api_key: str = os.getenv("GOOGLE_MAPS_API_KEY", "").strip()
    places_region_code: str = os.getenv("PLACES_REGION_CODE", "ID").strip().upper()
    places_language_code: str = os.getenv("PLACES_LANGUAGE_CODE", "id").strip()


settings = Settings()
