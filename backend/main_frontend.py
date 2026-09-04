#!/usr/bin/env python3
"""
BCI 实时解码后端 —— 前端兼容版
WebSocket 端点: ws://localhost:8080/stream
Protocol-compatible timed replay server for the browser dashboard

启动:
    uvicorn main_frontend:app --host 0.0.0.0 --port 8080 --reload
"""

import asyncio
import json
import os
import sys
import time
import warnings
from datetime import datetime
from pathlib import Path
from typing import Any, AsyncGenerator, Dict, List, Optional

import numpy as np
import torch
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from classifier import CascadedClassifier, CASCADE_LABELS
from data_reader import load_session_runs, simulate_preprocessed_stream
from models import CNN_LSTM
from preprocessor import EEGPreprocessor
from activation_evaluator import ActivationEvaluator
from session_reporter import SessionReporter

warnings.filterwarnings("ignore")

# ============================================================
# FastAPI
# ============================================================

app = FastAPI(
    title="BCI Frontend-Compatible Backend",
    description="Offline EEG window replay and decoding prototype",
    version="2.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# 全局配置
# ============================================================

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

MODEL_CFG = {
    "n_channels": 128,
    "n_samples": 100,
    "sfreq": 100.0,
    "window_sec": 1.0,
    "step_sec": 0.5,
}

# 基于当前文件位置解析权重路径，避免启动目录不同导致找不到
_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
_BCI_SYSTEM_DIR = os.path.dirname(_BACKEND_DIR)
_PROJECT_ROOT = os.path.dirname(_BCI_SYSTEM_DIR)  # 项目根目录

DEFAULT_STAGE1 = os.environ.get("BCI_STAGE1_WEIGHTS")
DEFAULT_STAGE2 = os.environ.get("BCI_STAGE2_WEIGHTS")
DEFAULT_SESSION_DIR = os.environ.get("BCI_SESSION_DIR", "")


def load_classifier(stage1_path=None, stage2_path=None, rest_threshold=0.5):
    s1 = CNN_LSTM(n_classes=2, n_channels=MODEL_CFG["n_channels"], n_samples=MODEL_CFG["n_samples"], dropout_rate=0.5)
    s2 = CNN_LSTM(n_classes=3, n_channels=MODEL_CFG["n_channels"], n_samples=MODEL_CFG["n_samples"], dropout_rate=0.5)
    clf = CascadedClassifier(s1, s2, device=str(device), rest_threshold=rest_threshold)

    p1 = stage1_path or DEFAULT_STAGE1
    p2 = stage2_path or DEFAULT_STAGE2

    missing = []
    if p1 and os.path.isfile(p1):
        clf.load_stage1_weights(p1)
        print(f"[OK] Stage 1 权重: {p1}")
    else:
        missing.append(f"Stage 1: {p1}")

    if p2 and os.path.isfile(p2):
        clf.load_stage2_weights(p2)
        print(f"[OK] Stage 2 权重: {p2}")
    else:
        missing.append(f"Stage 2: {p2}")

    if missing:
        raise RuntimeError(
            f"[FATAL] 以下权重文件未找到，模型将以随机权重运行！\n  " + "\n  ".join(missing) +
            f"\n请确认权重路径正确，或从项目根目录启动服务。"
        )

    return clf


# ============================================================
# 工具: 计算频段能量
# ============================================================

def compute_band_power(data: np.ndarray, sfreq: float) -> Dict[str, List[float]]:
    """
    计算 delta (1-4Hz), theta (4-8Hz), mu (8-13Hz), beta (13-30Hz) 频段能量
    data: (n_channels, n_samples)
    返回: {"delta": [...], "theta": [...], "mu": [...], "beta": [...]}
    """
    from scipy import signal as sp_signal
    freqs, psd = sp_signal.welch(data, fs=sfreq, nperseg=min(256, data.shape[1]), axis=1)
    delta_mask = (freqs >= 1) & (freqs <= 4)
    theta_mask = (freqs >= 4) & (freqs <= 8)
    mu_mask = (freqs >= 8) & (freqs <= 13)
    beta_mask = (freqs >= 13) & (freqs <= 30)
    delta = [float(np.trapz(psd[ch][delta_mask], freqs[delta_mask])) for ch in range(data.shape[0])]
    theta = [float(np.trapz(psd[ch][theta_mask], freqs[theta_mask])) for ch in range(data.shape[0])]
    mu = [float(np.trapz(psd[ch][mu_mask], freqs[mu_mask])) for ch in range(data.shape[0])]
    beta = [float(np.trapz(psd[ch][beta_mask], freqs[beta_mask])) for ch in range(data.shape[0])]
    return {"delta": delta, "theta": theta, "mu": mu, "beta": beta}


# ============================================================
# WebSocket /stream (匹配前端协议)
# ============================================================

@app.websocket("/stream")
async def stream_websocket(websocket: WebSocket):
    await websocket.accept()
    print("[WS] /stream 客户端已连接")

    try:
        # 1. 等待 hello
        hello_msg = await asyncio.wait_for(websocket.receive_text(), timeout=10.0)
        hello = json.loads(hello_msg)
        print(f"[WS] 收到 hello: {hello}")

        # 2. 读取配置 (如果 hello 中携带)
        session_dir = hello.get("session_dir", "")
        stage1_w = hello.get("stage1_weight")
        stage2_w = hello.get("stage2_weight")
        rest_thr = hello.get("rest_threshold", 0.5)
        speed = hello.get("speed_multiplier", 1.0)

        # 3. 加载数据 (如果 hello 未提供，使用默认路径)
        if not session_dir:
            session_dir = DEFAULT_SESSION_DIR
            print(f"[WS] hello 未提供 session_dir，使用默认值: {session_dir}")
        if not os.path.isdir(session_dir):
            await websocket.send_text(json.dumps({
                "type": "error",
                "message": f"session_dir 不存在: {session_dir}",
                "code": "BAD_SESSION_DIR"
            }))
            return

        runs = load_session_runs(session_dir)
        if not runs:
            await websocket.send_text(json.dumps({
                "type": "error",
                "message": "未找到预处理数据",
                "code": "NO_DATA"
            }))
            return

        # 获取通道名 (从第一个 run)
        channel_names = runs[0].channel_names if runs[0].channel_names else [f"Ch{i+1}" for i in range(128)]

        # 初始化 Session Reporter
        reporter = SessionReporter(channel_names, sfreq=MODEL_CFG["sfreq"])

        # 4. 发送 hello_ack
        await websocket.send_text(json.dumps({
            "type": "hello_ack",
            "sample_rate": int(MODEL_CFG["sfreq"]),
            "n_channels": len(channel_names),
            "channel_names": channel_names,
            "classes": CASCADE_LABELS,
        }))

        # 5. 状态更新
        await websocket.send_text(json.dumps({
            "type": "status",
            "state": "running",
            "message": "实时解码已启动",
        }))

        # 6. 加载分类器
        classifier = load_classifier(stage1_w, stage2_w, rest_thr)

        # 7. 初始化激活评估器
        evaluator = ActivationEvaluator(channel_names, sfreq=MODEL_CFG["sfreq"])

        # 7.1 用第一个 run 的 rest segments 预热基线
        if runs and len(runs[0].rest_list) > 0:
            _warmup_count = 0
            _window_samples = int(runs[0].sfreq * MODEL_CFG["window_sec"])
            for rest_seg in runs[0].rest_list:
                if not isinstance(rest_seg, np.ndarray) or rest_seg.shape[1] < _window_samples:
                    continue
                _seg = rest_seg[:, :_window_samples].copy()
                _mean = np.mean(_seg, axis=1, keepdims=True)
                _std = np.std(_seg, axis=1, keepdims=True)
                _std[_std == 0] = 1.0
                _zscored = ((_seg - _mean) / _std).astype(np.float32)
                _band = compute_band_power(_zscored, MODEL_CFG["sfreq"])
                _mu = np.array(_band["mu"])
                _beta = np.array(_band["beta"])
                _mu_roi_mean = float(np.mean(_mu[evaluator.ch.roi]))
                _beta_roi_mean = float(np.mean(_beta[evaluator.ch.roi]))
                evaluator.rest_mu_buffer.append(_mu_roi_mean)
                evaluator.rest_beta_buffer.append(_beta_roi_mean)
                _warmup_count += 1
                if _warmup_count >= evaluator.max_rest:
                    break
            print(f"[INFO] 评估器基线预热: {_warmup_count} 个 Rest 窗口")

        # 8. 实时流循环
        stream_gen = simulate_preprocessed_stream(
            runs, window_sec=MODEL_CFG["window_sec"], step_sec=MODEL_CFG["step_sec"], speed_multiplier=speed
        )

        # 分类结果推送间隔（秒）
        CLF_INTERVAL_SEC = 3.0
        last_clf_ts = 0.0
        last_clf_result = None

        async for packet in stream_gen:
            try:
                data = packet["data"]  # (128, 100)
                ts = packet["timestamp"]
                pkt_source = packet.get("source", "rest")
                pkt_true_label = packet.get("true_label", -1)
                pkt_run_name = packet.get("run_name", "")
                pkt_window_idx = packet.get("window_idx", 0)

                # Z-score (与训练一致)
                mean = np.mean(data, axis=1, keepdims=True)
                std = np.std(data, axis=1, keepdims=True)
                std[std == 0] = 1.0
                zscored = ((data - mean) / std).astype(np.float32)

                # 频段能量 (基于Z-score后的数据)
                band = compute_band_power(zscored, MODEL_CFG["sfreq"])

                # === 发送 raw ===
                raw_data = data.tolist()
                await websocket.send_text(json.dumps({
                    "type": "raw",
                    "timestamp": ts,
                    "data": raw_data,
                }))

                # === 发送 preprocessed ===
                pre_data = zscored.tolist()
                await websocket.send_text(json.dumps({
                    "type": "preprocessed",
                    "timestamp": ts,
                    "data": pre_data,
                }))

                # === 发送 band_power ===
                await websocket.send_text(json.dumps({
                    "type": "band_power",
                    "timestamp": ts,
                    "mu": band["mu"],
                    "beta": band["beta"],
                }))

                # === 发送 activation_eval (多模态激活评估) ===
                pred_for_eval = last_clf_result["predicted"] if last_clf_result else "unknown"
                probs_for_eval = last_clf_result["probabilities"] if last_clf_result else {}
                eval_result = evaluator.evaluate(
                    band, zscored, pred_for_eval, probs_for_eval,
                    pkt_source, pkt_true_label,
                    run_name=pkt_run_name, window_idx=pkt_window_idx,
                )
                if eval_result:
                    await websocket.send_text(json.dumps({
                        "type": "activation_eval",
                        "timestamp": ts,
                        **eval_result,
                    }))
                else:
                    # 基线收集中或 Rest 窗口，发送降级消息以保持前端刷新
                    await websocket.send_text(json.dumps({
                        "type": "activation_eval",
                        "timestamp": ts,
                        "activation_score": 0,
                        "modalities": {},
                        "target_roi": "left_motor",
                        "predicted_class": pred_for_eval,
                        "n_baseline": len(evaluator.rest_mu_buffer),
                    }))

                # === 记录到 Session Reporter ===
                reporter.add_frame(
                    timestamp=ts,
                    band_power=band,
                    preproc_data=zscored,
                    predicted_class=pred_for_eval,
                    probabilities=probs_for_eval,
                    source=pkt_source,
                    true_label=pkt_true_label,
                    run_name=pkt_run_name,
                    window_idx=pkt_window_idx,
                    eval_result=eval_result,
                )

                # === 发送 classification（限制推送间隔）===
                if ts - last_clf_ts >= CLF_INTERVAL_SEC:
                    # 级联分类
                    result = classifier.classify(zscored)
                    probs_obj = {
                        CASCADE_LABELS[i]: float(result["cascade_probabilities"][i])
                        for i in range(len(CASCADE_LABELS))
                    }
                    last_clf_result = {
                        "type": "classification",
                        "timestamp": ts,
                        "predicted": result["final_class"],
                        "probabilities": probs_obj,
                    }
                    await websocket.send_text(json.dumps(last_clf_result))
                    last_clf_ts = ts
                elif last_clf_result is not None:
                    # 在两次分类之间，重复发送上一次结果以保持前端显示
                    dup = dict(last_clf_result)
                    dup["timestamp"] = ts
                    await websocket.send_text(json.dumps(dup))

                # 检查控制消息 (非阻塞)
                try:
                    ctrl = await asyncio.wait_for(websocket.receive_text(), timeout=0.005)
                    ctrl_data = json.loads(ctrl)
                    if ctrl_data.get("action") == "stop":
                        await websocket.send_text(json.dumps({
                            "type": "status",
                            "state": "stopped",
                            "message": "用户停止",
                        }))
                        break
                except asyncio.TimeoutError:
                    pass

            except WebSocketDisconnect:
                break
            except Exception as e:
                print(f"[ERR] 帧处理错误: {e}")
                try:
                    await websocket.send_text(json.dumps({
                        "type": "error",
                        "message": str(e),
                        "code": "FRAME_ERROR"
                    }))
                except Exception:
                    break

        # Session 结束，生成报告
        report_path = reporter.finalize()
        if report_path:
            await websocket.send_text(json.dumps({
                "type": "status",
                "state": "report_ready",
                "message": f"数据流结束，报告已生成: {report_path}",
                "report_path": str(report_path),
            }))
        else:
            await websocket.send_text(json.dumps({
                "type": "status",
                "state": "stopped",
                "message": "数据流结束",
            }))

    except WebSocketDisconnect:
        print("[WS] 客户端断开")
    except Exception as e:
        print(f"[WS] 异常: {e}")
        try:
            await websocket.send_text(json.dumps({
                "type": "error",
                "message": str(e),
                "code": "WS_ERROR"
            }))
        except Exception:
            pass


# ============================================================
# HTTP 健康检查
# ============================================================

@app.get("/")
async def root():
    return {
        "name": "BCI Frontend-Compatible Backend",
        "version": "2.1.0",
        "stream_endpoint": "ws://localhost:8080/stream",
    }


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "device": str(device),
        "cuda": torch.cuda.is_available(),
        "model_config": MODEL_CFG,
    }


# ============================================================
# 启动
# ============================================================

if __name__ == "__main__":
    import uvicorn
    print("=" * 60)
    print("BCI Frontend-Compatible Backend")
    print("=" * 60)
    print(f"设备: {device}")
    print(f"模型: {MODEL_CFG['n_channels']}ch / {MODEL_CFG['n_samples']}samples @ {MODEL_CFG['sfreq']}Hz")
    print(f"Stream 端点: ws://localhost:8080/stream")
    print("=" * 60)
    uvicorn.run("main_frontend:app", host="0.0.0.0", port=8080, reload=False, log_level="info")
