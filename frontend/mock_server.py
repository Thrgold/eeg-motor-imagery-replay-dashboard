"""
脑电实时解码系统 — 独立 Python mock 后端
=====================================

按照 `brain_decoder_frontend_spec.md` § 4 的 WebSocket 协议推送数据：
  • hello / hello_ack 握手
  • raw            25 Hz       (32 通道 × 10 采样点)
  • preprocessed   25 Hz       (与 raw 时间戳对齐)
  • band_power      5 Hz       (mu + beta)
  • classification ~3 Hz
  • status         on state change
  • error          on demand

启动方式
--------
  pip install websockets
  python mock_server.py                 # 默认监听 ws://0.0.0.0:8080/stream
  python mock_server.py --port 9000     # 自定义端口
  python mock_server.py --class fist    # 指定模拟类别（默认 fist）

可通过控制台输入切换当前类别：
    palm / fist / ok / invert / quit

切换真实后端时，只需替换数据来源；协议保持不变。
"""

from __future__ import annotations

import argparse
import asyncio
import json
import math
import random
import sys
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set

try:
    import websockets
    from websockets.server import WebSocketServerProtocol
except ImportError:  # pragma: no cover
    sys.stderr.write(
        "需要安装 websockets 包：pip install websockets\n"
    )
    sys.exit(1)


# ── 32 通道 10-20 标准布局（与前端 utils/electrodes.js 保持一致） ────────────
ELECTRODES: List[Dict] = [
    {"label": "Fp1", "x": -0.29, "y": -0.89},
    {"label": "AF3", "x": -0.32, "y": -0.76},
    {"label": "F7",  "x": -0.75, "y": -0.55},
    {"label": "F3",  "x": -0.41, "y": -0.52},
    {"label": "FC1", "x": -0.22, "y": -0.28},
    {"label": "FC5", "x": -0.62, "y": -0.28},
    {"label": "T7",  "x": -0.94, "y":  0.00},
    {"label": "C3",  "x": -0.47, "y":  0.00},
    {"label": "CP1", "x": -0.22, "y":  0.28},
    {"label": "CP5", "x": -0.62, "y":  0.28},
    {"label": "P7",  "x": -0.75, "y":  0.55},
    {"label": "P3",  "x": -0.41, "y":  0.52},
    {"label": "Pz",  "x":  0.00, "y":  0.52},
    {"label": "PO3", "x": -0.32, "y":  0.76},
    {"label": "O1",  "x": -0.29, "y":  0.89},
    {"label": "Oz",  "x":  0.00, "y":  0.94},
    {"label": "O2",  "x":  0.29, "y":  0.89},
    {"label": "PO4", "x":  0.32, "y":  0.76},
    {"label": "P4",  "x":  0.41, "y":  0.52},
    {"label": "P8",  "x":  0.75, "y":  0.55},
    {"label": "CP6", "x":  0.62, "y":  0.28},
    {"label": "CP2", "x":  0.22, "y":  0.28},
    {"label": "C4",  "x":  0.47, "y":  0.00},
    {"label": "T8",  "x":  0.94, "y":  0.00},
    {"label": "FC6", "x":  0.62, "y": -0.28},
    {"label": "FC2", "x":  0.22, "y": -0.28},
    {"label": "F4",  "x":  0.41, "y": -0.52},
    {"label": "F8",  "x":  0.75, "y": -0.55},
    {"label": "AF4", "x":  0.32, "y": -0.76},
    {"label": "Fp2", "x":  0.29, "y": -0.89},
    {"label": "Fz",  "x":  0.00, "y": -0.52},
    {"label": "Cz",  "x":  0.00, "y":  0.00},
]
CHANNEL_NAMES: List[str] = [e["label"] for e in ELECTRODES]
N_CHANNELS = len(ELECTRODES)
SAMPLE_RATE = 250

CLASSES = ["palm", "fist", "ok", "invert"]


# ── 服务端状态 ──────────────────────────────────────────────────────────────
@dataclass
class ServerState:
    current_class: str = "palm"
    clients: Set[WebSocketServerProtocol] = field(default_factory=set)
    sample_counter: int = 0
    t0: float = field(default_factory=time.time)


STATE = ServerState()


