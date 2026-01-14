"""Utility entry points for operational tasks (migrations, seeds)."""

from __future__ import annotations

import argparse
import pathlib
import sys
from typing import Iterable

import psycopg

from .config import load_config


def apply_sql_files(file_paths: Iterable[pathlib.Path]) -> None:
    """Execute the given SQL files sequentially within a single autocommitted session."""

    config = load_config()

    with psycopg.connect(config.database_dsn, autocommit=True) as conn:
        with conn.cursor() as cur:
            for file_path in file_paths:
                sql_text = file_path.read_text(encoding="utf-8")
                cur.execute(sql_text)


def main(argv: list[str] | None = None) -> int:
    """Entry point for management commands (currently only migrations)."""
    parser = argparse.ArgumentParser(description="App management tasks")
    subparsers = parser.add_subparsers(dest="command", required=True)

    migrate_parser = subparsers.add_parser("migrate", help="Apply SQL schema files")
    migrate_parser.add_argument(
        "paths",
        nargs="*",
        type=pathlib.Path,
        default=[pathlib.Path(__file__).resolve().parent.parent / "sql" / "001_base_schema.sql"],
        help="SQL files to execute in order",
    )

    args = parser.parse_args(argv)

    if args.command == "migrate":
        apply_sql_files(args.paths)
        return 0

    parser.error("Unknown command")
    return 1


if __name__ == "__main__":  # pragma: no cover - script entrypoint
    sys.exit(main())
