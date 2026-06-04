from collections.abc import Generator
from pathlib import Path

from app.core.config import settings
from app.storage.local_store import LocalStore

data_path = Path(settings.local_data_path)
if not data_path.is_absolute():
    data_path = Path(__file__).resolve().parents[2] / data_path

store = LocalStore(str(data_path))


def init_db() -> None:
    store.ensure_initialized()


def get_session() -> Generator[LocalStore, None, None]:
    yield store
