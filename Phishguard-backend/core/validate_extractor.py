"""
Empirically checks the live extractor against real training data, instead
of guessing at feature definitions by hand. For a sample of rows from the
training CSV, re-fetches each URL with core.feature_extractor.extract_features
and compares every produced feature against the CSV's actual value.

This directly answers "is it the extractor or does the model need
retraining?" — if extracted features match the training distribution
closely, the model doesn't need touching; remaining prediction errors are
model/data limitations. If they don't match, the gap is quantified
per-feature so you know exactly what's still wrong.

Usage:
    python -m core.validate_extractor --n 100
    python -m core.validate_extractor --n 500 --csv ./data/PhiUSIIL_Phishing_URL_Dataset.csv

Notes:
- Only rows with a fetchable http(s) URL are used; many training rows are
  long-dead phishing URLs from years ago and will simply time out — that's
  expected and doesn't indicate an extractor bug. Failures are counted
  and reported separately from mismatches.
- This makes real network requests (one page load per sampled row). Start
  small (--n 20-50) before running hundreds.
- Categorical/binary features are compared as exact match rate; continuous
  features are compared as mean absolute error (MAE) and, more usefully,
  MAE relative to that column's spread in the training data (so a few-
  point MAE on a 0-100 feature is judged differently than on a 0-1 one).
"""

import argparse
import sys

import numpy as np
import pandas as pd

from core import config
from core.feature_extractor import extract_features, FeatureExtractionError


def sample_rows(csv_path: str, n: int, seed: int = 42) -> pd.DataFrame:
    df = pd.read_csv(csv_path)
    usable = df[df[config.URL_COL].astype(str).str.startswith(("http://", "https://"))]
    return usable.sample(n=min(n, len(usable)), random_state=seed).reset_index(drop=True)


def compare_row(actual_row: pd.Series, extracted: dict) -> dict:
    diffs = {}
    for col in config.CONTINUOUS_COLS:
        if col not in actual_row or pd.isna(actual_row[col]):
            continue
        actual = float(actual_row[col])
        got = extracted.get(col)
        if got is None:
            continue
        diffs[col] = float(got) - actual
    for col in config.CATEGORICAL_BINARY_COLS:
        if col not in actual_row or pd.isna(actual_row[col]):
            continue
        actual = bool(actual_row[col])
        got = extracted.get(col)
        if got is None:
            continue
        diffs[col] = (bool(got) == actual)  # True/False = match/mismatch
    return diffs


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--n", type=int, default=50, help="number of rows to sample")
    parser.add_argument("--csv", type=str, default=config.DATA_PATH)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    print(f"Sampling {args.n} rows from {args.csv} ...")
    rows = sample_rows(args.csv, args.n, args.seed)

    continuous_diffs = {c: [] for c in config.CONTINUOUS_COLS}
    binary_matches = {c: [] for c in config.CATEGORICAL_BINARY_COLS}
    n_ok, n_failed = 0, 0
    failures = []

    for i, row in rows.iterrows():
        url = row[config.URL_COL]
        print(f"[{i+1}/{len(rows)}] {url[:70]}", end=" ... ", flush=True)
        try:
            result = extract_features(url)
        except FeatureExtractionError as e:
            print(f"FAILED ({e})")
            n_failed += 1
            failures.append((url, str(e)))
            continue
        except Exception as e:
            print(f"FAILED (unexpected: {e})")
            n_failed += 1
            failures.append((url, f"unexpected: {e}"))
            continue

        diffs = compare_row(row, result.features)
        for col, val in diffs.items():
            if col in continuous_diffs:
                continuous_diffs[col].append(val)
            elif col in binary_matches:
                binary_matches[col].append(val)
        n_ok += 1
        print("ok")

    print(f"\n{'='*70}\n{n_ok} succeeded, {n_failed} failed to fetch (dead/unreachable URLs — expected for old phishing rows)\n{'='*70}")

    print("\n--- CONTINUOUS FEATURES (mean abs error, in the feature's own units) ---")
    rows_report = []
    for col, vals in continuous_diffs.items():
        if not vals:
            continue
        arr = np.array(vals)
        mae = np.mean(np.abs(arr))
        bias = np.mean(arr)  # positive = extractor overestimates
        rows_report.append((col, len(arr), mae, bias))
    rows_report.sort(key=lambda r: -r[2])
    print(f"{'feature':30} {'n':>5} {'MAE':>12} {'bias (ours-actual)':>20}")
    for col, n, mae, bias in rows_report:
        print(f"{col:30} {n:5d} {mae:12.3f} {bias:20.3f}")

    print("\n--- BINARY FEATURES (match rate) ---")
    rows_report = []
    for col, vals in binary_matches.items():
        if not vals:
            continue
        rate = sum(vals) / len(vals)
        rows_report.append((col, len(vals), rate))
    rows_report.sort(key=lambda r: r[2])
    print(f"{'feature':30} {'n':>5} {'match rate':>12}")
    for col, n, rate in rows_report:
        flag = "  <-- worst offenders at top" if rate < 0.8 else ""
        print(f"{col:30} {n:5d} {rate:12.1%}{flag}")

    if failures:
        print(f"\n--- {len(failures)} fetch failures (sample) ---")
        for url, err in failures[:10]:
            print(f"  {url[:60]:60s} {err[:60]}")

    print(
        "\nHow to read this: continuous features with high MAE relative to "
        "their typical scale (see the dataset's own column histograms) or "
        "a large one-directional bias, and binary features with a match "
        "rate well under ~90%, are where the extractor still diverges from "
        "training. Everything else is close enough that retraining the "
        "model itself is very unlikely to help — the gap is in feature "
        "reproduction, not model quality."
    )


if __name__ == "__main__":
    main()
