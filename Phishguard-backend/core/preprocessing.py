"""
Preprocessing functions shared between train.py (fitting on the full
dataset) and core/inference.py (applying already-fit transforms to a
single incoming request). Keeping this in one module means training and
serving can never silently drift apart.
"""

import re

import numpy as np
import pandas as pd
import tldextract
from sklearn.feature_selection import f_classif, chi2
from sklearn.preprocessing import MinMaxScaler
from sklearn.neighbors import NearestNeighbors
from imblearn.over_sampling import SMOTE
from tensorflow.keras.preprocessing.text import Tokenizer
from tensorflow.keras.preprocessing.sequence import pad_sequences

from core import config


# ===========================================================================
# Cleaning (Section IV.B.2)
# ===========================================================================
def strip_www(url: str) -> str:
    if not isinstance(url, str):
        return url
    return re.sub(r"^https?://www\.", "https://", url, flags=re.IGNORECASE)


def clean_ascii(text: str) -> str:
    if not isinstance(text, str):
        return ""
    return text.encode("ascii", errors="ignore").decode()


def get_registered_domain(url: str) -> str:
    """tldextract correctly handles multi-part TLDs (co.uk, gov.in, com.au)."""
    if not isinstance(url, str) or not url:
        return ""
    return tldextract.extract(url).domain


def clean_domain_text(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    if config.URL_COL in df.columns:
        df[config.URL_COL] = df[config.URL_COL].apply(strip_www).apply(clean_ascii)
    if config.TITLE_COL in df.columns:
        df[config.TITLE_COL] = df[config.TITLE_COL].apply(clean_ascii)
    df["MainDomain"] = df[config.URL_COL].apply(get_registered_domain)
    return df


def enforce_data_integrity(df: pd.DataFrame) -> pd.DataFrame:
    before = len(df)
    df = df.dropna(subset=[config.LABEL_COL])
    df = df.drop_duplicates()
    print(f"Data integrity: dropped {before - len(df)} rows (dupes / missing label)")
    return df


def bucket_top_n_tld(df: pd.DataFrame, top_n: int = config.TOP_N_TLDS,
                      allowed_values: list = None) -> pd.DataFrame:
    """
    During training, `allowed_values` is None and the top-N is computed
    from the data itself. During inference, `allowed_values` must be the
    exact set of TLD categories the one-hot encoder was fit on (i.e. the
    training-time top-N + 'other_tld'), so a single request is bucketed
    consistently with what the model saw.
    """
    df = df.copy()
    if config.TLD_COL not in df.columns:
        return df
    if allowed_values is None:
        allowed_values = df[config.TLD_COL].value_counts().nlargest(top_n).index
    df[config.TLD_COL] = df[config.TLD_COL].where(
        df[config.TLD_COL].isin(allowed_values), other="other_tld"
    )
    return df


def build_text_input(url: str, title: str = "") -> str:
    """
    Concatenates URL + Title into one string for the single text branch
    shown in the paper's Figure 3 (which has only one text InputLayer,
    even though the text describes both URL and Title as sequential
    inputs). This is an interpretation, not a stated fact.
    """
    return f"{url or ''} [TITLE] {title or ''}"


def build_text_input_series(df: pd.DataFrame) -> pd.Series:
    url = df[config.URL_COL].fillna("").astype(str) if config.URL_COL in df.columns else ""
    title = df[config.TITLE_COL].fillna("").astype(str) if config.TITLE_COL in df.columns else ""
    return (url + " [TITLE] " + title).astype(str)


# ===========================================================================
# Feature selection — TRAIN ONLY (never call this at inference time)
# ===========================================================================
def select_features_train_only(X_train: pd.DataFrame, y_train: pd.Series,
                                p_threshold: float = 0.05,
                                target_n_features: int = config.TARGET_N_FEATURES):
    X_train = X_train.drop(
        columns=[c for c in config.MANUAL_NOISY_DROP if c in X_train.columns],
        errors="ignore",
    )
    X_numeric = X_train.select_dtypes(include=[np.number]).fillna(0)

    scaler = MinMaxScaler()
    X_scaled = pd.DataFrame(
        scaler.fit_transform(X_numeric), columns=X_numeric.columns, index=X_numeric.index
    )

    is_binary = X_scaled.nunique() <= 2
    cat_cols = X_scaled.columns[is_binary]
    cont_cols = X_scaled.columns[~is_binary]

    anova_p = pd.Series(dtype=float)
    chi2_p = pd.Series(dtype=float)

    if len(cont_cols) > 0:
        _, p_vals = f_classif(X_scaled[cont_cols], y_train)
        anova_p = pd.Series(p_vals, index=cont_cols)
    if len(cat_cols) > 0:
        _, p_vals = chi2(X_scaled[cat_cols], y_train)
        chi2_p = pd.Series(p_vals, index=cat_cols)

    all_p = pd.concat([anova_p, chi2_p])
    selected = all_p[all_p < p_threshold].index.tolist()

    if len(selected) > target_n_features:
        selected = all_p.loc[selected].sort_values().head(target_n_features).index.tolist()

    print(f"Feature selection (train-only fit): {len(selected)} features retained")
    return selected


# ===========================================================================
# Class balancing — TRAIN ONLY
# ===========================================================================
def smote_with_text(X_num_train: pd.DataFrame, url_text_train: pd.Series, y_train: pd.Series):
    """
    SMOTE interpolates numeric feature vectors, so synthetic rows have no
    real URL string. Each synthetic row is assigned the URL text of its
    nearest REAL neighbor. Relies on imblearn returning original rows
    first, synthetic rows appended after — verify for your imblearn version.
    """
    sm = SMOTE(random_state=config.SEED)
    X_res, y_res = sm.fit_resample(X_num_train, y_train)

    n_original = len(X_num_train)
    n_synthetic = len(X_res) - n_original
    print(f"SMOTE: {n_original} original -> {len(X_res)} total ({n_synthetic} synthetic)")

    if n_synthetic > 0:
        nn = NearestNeighbors(n_neighbors=1).fit(X_num_train.values)
        synthetic_rows = X_res.iloc[n_original:].values
        _, nn_idx = nn.kneighbors(synthetic_rows)
        synthetic_text = url_text_train.iloc[nn_idx.flatten()].reset_index(drop=True)
        text_res = pd.concat(
            [url_text_train.reset_index(drop=True), synthetic_text], ignore_index=True
        )
    else:
        text_res = url_text_train.reset_index(drop=True)

    return X_res.reset_index(drop=True), text_res, pd.Series(y_res).reset_index(drop=True)


# ===========================================================================
# Tokenization
# ===========================================================================
def fit_tokenizer(train_texts: pd.Series) -> Tokenizer:
    tokenizer = Tokenizer(num_words=config.VOCAB_SIZE, char_level=True, oov_token="<OOV>")
    tokenizer.fit_on_texts(train_texts)
    return tokenizer


def texts_to_padded(texts, tokenizer: Tokenizer) -> np.ndarray:
    if isinstance(texts, str):
        texts = [texts]
    seqs = tokenizer.texts_to_sequences(texts)
    return pad_sequences(seqs, maxlen=config.MAX_URL_LEN, padding="post", truncating="post")