# ── 数据生成 ─────────────────────────────────────────────────────────────
def gen_raw_and_preprocessed_chunk():
    """返回 (raw[32x10], preprocessed[32x10], timestamp)。"""
    t0 = STATE.t0
    sample_counter = STATE.sample_counter
    ts = t0 + sample_counter / SAMPLE_RATE

    erd_bias = 0.7

    raw: List[List[float]] = [[0.0] * 10 for _ in range(N_CHANNELS)]
    pre: List[List[float]] = [[0.0] * 10 for _ in range(N_CHANNELS)]

    for c, e in enumerate(ELECTRODES):
        c3_dist = math.hypot(e["x"] + 0.47, e["y"])
        c4_dist = math.hypot(e["x"] - 0.47, e["y"])
        mu_supp = math.exp(-c3_dist * 3.0) * erd_bias
        mu_enh  = math.exp(-c4_dist * 3.0) * erd_bias * 0.3
        mu_amp  = 14.0 * (1.0 - mu_supp + mu_enh)
        beta_amp = 5.0 * (1.0 - mu_supp * 0.6)
        slow_amp = 22.0 + (c % 5)

        for i in range(10):
            s_idx = sample_counter + i
            t = s_idx / SAMPLE_RATE
            slow = math.sin(2 * math.pi * 1.3 * t + c * 0.31) * slow_amp
            mu = (
                math.sin(2 * math.pi * 10.0 * t + c * 0.73) * mu_amp
                + math.sin(2 * math.pi * 11.7 * t + c * 1.27) * mu_amp * 0.4
            )
            beta = math.sin(2 * math.pi * 20.0 * t + c * 1.11) * beta_amp
            drift = math.sin(2 * math.pi * 0.25 * t + c * 0.17) * 6.0
            pink = slow * 0.35 + mu * 0.55 + beta * 0.4 + drift
            line = math.sin(2 * math.pi * 50.0 * t) * 7.0  # 50 Hz 工频
            noise = (random.random() - 0.5) * 22.0
            raw[c][i] = pink + line + noise
            clean_noise = (random.random() - 0.5) * 3.0
            pre[c][i] = pink * 0.9 + mu * 0.25 + clean_noise

    STATE.sample_counter += 10
    return raw, pre, ts


def gen_band_power():
    bias = 0.9
    mu: List[float] = []
    beta: List[float] = []
    for e in ELECTRODES:
        c3 = math.hypot(e["x"] + 0.47, e["y"])
        c4 = math.hypot(e["x"] - 0.47, e["y"])
        erd_mu = -math.exp(-c3 * 3.0) * 5.5 * bias
        ers_mu =  math.exp(-c4 * 3.0) * 1.6 * bias
        erd_b  = -math.exp(-c3 * 3.4) * 3.6 * bias
        ers_b  =  math.exp(-c4 * 3.4) * 1.2 * bias
        mu.append(erd_mu + ers_mu + (random.random() - 0.5) * 1.4)
        beta.append(erd_b + ers_b + (random.random() - 0.5) * 1.0)
    return mu, beta


def gen_classification():
    base: Dict[str, float] = {}
    total = 0.0
    for k in CLASSES:
        v = 0.06 + random.random() * 0.05
        base[k] = v
        total += v
    boost = 0.55 + random.random() * 0.12
    base[STATE.current_class] += boost
    total += boost
    return STATE.current_class, {k: v / total for k, v in base.items()}


# ── 广播工具 ─────────────────────────────────────────────────────────────
async def broadcast(payload: dict) -> None:
    if not STATE.clients:
        return
    msg = json.dumps(payload, separators=(",", ":"))
    dead: List[WebSocketServerProtocol] = []
    for ws in STATE.clients:
        try:
            await ws.send(msg)
        except Exception:
            dead.append(ws)
    for ws in dead:
        STATE.clients.discard(ws)


# ── 周期任务 ─────────────────────────────────────────────────────────────
async def task_raw_pre() -> None:
    """25 Hz：raw + preprocessed 同步推送。"""
    period = 1.0 / 25.0
    next_t = asyncio.get_event_loop().time()
    while True:
        if STATE.clients:
            raw, pre, ts = gen_raw_and_preprocessed_chunk()
            await broadcast({"type": "raw", "timestamp": ts, "data": raw})
            await broadcast({"type": "preprocessed", "timestamp": ts, "data": pre})
        next_t += period
        delay = next_t - asyncio.get_event_loop().time()
        if delay < 0:
            next_t = asyncio.get_event_loop().time()
        else:
            await asyncio.sleep(delay)


