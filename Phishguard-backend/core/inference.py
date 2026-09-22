"""
Loads all training artifacts once and exposes a PredictionService used by
the API layer. Also exposes required_feature_schema(), which tells the
frontend exactly what raw fields it needs to collect from a user/feature-
extractor and in what shape — this is what api/main.py's /schema/features
endpoint returns.
"""

import os
import pickle
import re
import warnings

import numpy as np
import pandas as pd

# Force TensorFlow to CPU only in environments without CUDA drivers to
# avoid noisy startup errors like "failed call to cuInit". Also quiet
# TF logs a bit. This must be set before importing tensorflow.
os.environ.setdefault("CUDA_VISIBLE_DEVICES", "")
# 0 = all logs, 1 = INFO, 2 = WARNING, 3 = ERROR. Use 3 to suppress TF info/warning noise.
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")

import tensorflow as tf
from sklearn.exceptions import InconsistentVersionWarning

from core import config
from core import preprocessing as prep


class ArtifactsMissingError(RuntimeError):
    pass


class PredictionService:
    def __init__(self):
        for path in [config.MODEL_PATH, config.TOKENIZER_PATH, config.SCALER_PATH,
                     config.SELECTED_FEATURES_PATH]:
            if not os.path.exists(path):
                raise ArtifactsMissingError(
                    f"Missing artifact: {path}. Run `python train.py` first."
                )

        self.model = tf.keras.models.load_model(config.MODEL_PATH)

        # Unpickle artifacts while suppressing sklearn version warnings
        # that arise when a scaler was saved with a different scikit-learn
        # release than the runtime. It's best to retrain to regenerate
        # artifacts with a matching sklearn, but we suppress the warning
        # here to avoid noisy startup logs.
        with warnings.catch_warnings():
            warnings.filterwarnings("ignore", category=InconsistentVersionWarning)
            with open(config.TOKENIZER_PATH, "rb") as f:
                self.tokenizer = pickle.load(f)
            with open(config.SCALER_PATH, "rb") as f:
                self.scaler = pickle.load(f)
            with open(config.SELECTED_FEATURES_PATH, "rb") as f:
                self.selected_features = pickle.load(f)

        tld_path = os.path.join(config.ARTIFACTS_DIR, "tld_categories.pkl")
        onehot_path = os.path.join(config.ARTIFACTS_DIR, "onehot_columns.pkl")
        self.tld_categories = self._load_or_default(tld_path, ["other_tld"])
        self.onehot_columns = self._load_or_default(onehot_path, [])
        # Optional: dataset-derived extraction caps (99.9th percentile)
        caps_path = os.path.join(config.ARTIFACTS_DIR, "extraction_stats.pkl")
        self.extraction_caps = self._load_or_default(caps_path, {})

        print(f"PredictionService ready. {len(self.selected_features)} features expected.")

    @staticmethod
    def _load_or_default(path, default):
        if os.path.exists(path):
            with open(path, "rb") as f:
                return pickle.load(f)
        return default

    # -----------------------------------------------------------------
    # Feature schema introspection — this is what the frontend consumes
    # to know which raw inputs to collect and render.
    # -----------------------------------------------------------------
    def required_feature_schema(self) -> list:
        """
        Maps the model's internal (possibly one-hot-expanded) selected
        feature names back to the RAW fields a client needs to submit.
        Returns a list of dicts like:
            {"name": "URLSimilarityIndex", "type": "float"}
            {"name": "IsHTTPS", "type": "boolean"}
            {"name": "TLD", "type": "enum", "options": ["com", "org", ...]}
        """
        schema = {}

        for feat in self.selected_features:
            if feat in config.CONTINUOUS_COLS:
                schema[feat] = {"name": feat, "type": "float"}
                continue

            matched_binary = False
            for bcol in config.CATEGORICAL_BINARY_COLS:
                if feat == bcol or re.fullmatch(rf"{re.escape(bcol)}_\d+", feat):
                    schema[bcol] = {"name": bcol, "type": "boolean"}
                    matched_binary = True
                    break
            if matched_binary:
                continue

            if feat.startswith(f"{config.TLD_COL}_") or feat == config.TLD_COL:
                schema[config.TLD_COL] = {
                    "name": config.TLD_COL, "type": "enum",
                    "options": self.tld_categories,
                }
                continue

            # Fallback: unrecognized feature name, expose as raw float
            schema[feat] = {"name": feat, "type": "float"}

        # Always required regardless of feature selection outcome, since
        # they drive the text branch:
        text_fields = [
            {"name": config.URL_COL, "type": "string", "required": True},
            {"name": config.TITLE_COL, "type": "string", "required": False},
        ]
        return text_fields + sorted(schema.values(), key=lambda d: d["name"])

    # -----------------------------------------------------------------
    # Encoding a single raw request into the model's expected input
    # -----------------------------------------------------------------
    def _encode_numeric_row(self, raw_features: dict) -> pd.DataFrame:
        row = dict(raw_features)  # shallow copy

        # Apply dataset-derived caps to any continuous features supplied
        if getattr(self, 'extraction_caps', None):
            for c in config.CONTINUOUS_COLS:
                if c in row and c in self.extraction_caps:
                    try:
                        val = float(row[c])
                        cap = float(self.extraction_caps[c])
                        if val > cap:
                            row[c] = cap
                    except Exception:
                        # if conversion fails, leave the raw value and let later
                        # type coercion handle it (will default to 0)
                        pass

        tld_val = row.get(config.TLD_COL, "other_tld")
        if tld_val not in self.tld_categories:
            tld_val = "other_tld" if "other_tld" in self.tld_categories else self.tld_categories[0]
        row[config.TLD_COL] = tld_val

        for bcol in config.CATEGORICAL_BINARY_COLS:
            if bcol in row:
                row[bcol] = int(bool(row[bcol]))

        df = pd.DataFrame([row])

        cat_cols_present = [config.TLD_COL] + [
            c for c in config.CATEGORICAL_BINARY_COLS if c in df.columns
        ]
        if config.TLD_COL in df.columns:
            df[config.TLD_COL] = pd.Categorical(df[config.TLD_COL], categories=self.tld_categories)
        for bcol in config.CATEGORICAL_BINARY_COLS:
            if bcol in df.columns:
                df[bcol] = pd.Categorical(df[bcol], categories=[0, 1])

        encoded = pd.get_dummies(df, columns=cat_cols_present, drop_first=True)

        # Make sure every column the scaler/model expects exists (missing
        # dummy categories for this particular row become 0)
        for col in self.onehot_columns:
            if col not in encoded.columns:
                encoded[col] = 0
        for col in config.CONTINUOUS_COLS:
            if col not in encoded.columns:
                encoded[col] = row.get(col, 0)

        missing = [f for f in self.selected_features if f not in encoded.columns]
        if missing:
            raise ValueError(
                f"Cannot build model input — missing engineered features: {missing}. "
                f"Check that all fields from required_feature_schema() were supplied."
            )

        return encoded[self.selected_features].fillna(0)

    def predict(self, url: str, title: str, raw_features: dict) -> dict:
        text = prep.build_text_input(url, title)
        X_text = prep.texts_to_padded(text, self.tokenizer)

        row_df = self._encode_numeric_row(raw_features)
        print("\n===== RAW FEATURES =====")
        print(row_df.T)
        # Pass a DataFrame into the scaler so scikit-learn preserves feature
        # name semantics and avoids the "X does not have valid feature names"
        # user warning that appears when transforming raw numpy arrays.
        print("Selected Features:")
        print(self.selected_features)

        print("\nEncoded Features:")
        print(row_df.columns.tolist())

        print("\nMissing:")
        print(set(self.selected_features) - set(row_df.columns))

        print("\nExtra:")
        print(set(row_df.columns) - set(self.selected_features))
        X_num = self.scaler.transform(row_df)
        print("\n===== SCALED FEATURES =====")
        for name, value in zip(self.selected_features, X_num[0]):
            print(f"{name:35} {value:10.3f}")
        # Guard: clip extreme standardized values to a reasonable range so
        # numerical instability doesn't blow up predictions for slightly
        # out-of-distribution inputs. This is a pragmatic serving-time fix
        # that prevents huge z-scores from producing underflowed/overflowed
        # probabilities. Keep the clipping window intentionally wide.
        X_num = np.clip(X_num, -5.0, 5.0)

        prob_legit = float(self.model.predict([X_text, X_num], verbose=0).ravel()[0])
        predicted_label = (
            config.LABEL_LEGITIMATE if prob_legit >= config.PREDICTION_THRESHOLD
            else config.LABEL_PHISHING
        )
        predicted_class = "Legitimate" if predicted_label == config.LABEL_LEGITIMATE else "Phishing"

        return {
            "probability_legitimate": prob_legit,
            "probability_phishing": 1.0 - prob_legit,
            "predicted_label": predicted_label,
            "predicted_class": predicted_class,
            "threshold": config.PREDICTION_THRESHOLD,
        }


# Module-level singleton, lazily created so importing this module doesn't
# immediately require the artifacts to exist (useful for tests / tooling).
_service_instance = None


def get_service() -> PredictionService:
    global _service_instance
    if _service_instance is None:
        _service_instance = PredictionService()
    return _service_instance
