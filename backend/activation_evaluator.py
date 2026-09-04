"""
多模态脑区激活评估器 (Multimodal Activation Evaluator)
=========================================================
融合四类模态，全面评估患者运动想象时的脑功能状态：

  1. 神经激活 (Neural Activation): ERD/ERS、空间聚焦、对侧优势
  2. 功能连接 (Functional Connectivity): 运动区相位同步 (PLV)
  3. 解码可信 (Decoding Reliability): 分类置信度、类别区分度
  4. 任务表现 (Task Performance): 在线准确率、响应延迟、静息纯度

用法:
    evaluator = ActivationEvaluator(channel_names, sfreq=100)
    result = evaluator.evaluate(
        band_power, preproc_data, predicted_class, probabilities,
        source, true_label, run_name, window_idx
    )
"""

import json
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
import numpy as np


# 感觉运动区 ROI 通道 (标准 10-20)
MOTOR_21 = [
    "C1", "C2", "C3", "C4", "C5", "C6",
    "CP1", "CP2", "CP3", "CP4", "CP5", "CP6",
    "FC1", "FC2", "FC3", "FC4", "FC5", "FC6",
    "Cz", "CPz", "FCz",
]
LEFT_HEMISPHERE = ["C1", "C3", "C5", "CP1", "CP3", "CP5", "FC1", "FC3", "FC5"]
RIGHT_HEMISPHERE = ["C2", "C4", "C6", "CP2", "CP4", "CP6", "FC2", "FC4", "FC6"]
CENTRAL_MIDLINE = ["Cz", "CPz", "FCz"]

# 关键连接对（用于快速 PLV）
KEY_PAIRS = [
    ("C3", "Cz"), ("C4", "Cz"), ("C3", "C4"),
    ("FCz", "Cz"), ("CPz", "Cz"),
    ("FC3", "C3"), ("CP3", "C3"),
    ("FC4", "C4"), ("CP4", "C4"),
]


class _ChannelMap:
    def __init__(self, channel_names: List[str]):
        self.names = channel_names
        self.n = len(channel_names)
        self.name_to_idx = {n.upper(): i for i, n in enumerate(channel_names)}
        self.roi = self._indices(MOTOR_21)
        self.left = self._indices(LEFT_HEMISPHERE)
        self.right = self._indices(RIGHT_HEMISPHERE)
        self.mid = self._indices(CENTRAL_MIDLINE)
        self.key_pair_indices = self._pair_indices(KEY_PAIRS)

    def _indices(self, subset: List[str]) -> List[int]:
        s = {x.upper() for x in subset}
        return [i for i, n in enumerate(self.names) if n.upper() in s]

    def _pair_indices(self, pairs: List[Tuple[str, str]]) -> List[Tuple[int, int]]:
        out = []
        for a, b in pairs:
            ia = self.name_to_idx.get(a.upper())
            ib = self.name_to_idx.get(b.upper())
            if ia is not None and ib is not None:
                out.append((ia, ib))
        return out


