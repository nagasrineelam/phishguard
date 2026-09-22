import pickle
import pandas as pd

from core import config, preprocessing as prep
from core.inference import get_service

service = get_service()

# Load the original training dataset
df = pd.read_csv(config.DATA_PATH)

# Pick a legitimate sample
sample = df[df[config.LABEL_COL] == config.LABEL_LEGITIMATE].iloc[0]

print("Actual Label:", sample[config.LABEL_COL])

# Build text input exactly like training
text = prep.build_text_input(
    sample[config.URL_COL],
    sample[config.TITLE_COL]
)

X_text = prep.texts_to_padded(text, service.tokenizer)

# Keep only the model features
row_df = pd.DataFrame([sample[service.selected_features]])

# Scale exactly like inference
X_num = service.scaler.transform(row_df)

prediction = service.model.predict([X_text, X_num], verbose=0)[0][0]

print("Probability Legitimate:", prediction)
print("Predicted:",
      "Legitimate" if prediction >= 0.5 else "Phishing")

row_df = pd.DataFrame([sample[service.selected_features]])

print("\n===== DATASET FEATURES =====")
print(row_df.T)

X_num = service.scaler.transform(row_df)

print("\n===== DATASET SCALED =====")
for name, value in zip(service.selected_features, X_num[0]):
    print(f"{name:35} {value:10.3f}")