"""Durable family storage: SQLite for a persistent host, PostgreSQL for Vercel.

The PostgreSQL adapter deliberately serializes transactions per schema, matching
our small, invite-only control plane's SQLite write semantics across workers.
It is not intended as a high-throughput multi-region database architecture.
"""
from contextlib import contextmanager
import hashlib
import os
from pathlib import Path
import re
import sqlite3
from urllib.parse import urlsplit


def is_postgres(value):
    return value.startswith(('postgresql://', 'postgres://'))


class Row(dict):
    def __getitem__(self, key):
        return list(self.values())[key] if isinstance(key, int) else super().__getitem__(key)


class Cursor:
    def __init__(self, cursor):
        self.cursor = cursor

    def fetchone(self):
        value = self.cursor.fetchone()
        return Row(value) if value is not None else None

    def fetchall(self):
        return [Row(value) for value in self.cursor.fetchall()]

    def __iter__(self):
        for value in self.cursor:
            yield Row(value)


def postgres_sql(statement):
    # All statements are application-owned SQL, never input supplied by users.
    statement = statement.strip().rstrip(';')
    if statement == 'BEGIN IMMEDIATE':
        return 'SELECT 1'  # connect() already holds the transaction-wide lock.
    ignore = statement.startswith('INSERT OR IGNORE INTO ')
    if ignore:
        statement = statement.replace('INSERT OR IGNORE INTO ', 'INSERT INTO ', 1)
    if statement.startswith('CREATE TABLE'):
        statement = re.sub(r'\bREAL\b', 'DOUBLE PRECISION', statement)
    statement = statement.replace('?', '%s')
    return statement + (' ON CONFLICT DO NOTHING' if ignore else '')


class Connection:
    def __init__(self, db):
        self.db = db

    def execute(self, statement, values=()):
        import psycopg
        try:
            return Cursor(self.db.execute(postgres_sql(statement), values))
        except psycopg.IntegrityError:
            # Keep the existing API's duplicate-account handling, without
            # exposing SQL, connection strings or credentials in exceptions.
            raise sqlite3.IntegrityError('Family record conflict.') from None

    def executescript(self, script):
        for statement in script.split(';'):
            if statement.strip():
                self.execute(statement)


class Database:
    def __init__(self, location, schema='bluey_family'):
        self.location = str(location)
        self.postgres = is_postgres(self.location)
        if not re.fullmatch(r'[a-z][a-z0-9_]{0,62}', schema):
            raise ValueError('Invalid database schema.')
        self.schema = schema
        self.lock = int.from_bytes(hashlib.sha256(schema.encode()).digest()[:8], 'big', signed=True)
        if not self.postgres:
            Path(self.location).parent.mkdir(parents=True, exist_ok=True)

    @contextmanager
    def connect(self):
        if self.postgres:
            import psycopg
            from psycopg.rows import dict_row
            from psycopg import sql
            parsed = urlsplit(self.location)
            # Enforce encrypted connections for hosted databases. Tests may
            # explicitly use an unencrypted, disposable loopback database.
            options = {'connect_timeout': 5, 'row_factory': dict_row, 'prepare_threshold': None}
            if parsed.hostname not in {'localhost', '127.0.0.1', '::1'}:
                from psycopg.conninfo import conninfo_to_dict
                mode = conninfo_to_dict(self.location).get('sslmode', 'require')
                options['sslmode'] = mode if mode in {'verify-ca', 'verify-full'} else 'require'
            with psycopg.connect(self.location, **options) as db:
                db.execute("SET LOCAL statement_timeout = '8000ms'")
                db.execute("SET LOCAL lock_timeout = '5000ms'")
                db.execute('SELECT pg_advisory_xact_lock(%s)', (self.lock,))
                db.execute(sql.SQL('CREATE SCHEMA IF NOT EXISTS {}').format(sql.Identifier(self.schema)))
                db.execute(sql.SQL('SET LOCAL search_path TO {}').format(sql.Identifier(self.schema)))
                yield Connection(db)
                # psycopg's context commits on success and rolls back on errors.
        else:
            db = sqlite3.connect(self.location, timeout=5)
            db.row_factory = sqlite3.Row
            db.execute('PRAGMA foreign_keys=ON')
            os.chmod(self.location, 0o600)
            try:
                yield db
                db.commit()
            except BaseException:
                db.rollback()
                raise
            finally:
                db.close()
