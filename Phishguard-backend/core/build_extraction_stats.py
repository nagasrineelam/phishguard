"""
Precomputes real corpus statistics for two of feature_extractor.py's proxy
features, from the actual PhiUSIIL training CSV, instead of the hand-picked
heuristics used when these files are absent.

Run once after you have the dataset in place:
    python -m core.build_extraction_stats

Writes:
    artifacts/tld_legit_prob.pkl  — {tld: P(legitimate | tld), "__default__": ...}
    artifacts/char_freq.pkl       — {char: P(char | legitimate URL), "__default__": ...}

feature_extractor.py picks these up automatically on next import if present.
"""

import os
import pickle
from collections import Counter

import pandas as pd
import numpy as np

from core import config


def build_tld_legit_prob(df: pd.DataFrame) -> dict:
    grouped = df.groupby(config.TLD_COL)[config.LABEL_COL].agg(["mean", "count"])
    # shrink low-count TLDs toward the global rate so a TLD seen twice
    # doesn't get treated as confidently as one seen 50,000 times
    global_rate = df[config.LABEL_COL].mean()
    min_count = 20
    table = {}
    for tld, row in grouped.iterrows():
        if row["count"] >= min_count:
            table[tld] = float(row["mean"])
        else:
            weight = row["count"] / min_count
            table[tld] = float(weight * row["mean"] + (1 - weight) * global_rate)
    table["__default__"] = float(global_rate)
    return table


def build_char_freq(df: pd.DataFrame) -> dict:
    legit_urls = df.loc[df[config.LABEL_COL] == config.LABEL_LEGITIMATE, config.URL_COL].dropna()
    counter = Counter()
    total = 0
    for url in legit_urls:
        counter.update(url)
        total += len(url)
    if total == 0:
        raise ValueError("No legitimate URLs found — check LABEL_LEGITIMATE / LABEL_COL in config.py")
    freq = {c: n / total for c, n in counter.items()}
    freq["__default__"] = min(freq.values()) if freq else 0.0
    return freq


def main():
    if not os.path.exists(config.DATA_PATH):
        raise FileNotFoundError(
            f"Training CSV not found at {config.DATA_PATH}. Set PHIUSIIL_CSV_PATH "
            "or place the dataset at that path first."
        )

    print(f"Loading {config.DATA_PATH} ...")
    df = pd.read_csv(config.DATA_PATH)

    assert df[config.LABEL_COL].isin([config.LABEL_LEGITIMATE, config.LABEL_PHISHING]).all(), (
        "Unexpected label values — check config.LABEL_LEGITIMATE / LABEL_PHISHING"
    )

    tld_table = build_tld_legit_prob(df)
    char_table = build_char_freq(df)
    # Compute extraction caps (99.9th percentile) for continuous features
    # so the live extractor can clip extreme values that are out-of-distribution
    # relative to the training CSV (helps avoid huge scaled inputs).
    # Compute caps for all continuous features declared in config
    caps = {}
    for c in config.CONTINUOUS_COLS:
        if c in df.columns:
            try:
                # 99.9th percentile is used to clamp extreme outliers
                q = float(df[c].dropna().quantile(0.999))
                if np.isfinite(q):
                    caps[c] = max(q, 0.0)
            except Exception:
                continue

    caps_path = os.path.join(config.ARTIFACTS_DIR, "extraction_stats.pkl")
    with open(caps_path, "wb") as f:
        pickle.dump(caps, f)

    tld_path = os.path.join(config.ARTIFACTS_DIR, "tld_legit_prob.pkl")
    char_path = os.path.join(config.ARTIFACTS_DIR, "char_freq.pkl")

    with open(tld_path, "wb") as f:
        pickle.dump(tld_table, f)
    with open(char_path, "wb") as f:
        pickle.dump(char_table, f)
    print(f"Wrote extraction caps -> {caps_path}")

    print(f"Wrote {len(tld_table)} TLD entries -> {tld_path}")
    print(f"Wrote {len(char_table)} char entries -> {char_path}")
    print("feature_extractor.py will use these automatically on next import.")


if __name__ == "__main__":
    main()
