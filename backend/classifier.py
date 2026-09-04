"""
实时EEG级联分类器 (S02 3手指+Rest)
Stage 1: Rest vs Task (2-class)
Stage 2: Thumb / Index / Pinky (3-class)
"""

import time
import warnings
from typing import Any, Dict, List, Optional

import numpy as np
import torch
import torch.nn as nn

warnings.filterwarnings("ignore")

# 级联系统类别标签
CASCADE_LABELS = ["Rest", "Thumb", "Index", "Pinky"]
STAGE1_LABELS = ["Rest", "Task"]
STAGE2_LABELS = ["Thumb", "Index", "Pinky"]


class CascadedClassifier:
    """
    两级级联实时分类器

    参数:
        stage1_model: Stage 1 模型 (Rest vs Task)
        stage2_model: Stage 2 模型 (3-class finger)
        device: 计算设备
        rest_threshold: Stage 1 判定为 Rest 的阈值 (默认 0.5)
    """

    def __init__(
        self,
        stage1_model: nn.Module,
        stage2_model: nn.Module,
        device: str = "auto",
        rest_threshold: float = 0.5,
    ) -> None:
        if device == "auto":
            self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        else:
            self.device = torch.device(device)

        self.stage1_model = stage1_model.to(self.device).eval()
        self.stage2_model = stage2_model.to(self.device).eval()
        self.rest_threshold = rest_threshold

        self._last_result: Optional[Dict[str, Any]] = None

    @torch.no_grad()
    def classify(self, data: np.ndarray) -> Dict[str, Any]:
        """
        对单帧预处理后的EEG数据进行级联分类

        参数:
            data: 形状为 (n_channels, n_samples) 或 (1, n_channels, n_samples)

        返回:
            包含级联预测结果的字典
        """
        start_time = time.time()

        # 统一输入维度 -> (1, n_channels, n_samples)
        if isinstance(data, np.ndarray):
            if data.ndim == 2:
                data = data[np.newaxis, ...]
            tensor = torch.FloatTensor(data).to(self.device)
        else:
            tensor = data.to(self.device)
            if tensor.dim() == 2:
                tensor = tensor.unsqueeze(0)

        # === Stage 1: Rest vs Task ===
        s1_logits = self.stage1_model(tensor)
        s1_probs = torch.softmax(s1_logits, dim=1).cpu().numpy().squeeze()  # (2,)
        s1_pred = int(np.argmax(s1_probs))
        s1_conf = float(s1_probs[s1_pred])

        # === Stage 2 (条件执行) ===
        s2_pred = -1
        s2_conf = 0.0
        s2_probs = np.zeros(3)

        # Rest 概率 > threshold 则直接判定为 Rest，不进入 Stage 2
        if s1_probs[0] > self.rest_threshold:
            final_pred = 0  # Rest
            final_conf = float(s1_probs[0])
            cascade_probs = np.array([
                float(s1_probs[0]),  # Rest
                0.0, 0.0, 0.0       # Thumb, Index, Pinky
            ])
        else:
            s2_logits = self.stage2_model(tensor)
            s2_probs = torch.softmax(s2_logits, dim=1).cpu().numpy().squeeze()  # (3,)
            s2_pred = int(np.argmax(s2_probs))
            s2_conf = float(s2_probs[s2_pred])

            # 级联合成概率: Rest = s1_rest, finger = s1_task * s2_finger
            task_prob = float(s1_probs[1])
            cascade_probs = np.array([
                float(s1_probs[0]),               # Rest
                task_prob * float(s2_probs[0]),   # Thumb
                task_prob * float(s2_probs[1]),   # Index
                task_prob * float(s2_probs[2]),   # Pinky
            ])
            final_pred = int(np.argmax(cascade_probs))
            final_conf = float(cascade_probs[final_pred])

        elapsed_ms = (time.time() - start_time) * 1000

        result = {
            "final_prediction": final_pred,
            "final_class": CASCADE_LABELS[final_pred],
            "confidence": round(final_conf, 4),
            "cascade_probabilities": [round(float(p), 4) for p in cascade_probs],
            "stage1": {
                "prediction": s1_pred,
                "class": STAGE1_LABELS[s1_pred],
                "confidence": round(s1_conf, 4),
                "probabilities": [round(float(p), 4) for p in s1_probs],
            },
            "stage2": {
                "prediction": s2_pred,
                "class": STAGE2_LABELS[s2_pred] if s2_pred >= 0 else "N/A",
                "confidence": round(s2_conf, 4),
                "probabilities": [round(float(p), 4) for p in s2_probs],
            },
            "processing_time_ms": round(elapsed_ms, 2),
        }

        self._last_result = result
        return result

    def load_stage1_weights(self, weight_path: str) -> None:
        checkpoint = torch.load(weight_path, map_location=self.device, weights_only=True)
        if "model_state_dict" in checkpoint:
            self.stage1_model.load_state_dict(checkpoint["model_state_dict"])
        else:
            self.stage1_model.load_state_dict(checkpoint)
        self.stage1_model.eval()

    def load_stage2_weights(self, weight_path: str) -> None:
        checkpoint = torch.load(weight_path, map_location=self.device, weights_only=True)
        if "model_state_dict" in checkpoint:
            self.stage2_model.load_state_dict(checkpoint["model_state_dict"])
        else:
            self.stage2_model.load_state_dict(checkpoint)
        self.stage2_model.eval()

    def get_last_result(self) -> Optional[Dict[str, Any]]:
        return self._last_result

    def set_rest_threshold(self, threshold: float) -> None:
        self.rest_threshold = threshold

    def benchmark(self, data: np.ndarray, n_runs: int = 100) -> Dict[str, float]:
        times = []
        for _ in range(n_runs):
            start = time.time()
            self.classify(data)
            elapsed = (time.time() - start) * 1000
            times.append(elapsed)
        times = np.array(times)
        return {
            "mean_ms": float(np.mean(times)),
            "std_ms": float(np.std(times)),
            "min_ms": float(np.min(times)),
            "max_ms": float(np.max(times)),
            "throughput_hz": float(1000.0 / np.mean(times)),
        }
