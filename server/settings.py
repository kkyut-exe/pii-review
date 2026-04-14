import os


APP_ENV = os.getenv("APP_ENV", "development").lower()


def get_required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"{name} environment variable is required")
    return value


def get_env(name: str, default: str, require_in_production: bool = False) -> str:
    value = os.getenv(name)
    if value:
        return value
    if require_in_production and APP_ENV == "production":
        raise RuntimeError(f"{name} environment variable is required in production")
    return default


def get_int_env(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or raw == "":
        return default
    return int(raw)


JWT_SECRET_KEY = get_env(
    "JWT_SECRET_KEY",
    default="dev-jwt-secret-key-change-me",
    require_in_production=True,
)
ACCESS_TOKEN_EXPIRE_MINUTES = get_int_env("ACCESS_TOKEN_EXPIRE_MINUTES", 60 * 8)

INITIAL_ADMIN_USERNAME = get_env(
    "INITIAL_ADMIN_USERNAME",
    default="admin",
    require_in_production=True,
)
INITIAL_ADMIN_PASSWORD = get_env(
    "INITIAL_ADMIN_PASSWORD",
    default="admin1234",
    require_in_production=True,
)