async def task_band_power() -> None:
    """5 Hz."""
    while True:
        await asyncio.sleep(0.2)
        if not STATE.clients:
            continue
        mu, beta = gen_band_power()
        await broadcast({
            "type": "band_power",
            "timestamp": time.time(),
            "mu": mu, "beta": beta,
        })


async def task_classification() -> None:
    """每 3 s 推送一次分类结果。"""
    while True:
        await asyncio.sleep(3.0)
        if not STATE.clients:
            continue
        predicted, probabilities = gen_classification()
        await broadcast({
            "type": "classification",
            "timestamp": time.time(),
            "predicted": predicted,
            "probabilities": probabilities,
        })


# ── WebSocket 连接处理 ──────────────────────────────────────────────────
async def handler(ws: WebSocketServerProtocol, path: Optional[str] = None) -> None:
    addr = getattr(ws, "remote_address", ("?", "?"))
    print(f"[+] 客户端连接: {addr} (path={path or '/'})", flush=True)
    STATE.clients.add(ws)
    try:
        async for raw in ws:
            try:
                msg = json.loads(raw)
            except Exception:
                continue
            mt = msg.get("type")
            if mt == "hello":
                ack = {
                    "type": "hello_ack",
                    "sample_rate": SAMPLE_RATE,
                    "n_channels": N_CHANNELS,
                    "channel_names": CHANNEL_NAMES,
                    "classes": CLASSES,
                }
                await ws.send(json.dumps(ack, separators=(",", ":")))
                await ws.send(json.dumps({
                    "type": "status",
                    "state": "running",
                    "message": "采集中（Python mock）",
                }))
            # 真实后端可能接受其它控制消息，这里全部忽略。
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        STATE.clients.discard(ws)
        print(f"[-] 客户端断开: {addr}", flush=True)


# ── 控制台命令循环 ──────────────────────────────────────────────────────
async def console_loop() -> None:
    loop = asyncio.get_event_loop()
    print(
        "\n输入命令（palm / fist / ok / invert / "
        "err <msg> / quit）后回车：",
        flush=True,
    )
    while True:
        line = await loop.run_in_executor(None, sys.stdin.readline)
        if not line:
            await asyncio.sleep(0.5)
            continue
        cmd = line.strip()
        if not cmd:
            continue
        if cmd in CLASSES:
            STATE.current_class = cmd
            print(f"  → 当前类别: {cmd}", flush=True)
        elif cmd.startswith("err"):
            parts = cmd.split(maxsplit=1)
            msg = parts[1] if len(parts) > 1 else "测试错误消息"
            await broadcast({
                "type": "error",
                "code": "TEST_ERROR",
                "message": msg,
            })
            print("  → 已推送错误消息", flush=True)
        elif cmd in ("quit", "exit", "q"):
            print("退出。", flush=True)
            asyncio.get_event_loop().stop()
            return
        else:
            print(
                "  ? 未知命令。可用: palm / fist / ok / invert "
                "/ err <msg> / quit",
                flush=True,
            )


# ── 主入口 ─────────────────────────────────────────────────────────────
async def main(host: str, port: int) -> None:
    STATE.t0 = time.time()
    server = await websockets.serve(handler, host, port, max_size=2 ** 22)
    print(f"脑电 mock 后端已启动：ws://{host}:{port}/stream", flush=True)
    print(f"  采样率: {SAMPLE_RATE} Hz × {N_CHANNELS} 通道", flush=True)
    print(f"  类别  : {CLASSES}", flush=True)
    print(f"  当前  : {STATE.current_class}", flush=True)

    await asyncio.gather(
        task_raw_pre(),
        task_band_power(),
        task_classification(),
        console_loop(),
        server.wait_closed(),
    )


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="脑电 mock 后端")
    p.add_argument("--host", default="0.0.0.0")
    p.add_argument("--port", type=int, default=8080)
    p.add_argument("--class", dest="initial_class", default="fist", choices=CLASSES)
    return p.parse_args()


if __name__ == "__main__":
    args = parse_args()
    STATE.current_class = args.initial_class
    try:
        asyncio.run(main(args.host, args.port))
    except KeyboardInterrupt:
        print("\n收到中断信号，退出。")
