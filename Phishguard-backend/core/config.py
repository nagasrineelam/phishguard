"""
Shared configuration used by both the training pipeline (train.py) and the
serving API (api/main.py). Keeping this in one place means the API can
never accidentally drift from what the model was trained with.
"""

import os

# ---------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARTIFACTS_DIR = os.path.join(BASE_DIR, "artifacts")
os.makedirs(ARTIFACTS_DIR, exist_ok=True)

MODEL_PATH = os.path.join(ARTIFACTS_DIR, "hybrid_model.keras")
TOKENIZER_PATH = os.path.join(ARTIFACTS_DIR, "tokenizer.pkl")
SCALER_PATH = os.path.join(ARTIFACTS_DIR, "num_scaler.pkl")
SELECTED_FEATURES_PATH = os.path.join(ARTIFACTS_DIR, "selected_features.pkl")

DB_PATH = os.path.join(ARTIFACTS_DIR, "crowdsourcing.db")
RETRAIN_CSV_PATH = os.path.join(ARTIFACTS_DIR, "retrain_dataset.csv")

DATA_PATH = os.environ.get(
    "PHIUSIIL_CSV_PATH",
    "/kaggle/input/phiusiil/PhiUSIIL_Phishing_URL_Dataset.csv"
    if os.path.exists("/kaggle/input")
    else os.path.join(BASE_DIR, "data", "PhiUSIIL_Phishing_URL_Dataset.csv"),
)

# ---------------------------------------------------------------------
# Reproducibility
# ---------------------------------------------------------------------
SEED = 42

# ---------------------------------------------------------------------
# Label mapping — READ THIS
# ---------------------------------------------------------------------
# PhiUSIIL's Kaggle documentation and the source paper's reported
# Counter({1: 134850, 0: 100945}) both point to: 1 = legitimate, 0 = phishing.
# train.py asserts this against the actual CSV on load and fails loudly if
# it doesn't match — verify that assertion output the first time you train.
LABEL_LEGITIMATE = 1
LABEL_PHISHING = 0
TARGET_NAMES_IN_LABEL_ORDER = ["Phishing", "Legitimate"]  # index 0, index 1

# Global class balance from the PhiUSIIL Kaggle CSV, per the Counter above.
# Used ONLY as an inference-time fallback prior for TLDLegitimateProb when
# artifacts/tld_legit_prob.pkl (real per-TLD stats) isn't available — see
# core/build_extraction_stats.py and core/feature_extractor.py.
LEGITIMATE_BASE_RATE = 134850 / (134850 + 100945)

# ---------------------------------------------------------------------
# Dataset column schema (PhiUSIIL CSV header)
# ---------------------------------------------------------------------
LABEL_COL = "label"
URL_COL = "URL"
TITLE_COL = "Title"
DOMAIN_COL = "Domain"
TLD_COL = "TLD"

TEXT_COLS = [URL_COL, TITLE_COL]

CATEGORICAL_BINARY_COLS = [
    "IsDomainIP", "HasObfuscation", "IsHTTPS", "HasTitle", "HasFavicon",
    "Robots", "IsResponsive", "HasDescription", "HasExternalFormSubmit",
    "HasSocialNet", "HasSubmitButton", "HasHiddenFields", "HasPasswordField",
    "Bank", "Pay", "Crypto", "HasCopyrightInfo",
]

CONTINUOUS_COLS = [
    "URLSimilarityIndex", "CharContinuationRate", "TLDLegitimateProb",
    "URLCharProb", "TLDLength", "NoOfSubDomain", "NoOfObfuscatedChar",
    "ObfuscationRatio", "NoOfLettersInURL", "LetterRatioInURL",
    "NoOfDegitsInURL", "DegitRatioInURL", "NoOfEqualsInURL",
    "NoOfQMarkInURL", "NoOfAmpersandInURL", "NoOfOtherSpecialCharsInURL",
    "SpacialCharRatioInURL", "LineOfCode", "LargestLineLength",
    "DomainTitleMatchScore", "URLTitleMatchScore", "NoOfURLRedirect",
    "NoOfSelfRedirect", "NoOfPopup", "NoOfiFrame", "NoOfImage", "NoOfCSS",
    "NoOfJS", "NoOfSelfRef", "NoOfEmptyRef", "NoOfExternalRef",
]

MANUAL_NOISY_DROP = ["URLLength", "DomainLength"]
IDENTIFIER_DROP = [DOMAIN_COL]
TOP_N_TLDS = 20

# ---------------------------------------------------------------------
# Model / training hyperparameters (NOT specified in the source paper —
# see the README for which values are grounded vs. placeholders)
# ---------------------------------------------------------------------
MAX_URL_LEN = 200
VOCAB_SIZE = 8000
EMBEDDING_DIM = 50   # this one IS stated in the paper
BATCH_SIZE = 32
EPOCHS = 30          # upper bound; EarlyStopping cuts this short in practice
LEARNING_RATE = 1e-3
TARGET_N_FEATURES = 34  # stated in the paper as the final selected count
PREDICTION_THRESHOLD = 0.5

# ---------------------------------------------------------------------
# API settings
# ---------------------------------------------------------------------
ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "*").split(",")
ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "change-me-before-deploying")
API_TITLE = "Phishing URL Detection API"
API_VERSION = "1.0.0"

# Quick operational whitelist: registered domains here will be treated as
# trusted by the API post-processing step. Prefer correcting labels and
# retraining long-term. Controlled via the `TRUSTED_DOMAINS` environment
# variable (comma-separated). If unset, the set is empty.
_td = os.environ.get("TRUSTED_DOMAINS", "").strip()
if _td:
    TRUSTED_DOMAINS = {d.strip().lower() for d in _td.split(",") if d.strip()}
else:
    TRUSTED_DOMAINS = set()

# Serving tuning: clip standardized numeric inputs to avoid numerical
# instability. Set via env var `CLIP_ZSCORE`, default 5.0. Set to 0 to disable.
_clip = os.environ.get("CLIP_ZSCORE", "5.0")
try:
    CLIP_ZSCORE = float(_clip)
except Exception:
    CLIP_ZSCORE = 5.0