from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Transport Operations Planner"
    api_prefix: str = "/api/v1"
    secret_key: str = "change-this-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 120
    local_data_path: str = "./data/local_store.json"
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
    cors_origin_regex: str = (
        r"https?://("
        r"localhost|127\.0\.0\.1|0\.0\.0\.0|"
        r"192\.168\.\d{1,3}\.\d{1,3}|"
        r"10\.\d{1,3}\.\d{1,3}\.\d{1,3}|"
        r"172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}|"
        r"[a-zA-Z0-9.-]+"
        r")(:\d+)?$"
    )
    operation_timezone: str = "America/Guatemala"
    operation_utc_offset_hours: int = -6

    depot_latitude: float = 14.6349
    depot_longitude: float = -90.5069
    average_speed_kmh: float = 38.0

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )


settings = Settings()
