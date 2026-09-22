"""
Lightweight SQLite-backed storage for the crowdsourcing loop described in
the paper's Section IV.A.3 ("Updating Detection by Crowdsourcing Phase"):
users report suspicious URLs -> queued for admin verification -> verified
rows get appended to a retrain dataset for the next training run.

This is intentionally simple (no ORM, no migrations) — swap for a real
database in production. It does NOT implement automatic periodic
retraining; that's a scheduling/ops concern outside this script's scope.
See api/main.py's /admin/retrain endpoint for a manual trigger instead.
"""

import json
import sqlite3
from datetime import datetime, timezone

from core import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    title TEXT,
    features_json TEXT NOT NULL,
    reporter_note TEXT,
    predicted_label INTEGER,
    predicted_probability REAL,
    verified INTEGER NOT NULL DEFAULT 0,
    verified_label INTEGER,
    created_at TEXT NOT NULL,
    verified_at TEXT
);
"""


def get_connection():
    conn = sqlite3.connect(config.DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute(SCHEMA)
    return conn


def insert_report(url: str, title: str, features: dict, reporter_note: str,
                   predicted_label: int, predicted_probability: float) -> int:
    conn = get_connection()
    cur = conn.execute(
        """INSERT INTO reports
           (url, title, features_json, reporter_note, predicted_label,
            predicted_probability, verified, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?)""",
        (url, title, json.dumps(features), reporter_note,
         predicted_label, predicted_probability,
         datetime.now(timezone.utc).isoformat()),
    )
    conn.commit()
    report_id = cur.lastrowid
    conn.close()
    return report_id


def list_pending() -> list:
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM reports WHERE verified = 0 ORDER BY created_at ASC"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_report(report_id: int):
    conn = get_connection()
    row = conn.execute("SELECT * FROM reports WHERE id = ?", (report_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def mark_verified(report_id: int, verified_label: int) -> bool:
    conn = get_connection()
    cur = conn.execute(
        """UPDATE reports SET verified = 1, verified_label = ?, verified_at = ?
           WHERE id = ?""",
        (verified_label, datetime.now(timezone.utc).isoformat(), report_id),
    )
    conn.commit()
    updated = cur.rowcount > 0
    conn.close()
    return updated


def append_to_retrain_csv(report_id: int):
    """
    Appends a verified report's features + verified label to the retrain
    dataset CSV, in the same raw-feature-name shape train.py expects
    (minus the one-hot expansion, which train.py re-derives from raw
    columns when it next runs). Call this after mark_verified().
    """
    import pandas as pd
    import os

    report = get_report(report_id)
    if report is None or not report["verified"]:
        raise ValueError(f"Report {report_id} not found or not verified")

    features = json.loads(report["features_json"])
    row = dict(features)
    row[config.URL_COL] = report["url"]
    row[config.TITLE_COL] = report["title"]
    row[config.LABEL_COL] = report["verified_label"]

    df_row = pd.DataFrame([row])
    write_header = not os.path.exists(config.RETRAIN_CSV_PATH)
    df_row.to_csv(config.RETRAIN_CSV_PATH, mode="a", header=write_header, index=False)