class ActivationEvaluator:
    def __init__(self, channel_names: List[str], sfreq: float = 100.0):
        self.ch = _ChannelMap(channel_names)
        self.sfreq = sfreq

        # ---- 基线 ----
        self.rest_mu_buffer: List[float] = []
        self.rest_beta_buffer: List[float] = []
        self.max_rest = 20

        # ---- 任务表现历史 ----
        self.trial_log: List[Dict] = []          # 每个被评估的窗口
        self.max_trial_log = 60
        self.last_trial_key: Optional[str] = None

    # ============================================================
    # 公共接口
    # ============================================================
    def evaluate(
        self,
        band_power: Dict[str, List[float]],
        preproc_data: np.ndarray,      # (n_ch, n_samples) — 用于连接分析
        predicted_class: str,
        probabilities: Dict[str, float],
        source: str,
        true_label: int,
        run_name: str = "",
        window_idx: int = 0,
    ) -> Optional[Dict[str, Any]]:
        """
        对当前窗口进行多模态评估。
        Rest 窗口只更新基线并返回 None。
        """
        mu = np.array(band_power["mu"])
        beta = np.array(band_power["beta"])
        mu_roi_mean = float(np.mean(mu[self.ch.roi]))
        beta_roi_mean = float(np.mean(beta[self.ch.roi]))

        trial_key = f"{run_name}_{true_label}_{window_idx // 2}"

        # ---- Rest: 更新基线 ----
        if source == "rest" or true_label == -1:
            self.rest_mu_buffer.append(mu_roi_mean)
            self.rest_beta_buffer.append(beta_roi_mean)
            if len(self.rest_mu_buffer) > self.max_rest:
                self.rest_mu_buffer.pop(0)
                self.rest_beta_buffer.pop(0)
            self.last_trial_key = None
            return None

        if len(self.rest_mu_buffer) < 5:
            return None
        if trial_key == self.last_trial_key:
            return None
        self.last_trial_key = trial_key

        rest_mu_mean = np.mean(self.rest_mu_buffer)
        rest_beta_mean = np.mean(self.rest_beta_buffer)
        if abs(rest_mu_mean) < 1e-10:
            rest_mu_mean = 1e-10
        if abs(rest_beta_mean) < 1e-10:
            rest_beta_mean = 1e-10

        # ---- 模态 1: 神经激活 ----
        neural = self._modality_neural(mu, beta, rest_mu_mean, rest_beta_mean)

        # ---- 模态 2: 功能连接 ----
        connectivity = self._modality_connectivity(preproc_data)

        # ---- 模态 3: 解码可信 ----
        decoding = self._modality_decoding(probabilities, predicted_class)

        # ---- 模态 4: 任务表现 ----
        task = self._modality_task(source, true_label, predicted_class)

        # ---- 融合总评分 ----
        total = (
            neural["score"] * 0.35 +
            connectivity["score"] * 0.20 +
            decoding["score"] * 0.25 +
            task["score"] * 0.20
        )
        total = min(100.0, max(0.0, total))

        result = {
            "activation_score": round(total, 1),
            "modalities": {
                "neural": {
                    "label": "神经激活",
                    "score": round(neural["score"], 1),
                    "mu_erd_pct": round(neural["mu_erd_pct"], 1),
                    "beta_ers_pct": round(neural["beta_ers_pct"], 1),
                    "spatial_focus": round(neural["spatial_focus"], 2),
                    "contra_score": round(neural["contra_score"], 2),
                },
                "connectivity": {
                    "label": "功能连接",
                    "score": round(connectivity["score"], 1),
                    "avg_plv": round(connectivity["avg_plv"], 3),
                    "inter_balance": round(connectivity["inter_balance"], 2),
                },
                "decoding": {
                    "label": "解码可信",
                    "score": round(decoding["score"], 1),
                    "confidence": round(decoding["confidence"], 3),
                    "entropy": round(decoding["entropy"], 3),
                    "separation": round(decoding["separation"], 2),
                },
                "task": {
                    "label": "任务表现",
                    "score": round(task["score"], 1),
                    "online_acc": round(task["online_acc"], 2) if task["online_acc"] is not None else None,
                    "rest_purity": round(task["rest_purity"], 2) if task["rest_purity"] is not None else None,
                    "latency_ms": round(task["latency_ms"], 0) if task["latency_ms"] is not None else None,
                },
            },
            "target_roi": "left_motor",
            "predicted_class": predicted_class,
            "n_baseline": len(self.rest_mu_buffer),
        }

        self.trial_log.append({
            "total": total,
            "neural": neural["score"],
            "connectivity": connectivity["score"],
            "decoding": decoding["score"],
            "task": task["score"],
        })
        if len(self.trial_log) > self.max_trial_log:
            self.trial_log.pop(0)

        return result

    # ============================================================
    # 模态 1: 神经激活
    # ============================================================
    def _modality_neural(self, mu, beta, rest_mu_mean, rest_beta_mean):
        mu_roi_mean = float(np.mean(mu[self.ch.roi]))
        beta_roi_mean = float(np.mean(beta[self.ch.roi]))

        mu_erd = (mu_roi_mean - rest_mu_mean) / rest_mu_mean
        beta_ers = (beta_roi_mean - rest_beta_mean) / rest_beta_mean

        erd_topo = (mu - rest_mu_mean) / rest_mu_mean
        global_erd = float(np.mean(erd_topo))

        spatial_focus = 0.0
        if global_erd < -0.01:
            ratio = abs(mu_erd) / (abs(global_erd) + 1e-10)
            spatial_focus = min(1.0, max(0.0, ratio * 0.8))

        contra = 0.5
        if self.ch.left and self.ch.right:
            left_erd = float(np.mean(erd_topo[self.ch.left]))
            right_erd = float(np.mean(erd_topo[self.ch.right]))
            denom = abs(right_erd) + abs(left_erd) + 1e-10
            asym = (right_erd - left_erd) / denom
            contra = min(1.0, max(0.0, 0.5 + asym * 0.5))

        mu_depth = min(100.0, max(0.0, -mu_erd * 200))
        score = mu_depth * 0.5 + spatial_focus * 30 + contra * 15 + min(100, max(0, beta_ers * 100)) * 0.05
        score = min(100.0, max(0.0, score))

        return {
            "score": score,
            "mu_erd_pct": float(mu_erd) * 100,
            "beta_ers_pct": float(beta_ers) * 100,
            "spatial_focus": spatial_focus,
            "contra_score": contra,
        }

    # ============================================================
    # 模态 2: 功能连接 (简化 PLV)
    # ============================================================
    def _modality_connectivity(self, data: np.ndarray):
        """基于 FFT 相位的快速 PLV"""
        n = data.shape[1]
        fft_vals = np.fft.rfft(data, axis=1)
        freqs = np.fft.rfftfreq(n, 1.0 / self.sfreq)

        mu_idx = np.where((freqs >= 8) & (freqs <= 13))[0]
        if len(mu_idx) == 0:
            return {"score": 0.0, "avg_plv": 0.0, "inter_balance": 0.5}

        phases = np.angle(fft_vals[:, mu_idx])  # (n_ch, n_freq)

        # 关键连接对 PLV
        plvs = []
        for ia, ib in self.ch.key_pair_indices:
            dphi = np.exp(1j * (phases[ia] - phases[ib]))
            plvs.append(np.abs(np.mean(dphi)))

        avg_plv = float(np.mean(plvs)) if plvs else 0.0

        # 左右半球间 PLV (C3-C4, FC3-FC4, CP3-CP4)
        inter_plvs = []
        left_names = ["C3", "FC3", "CP3"]
        right_names = ["C4", "FC4", "CP4"]
        for ln, rn in zip(left_names, right_names):
            li = self.ch.name_to_idx.get(ln.upper())
            ri = self.ch.name_to_idx.get(rn.upper())
            if li is not None and ri is not None:
                dphi = np.exp(1j * (phases[li] - phases[ri]))
                inter_plvs.append(np.abs(np.mean(dphi)))

        inter_balance = 0.5
        if inter_plvs:
            # 右手 MI 期望左右连接较低（半球间去耦合）
            # 因此 inter_plv 越低，balance 越接近 1.0
            mean_inter = float(np.mean(inter_plvs))
            inter_balance = min(1.0, max(0.0, 1.0 - mean_inter))

        # 评分：avg_plv 在 0.3-0.7 之间较好（过低=噪声/不同步，过高=可能伪迹）
        if avg_plv < 0.2:
            score = avg_plv * 250  # 0-50
        elif avg_plv < 0.6:
            score = 50 + (avg_plv - 0.2) * 125  # 50-100
        else:
            score = 100 - (avg_plv - 0.6) * 100  # 过高扣分
        score = min(100.0, max(0.0, score))

        return {"score": score, "avg_plv": avg_plv, "inter_balance": inter_balance}

    # ============================================================
    # 模态 3: 解码可信
    # ============================================================
    def _modality_decoding(self, probs: Dict[str, float], predicted: str):
        vals = np.array(list(probs.values()), dtype=float)
        if len(vals) == 0 or np.sum(vals) == 0:
            return {"score": 0.0, "confidence": 0.0, "entropy": 1.0, "separation": 0.0}

        # 归一化
        vals = vals / vals.sum()
        confidence = float(np.max(vals))

        # 熵 (越低越好，说明分布越尖锐)
        entropy = -np.sum(vals * np.log(vals + 1e-10))
        max_ent = np.log(len(vals))
        norm_entropy = entropy / max_ent if max_ent > 0 else 0

        # 类别区分度：top1 vs top2 的差距
        sorted_vals = np.sort(vals)[::-1]
        separation = float(sorted_vals[0] - sorted_vals[1]) if len(sorted_vals) >= 2 else 0.0

        # 评分
        score = (
            confidence * 40 +
            (1.0 - norm_entropy) * 30 +
            separation * 30
        )
        score = min(100.0, max(0.0, score))

        return {"score": score, "confidence": confidence, "entropy": norm_entropy, "separation": separation}

    # ============================================================
    # 模态 4: 任务表现
    # ============================================================
    def _modality_task(self, source: str, true_label: int, predicted: str):
        # 记录当前 trial
        entry = {
            "source": source,
            "true": true_label,
            "pred": predicted,
            "ts": len(self.trial_log),
        }
        # 使用一个临时缓存来存原始标签（不污染trial_log）
        if not hasattr(self, '_raw_log'):
            self._raw_log = []
        self._raw_log.append(entry)
        if len(self._raw_log) > 100:
            self._raw_log.pop(0)

        online_acc = None
        rest_purity = None
        latency_ms = None

        if self._raw_log:
            # 只计算有 true_label 的（MI trials）
            mi_entries = [e for e in self._raw_log if e["true"] >= 0]
            if len(mi_entries) >= 3:
                correct = sum(1 for e in mi_entries[-20:] if e["true"] == e["pred"])
                online_acc = correct / min(20, len(mi_entries))

            rest_entries = [e for e in self._raw_log if e["true"] == -1]
            if len(rest_entries) >= 3:
                correct_rest = sum(1 for e in rest_entries[-20:] if e["pred"] == "rest")
                rest_purity = correct_rest / min(20, len(rest_entries))

            # 响应延迟：从第一个 non-rest true_label 出现到被正确分类的时间窗口数
            # 简化：计算最近 MI trial 被分类为非 rest 的速度
            if mi_entries:
                # No synchronized intent-onset timestamp is available here, so
                # latency cannot be measured without inventing a reference.
                latency_ms = None

        score = 0.0
        if online_acc is not None:
            score += online_acc * 60
        if rest_purity is not None:
            score += rest_purity * 30
        if latency_ms is not None:
            score += max(0, 1.0 - latency_ms / 3000) * 10
        score = min(100.0, max(0.0, score))

        return {"score": score, "online_acc": online_acc, "rest_purity": rest_purity, "latency_ms": latency_ms}
