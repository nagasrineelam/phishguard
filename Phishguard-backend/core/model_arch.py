"""
Hybrid LSTM + Attention (text) / Dense (structured features) architecture,
reconstructed from Section IV.B.3 and Figure 3 of the source paper, with
added regularization (Dropout, BatchNorm) per review feedback.
"""

import tensorflow as tf
from tensorflow.keras import layers, Model

from core import config


def build_model(num_numerical_features: int, vocab_size: int = config.VOCAB_SIZE) -> Model:
    # --- Text branch ---
    text_input = layers.Input(shape=(config.MAX_URL_LEN,), name="url_text_input")
    x = layers.Embedding(vocab_size, config.EMBEDDING_DIM, name="embedding")(text_input)
    x = layers.Dropout(0.2, name="embedding_dropout")(x)

    lstm_seq = layers.LSTM(100, return_sequences=True, name="lstm_1")(x)
    lstm_seq = layers.Dropout(0.3, name="lstm1_dropout")(lstm_seq)

    attn_out = layers.AdditiveAttention(name="attention")([lstm_seq, lstm_seq])

    text_repr = layers.LSTM(64, name="lstm_2")(attn_out)
    text_repr = layers.Dropout(0.3, name="lstm2_dropout")(text_repr)

    # --- Numeric branch ---
    numeric_input = layers.Input(shape=(num_numerical_features,), name="numeric_features_input")
    numeric_repr = layers.Dense(64, activation="relu", name="numeric_dense")(numeric_input)
    numeric_repr = layers.Dropout(0.3, name="numeric_dropout")(numeric_repr)

    # --- Merge + classify ---
    merged = layers.Concatenate(name="concatenate")([text_repr, numeric_repr])
    merged = layers.BatchNormalization(name="batch_norm")(merged)
    output = layers.Dense(1, activation="sigmoid", name="output")(merged)

    model = Model(inputs=[text_input, numeric_input], outputs=output,
                  name="hybrid_lstm_attention_phishing_detector")
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=config.LEARNING_RATE),
        loss="binary_crossentropy",
        metrics=["accuracy",
                 tf.keras.metrics.Precision(name="precision"),
                 tf.keras.metrics.Recall(name="recall"),
                 tf.keras.metrics.AUC(name="auc")],
    )
    return model
