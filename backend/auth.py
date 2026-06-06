"""SQLite-backed account and session helpers."""
from __future__ import annotations

import hashlib
import json
import os
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .config import settings

PROJECT_ROOT = Path(__file__).resolve().parent.parent


class AuthError(ValueError):
    pass


AVATAR_COLORS = (
    "#1abc9c", "#2ecc71", "#3498db", "#9b59b6",
    "#f39c12", "#e67e22", "#e74c3c", "#16a085",
    "#27ae60", "#2980b9", "#8e44ad", "#d35400",
)


def _db_path() -> Path:
    path = Path(settings.AUTH_DB_PATH)
    if not path.is_absolute():
        path = PROJECT_ROOT / path
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(_db_path())
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    with _connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                password_salt TEXT NOT NULL,
                avatar_color TEXT NOT NULL DEFAULT '#22c98a',
                created_at TEXT NOT NULL
            )
            """
        )
        columns = {row["name"] for row in conn.execute("PRAGMA table_info(users)")}
        if "avatar_color" not in columns:
            conn.execute("ALTER TABLE users ADD COLUMN avatar_color TEXT NOT NULL DEFAULT '#22c98a'")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS trips (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                summary TEXT NOT NULL,
                steps_json TEXT NOT NULL,
                plan_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_trips_user_id_created_at ON trips(user_id, created_at DESC)")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_username(username: str) -> str:
    value = (username or "").strip()
    if len(value) < 3:
        raise AuthError("Username must be at least 3 characters")
    if len(value) > 32:
        raise AuthError("Username cannot exceed 32 characters")
    return value


def _validate_password(password: str) -> str:
    value = password or ""
    if len(value) < 6:
        raise AuthError("Password must be at least 6 characters")
    if len(value) > 128:
        raise AuthError("Password cannot exceed 128 characters")
    return value


def _hash_password(password: str, salt_hex: str | None = None) -> tuple[str, str]:
    salt = bytes.fromhex(salt_hex) if salt_hex else os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 200_000)
    return digest.hex(), salt.hex()


def _avatar_color() -> str:
    return secrets.choice(AVATAR_COLORS)


def _public_user(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "username": row["username"],
        "avatar_color": row["avatar_color"] or "#22c98a",
        "created_at": row["created_at"],
    }


def create_session(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    with _connect() as conn:
        conn.execute(
            "INSERT INTO sessions(token, user_id, created_at) VALUES (?, ?, ?)",
            (token, user_id, _now()),
        )
    return token


def register_user(username: str, password: str) -> tuple[dict[str, Any], str]:
    username = _normalize_username(username)
    password = _validate_password(password)
    password_hash, salt = _hash_password(password)
    avatar_color = _avatar_color()
    try:
        with _connect() as conn:
            cursor = conn.execute(
                """
                INSERT INTO users(username, password_hash, password_salt, avatar_color, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (username, password_hash, salt, avatar_color, _now()),
            )
            user_id = int(cursor.lastrowid)
            row = conn.execute(
                "SELECT id, username, avatar_color, created_at FROM users WHERE id = ?",
                (user_id,),
            ).fetchone()
            user = _public_user(row) if row else None
    except sqlite3.IntegrityError as exc:
        raise AuthError("Username already exists") from exc
    if user is None:
        raise AuthError("Registration failed, please try again")
    return user, create_session(user["id"])


def login_user(username: str, password: str) -> tuple[dict[str, Any], str]:
    username = _normalize_username(username)
    password = password or ""
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE username = ? COLLATE NOCASE",
            (username,),
        ).fetchone()
    if row is None:
        raise AuthError("Invalid username or password")
    expected, _ = _hash_password(password, row["password_salt"])
    if not secrets.compare_digest(expected, row["password_hash"]):
        raise AuthError("Invalid username or password")
    return _public_user(row), create_session(int(row["id"]))


def get_user_by_id(user_id: int) -> dict[str, Any] | None:
    with _connect() as conn:
        row = conn.execute(
            "SELECT id, username, avatar_color, created_at FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
    return _public_user(row) if row else None


def get_user_by_token(token: str) -> dict[str, Any] | None:
    if not token:
        return None
    with _connect() as conn:
        row = conn.execute(
            """
            SELECT users.id, users.username, users.created_at
            , users.avatar_color
            FROM sessions
            JOIN users ON users.id = sessions.user_id
            WHERE sessions.token = ?
            """,
            (token,),
        ).fetchone()
    return _public_user(row) if row else None


def delete_session(token: str) -> None:
    if not token:
        return
    with _connect() as conn:
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))


def _trip_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "title": row["title"],
        "summary": row["summary"],
        "steps": json.loads(row["steps_json"] or "[]"),
        "plan": json.loads(row["plan_json"] or "{}"),
        "created_at": row["created_at"],
    }


def create_trip(user_id: int, title: str, summary: str, steps: list[str], plan: dict[str, Any]) -> dict[str, Any]:
    created_at = _now()
    with _connect() as conn:
        cursor = conn.execute(
            """
            INSERT INTO trips(user_id, title, summary, steps_json, plan_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                title.strip() or "未命名行程",
                summary.strip(),
                json.dumps(steps, ensure_ascii=False),
                json.dumps(plan, ensure_ascii=False),
                created_at,
            ),
        )
        row = conn.execute(
            "SELECT * FROM trips WHERE id = ? AND user_id = ?",
            (int(cursor.lastrowid), user_id),
        ).fetchone()
    return _trip_from_row(row)


def list_trips(user_id: int, limit: int = 20) -> list[dict[str, Any]]:
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT * FROM trips
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (user_id, max(1, min(limit, 50))),
        ).fetchall()
    return [_trip_from_row(row) for row in rows]
