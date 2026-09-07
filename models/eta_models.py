"""Pluggable ETA prediction models.

The Guideline Layer is deliberately model-agnostic (paper Section VI-A: "not an
ETA model itself, it is running alongside the ETA model"). We provide three
models spanning the accuracy/resource trade-off discussed in the paper:

  linear            - classic lightweight baseline (traditional ML)
  gradient_boosting - stands in for XGBoost-class models (paper ref [12]:
                      XGBoost achieved MAE ~16 s on bus arrival data)
  mlp               - a deep neural net stand-in (heavy; proxies the LSTM/GRU
                      class of models without requiring PyTorch)

Any model implementing `fit(X, y)` / `predict(X)` can be dropped into the
registry - e.g. a real PyTorch LSTM/GRU later.
"""

from __future__ import annotations

import pickle
from dataclasses import dataclass, field
from typing import Callable

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.linear_model import LinearRegression
from sklearn.neural_network import MLPRegressor
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

FEATURE_COLS = [
    "hour",
    "is_peak",
    "weather_code",
    "traffic_index",
    "dist_remaining_km",
    "stops_remaining",
    "elapsed_min",
    "avg_speed_so_far_kmh",
]

TARGET_COL = "eta_remaining_min"


@dataclass
class EtaModel:
    name: str
    kind: str  # "light" | "medium" | "heavy"
    description: str
    build: Callable[[], object]

    def __post_init__(self) -> None:
        self.estimator = None

    def fit(self, X: pd.DataFrame, y: pd.Series) -> "EtaModel":
        self.estimator = self.build()
        self.estimator.fit(X[FEATURE_COLS].values, y.values)
        return self

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        return np.asarray(self.estimator.predict(X[FEATURE_COLS].values), dtype=float)

    def predict_values(self, x_rows: np.ndarray) -> np.ndarray:
        return np.asarray(self.estimator.predict(x_rows), dtype=float)

    def footprint_mb(self) -> float:
        return len(pickle.dumps(self.estimator)) / 1_000_000.0

    def accuracy(self, y_true: np.ndarray, y_pred: np.ndarray) -> dict:
        """MAE / RMSE / R2 in seconds (paper Section II-A reports these)."""
        err = y_true - y_pred
        mae = float(np.mean(np.abs(err)))
        rmse = float(np.sqrt(np.mean(err**2)))
        ss_res = float(np.sum(err**2))
        ss_tot = float(np.sum((y_true - np.mean(y_true)) ** 2))
        r2 = 1.0 - ss_res / ss_tot if ss_tot > 0 else 0.0
        return {"mae_s": mae * 60.0, "rmse_s": rmse * 60.0, "r2": r2}


def build_mlp(
    hidden_layer_sizes: tuple[int, ...] = (256, 128), early_stopping: bool = True
) -> object:
    """Deep-model stand-in; feature scaling is important for MLPs.

    The default (256, 128) net is the 'heavy' model in the resource story.
    Pass a smaller size (e.g. (64, 32)) with early_stopping=False for quick
    iterations on very small datasets.
    """
    return make_pipeline(
        StandardScaler(),
        MLPRegressor(
            hidden_layer_sizes=hidden_layer_sizes,
            activation="relu",
            solver="adam",
            max_iter=800,
            early_stopping=early_stopping,
            n_iter_no_change=25,
            random_state=0,
        ),
    )


MLP_HIDDEN_DEFAULT: tuple[int, ...] = (256, 128)


MODEL_REGISTRY: dict[str, EtaModel] = {
    "linear": EtaModel(
        name="linear",
        kind="light",
        description="Linear regression baseline (traditional lightweight ML)",
        build=lambda: make_pipeline(StandardScaler(), LinearRegression()),
    ),
    "gradient_boosting": EtaModel(
        name="gradient_boosting",
        kind="medium",
        description="Histogram gradient boosting (XGBoost-class, paper ref [12])",
        build=lambda: HistGradientBoostingRegressor(
            max_iter=200, learning_rate=0.08, max_leaf_nodes=31, random_state=0
        ),
    ),
    "mlp": EtaModel(
        name="mlp",
        kind="heavy",
        description="MLP neural network (deep-model stand-in for LSTM/GRU class)",
        build=lambda: build_mlp(MLP_HIDDEN_DEFAULT),
    ),
}


def load_model(name: str) -> EtaModel:
    if name not in MODEL_REGISTRY:
        raise KeyError(f"Unknown model '{name}'. Available: {list(MODEL_REGISTRY)}")
    return MODEL_REGISTRY[name]


def estimate_macs(estimator: object) -> float:
    """Estimated multiply-accumulate operations per inference.

    A standard, structure-based proxy for on-device compute cost (FLOPs-based
    energy models are common in edge-ML literature). Works on the estimators
    we ship; extend it if you plug in a custom model (e.g. a PyTorch LSTM).
    """
    from sklearn.ensemble import HistGradientBoostingRegressor
    from sklearn.linear_model import LinearRegression
    from sklearn.neural_network import MLPRegressor
    from sklearn.pipeline import Pipeline

    est = estimator
    if isinstance(est, Pipeline):
        est = est.steps[-1][1]

    if isinstance(est, LinearRegression):
        return float(max(est.coef_.size, 1))

    if isinstance(est, MLPRegressor):
        return float(sum(c.shape[0] * c.shape[1] for c in est.coefs_))

    if isinstance(est, HistGradientBoostingRegressor):
        # `_predictors` is a list (one per iteration) of lists of
        # TreePredictor; per-inference path cost ~ log2(node_count).
        total = 0.0
        for pred_list in getattr(est, "_predictors", []):
            for pred in pred_list:
                nodes = getattr(pred, "nodes", None)
                n = nodes.shape[0] if nodes is not None else 0
                if n > 1:
                    total += max(np.log2(n), 1.0)
        return max(total, 1.0)

    raise NotImplementedError(
        f"estimate_macs() not implemented for {type(est).__name__}; "
        "add your model here (structure-based FLOP estimate)."
    )