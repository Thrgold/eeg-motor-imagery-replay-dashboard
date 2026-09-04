"""
EEG数据读取模块
支持BCICIV_2a (.gdf格式) 和卡内基梅隆大学数据集 (.set格式) 的读取
提供实时数据流模拟功能
"""

import asyncio
import time
import warnings
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, AsyncGenerator, Dict, Generator, List, Optional, Tuple

import mne
import numpy as np
import scipy.io


# 忽略MNE的警告信息，减少输出干扰
warnings.filterwarnings("ignore", category=RuntimeWarning)

# BCICIV_2a数据集的事件ID映射
BCICIV_EVENT_MAP = {
    768: "trial_start",   # 试次开始
    769: "left_hand",     # 左手运动想象
    770: "right_hand",    # 右手运动想象
    771: "feet",          # 双脚运动想象
    772: "tongue",        # 舌头运动想象
    783: "unknown",       # 未知标记（测试集）
}

# 22个EEG通道的标准10-20系统位置坐标 (用于图卷积网络)
# 坐标格式: (x, y, z)，基于标准10-20系统
CHANNEL_POSITIONS_22 = {
    "Fz": (0.0, 0.637, 0.309),
    "FC3": (-0.312, 0.468, 0.309),
    "FC1": (-0.156, 0.468, 0.387),
    "FCz": (0.0, 0.468, 0.454),
    "FC2": (0.156, 0.468, 0.387),
    "FC4": (0.312, 0.468, 0.309),
    "C5": (-0.416, 0.277, 0.309),
    "C3": (-0.312, 0.277, 0.454),
    "C1": (-0.156, 0.277, 0.559),
    "Cz": (0.0, 0.277, 0.637),
    "C2": (0.156, 0.277, 0.559),
    "C4": (0.312, 0.277, 0.454),
    "C6": (0.416, 0.277, 0.309),
    "CP3": (-0.312, 0.092, 0.309),
    "CP1": (-0.156, 0.092, 0.387),
    "CPz": (0.0, 0.092, 0.454),
    "CP2": (0.156, 0.092, 0.387),
    "CP4": (0.312, 0.092, 0.309),
    "P1": (-0.156, -0.092, 0.309),
    "Pz": (0.0, -0.092, 0.387),
    "P2": (0.156, -0.092, 0.309),
    "POz": (0.0, -0.277, 0.309),
}


class BaseEEGReader(ABC):
    """
    EEG数据读取器抽象基类
    定义了所有数据读取器必须实现的接口
    """

    def __init__(self, file_path: str) -> None:
        """
        初始化数据读取器

        参数:
            file_path: EEG数据文件的绝对路径
        """
        self.file_path: str = file_path
        self.raw: Optional[mne.io.BaseRaw] = None
        self._data: Optional[np.ndarray] = None
        self._times: Optional[np.ndarray] = None

    @abstractmethod
    def read_raw(self) -> mne.io.BaseRaw:
        """读取原始数据并返回mne.Raw对象"""
        pass

    @abstractmethod
    def get_info(self) -> Dict[str, Any]:
        """获取数据的基本信息"""
        pass

    @abstractmethod
    def get_events(self) -> List[Dict[str, Any]]:
        """获取事件标记列表"""
        pass

    def get_data(self) -> Tuple[np.ndarray, np.ndarray]:
        """
        获取所有通道数据和时间轴

        返回:
            (data, times): data形状为(n_channels, n_samples), times形状为(n_samples,)
        """
        if self.raw is None:
            self.read_raw()
        if self._data is None:
            self._data, self._times = self.raw.get_data(return_times=True)
        return self._data, self._times

    def get_epoch_generator(
        self, epoch_length: float = 1.0
    ) -> Generator[np.ndarray, None, None]:
        """
        生成器：按指定时长分段 yield 数据

        参数:
            epoch_length: 每段数据的时长（秒），默认1.0秒

        Yields:
            形状为 (n_channels, n_samples_per_epoch) 的数据段
        """
        data, times = self.get_data()
        sfreq = self.raw.info["sfreq"]
        samples_per_epoch = int(sfreq * epoch_length)
        n_samples = data.shape[1]

        # 逐段yield数据
        start = 0
        while start < n_samples:
            end = min(start + samples_per_epoch, n_samples)
            epoch = data[:, start:end]
            # 如果最后一段不足，补零
            if epoch.shape[1] < samples_per_epoch:
                pad_width = samples_per_epoch - epoch.shape[1]
                epoch = np.pad(epoch, ((0, 0), (0, pad_width)), mode="constant")
            yield epoch
            start += samples_per_epoch

    def get_channel_names(self) -> List[str]:
        """获取通道名称列表"""
        if self.raw is None:
            self.read_raw()
        return self.raw.ch_names

    def get_channel_positions(self) -> Dict[str, Tuple[float, float, float]]:
        """
        获取通道的空间位置坐标

        返回:
            通道名称到(x, y, z)坐标的映射字典
        """
        channel_names = self.get_channel_names()
        positions = {}
        for ch_name in channel_names:
            # 移除可能的空格和大小写差异进行匹配
            clean_name = ch_name.strip().upper()
            for key, pos in CHANNEL_POSITIONS_22.items():
                if key.upper() == clean_name:
                    positions[ch_name] = pos
                    break
            else:
                # 如果找不到匹配，设置一个默认位置
                positions[ch_name] = (0.0, 0.0, 0.0)
        return positions


class BCICIVDataReader(BaseEEGReader):
    """
    BCICIV_2a数据集读取器
    支持.gdf格式的BCI Competition IV 2a数据集
    数据集参数: 250Hz采样率, 22个EEG通道+3个EOG通道, 4类运动想象任务
    """

    # 22个EEG通道名称（BCICIV_2a标准）
    EEG_CHANNELS = [
        "Fz", "FC3", "FC1", "FCz", "FC2", "FC4",
        "C5", "C3", "C1", "Cz", "C2", "C4", "C6",
        "CP3", "CP1", "CPz", "CP2", "CP4",
        "P1", "Pz", "P2", "POz",
    ]

    # 3个EOG通道名称
    EOG_CHANNELS = ["EOG-left", "EOG-central", "EOG-right"]

    def read_raw(self) -> mne.io.BaseRaw:
        """
        读取BCICIV_2a .gdf文件

        返回:
            mne.io.Raw对象
        """
        if self.raw is not None:
            return self.raw

        # 使用mne读取.gdf文件
        self.raw = mne.io.read_raw_gdf(
            self.file_path,
            preload=True,  # 预加载到内存，提高访问速度
            verbose=False,  # 减少输出信息
        )

        # 仅保留22个EEG通道（移除EOG通道）
        eeg_ch_names = [ch for ch in self.raw.ch_names if ch in self.EEG_CHANNELS]
        if len(eeg_ch_names) == 22:
            self.raw.pick_channels(eeg_ch_names)

        # 设置通道类型为EEG
        self.raw.set_channel_types({ch: "eeg" for ch in self.raw.ch_names})

        return self.raw

    def get_info(self) -> Dict[str, Any]:
        """
        获取BCICIV_2a数据集的基本信息

        返回:
            包含数据集信息的字典
        """
        if self.raw is None:
            self.read_raw()

        data, times = self.get_data()
        info = {
            "dataset": "BCICIV_2a",
            "file_path": self.file_path,
            "file_name": Path(self.file_path).name,
            "n_channels": self.raw.info["nchan"],
            "channel_names": self.raw.ch_names,
            "sfreq": self.raw.info["sfreq"],
            "duration_sec": times[-1] if len(times) > 0 else 0,
            "n_samples": data.shape[1],
            "channel_types": self.raw.get_channel_types(),
            "event_map": BCICIV_EVENT_MAP,
            "n_classes": 4,
            "class_labels": ["left_hand", "right_hand", "feet", "tongue"],
        }
        return info

    def get_events(self) -> List[Dict[str, Any]]:
        """
        获取BCICIV_2a数据集的事件标记

        返回:
            事件列表，每个事件包含时间戳、事件ID和事件描述
        """
        if self.raw is None:
            self.read_raw()

        # 从raw数据中读取事件
        try:
            events, event_id = mne.events_from_annotations(
                self.raw, verbose=False
            )
        except (ValueError, KeyError):
            # 如果无法读取事件，返回空列表
            return []

        event_list = []
        for event in events:
            sample_idx = int(event[0])
            event_code = int(event[2])
            time_sec = sample_idx / self.raw.info["sfreq"]

            # 映射事件ID到描述
            event_desc = BCICIV_EVENT_MAP.get(event_code, f"unknown_{event_code}")

            event_list.append(
                {
                    "sample": sample_idx,
                    "time_sec": round(time_sec, 3),
                    "event_id": event_code,
                    "event_desc": event_desc,
                }
            )

        return event_list

    def get_eeg_only_data(self) -> np.ndarray:
        """
        获取仅包含22个EEG通道的数据

        返回:
            形状为 (22, n_samples) 的EEG数据数组
        """
        data, _ = self.get_data()
        # 如果通道数超过22，只取前22个（EEG通道）
        if data.shape[0] > 22:
            return data[:22, :]
        return data


class CarnegieMellonDataReader(BaseEEGReader):
    """
    卡内基梅隆大学EEG数据集读取器
    支持EEGLAB的.set格式文件
    """

    def read_raw(self) -> mne.io.BaseRaw:
        """
        读取EEGLAB .set文件

        返回:
            mne.io.Raw对象
        """
        if self.raw is not None:
            return self.raw

        # 使用mne读取EEGLAB .set文件
        self.raw = mne.io.read_raw_eeglab(
            self.file_path,
            preload=True,
            verbose=False,
        )

        return self.raw

    def get_info(self) -> Dict[str, Any]:
        """
        获取卡内基梅隆数据集的基本信息

        返回:
            包含数据集信息的字典
        """
        if self.raw is None:
            self.read_raw()

        data, times = self.get_data()
        info = {
            "dataset": "CarnegieMellon",
            "file_path": self.file_path,
            "file_name": Path(self.file_path).name,
            "n_channels": self.raw.info["nchan"],
            "channel_names": self.raw.ch_names,
            "sfreq": self.raw.info["sfreq"],
            "duration_sec": times[-1] if len(times) > 0 else 0,
            "n_samples": data.shape[1],
            "channel_types": self.raw.get_channel_types(),
        }
        return info

    def get_events(self) -> List[Dict[str, Any]]:
        """
        获取卡内基梅隆数据集的事件标记

        返回:
            事件列表
        """
        if self.raw is None:
            self.read_raw()

        try:
            events, event_id = mne.events_from_annotations(
                self.raw, verbose=False
            )
        except (ValueError, KeyError):
            return []

        event_list = []
        for event in events:
            sample_idx = int(event[0])
            event_code = int(event[2])
            time_sec = sample_idx / self.raw.info["sfreq"]

            event_list.append(
                {
                    "sample": sample_idx,
                    "time_sec": round(time_sec, 3),
                    "event_id": event_code,
                    "event_desc": str(event_code),
                }
            )

        return event_list


class FieldTripMATReader(BaseEEGReader):
    """
    FieldTrip .mat 格式读取器
    Supports compatible FieldTrip MATLAB datasets
    通道数: 128, 采样率: 1024Hz, 类别: 4类运动想象
    """

    def read_raw(self) -> mne.io.BaseRaw:
        """
        读取FieldTrip .mat文件，转换为MNE Raw对象

        返回:
            mne.io.RawArray对象
        """
        if self.raw is not None:
            return self.raw

        mat = scipy.io.loadmat(self.file_path, simplify_cells=True)
        eeg = mat["eeg"]

        data = eeg["data"]  # shape: (n_channels, n_samples)
        sfreq = float(eeg["fsample"])
        ch_names = list(eeg["label"])

        # 确保数据是浮点型
        if not np.issubdtype(data.dtype, np.floating):
            data = data.astype(np.float64)

        # 创建MNE Info和RawArray
        info = mne.create_info(ch_names=ch_names, sfreq=sfreq, ch_types="eeg")
        self.raw = mne.io.RawArray(data, info, verbose=False)
        return self.raw

    def get_info(self) -> Dict[str, Any]:
        """获取数据集基本信息"""
        if self.raw is None:
            self.read_raw()
        data, times = self.get_data()
        return {
            "dataset": "FieldTrip_S01",
            "file_path": self.file_path,
            "file_name": Path(self.file_path).name,
            "n_channels": self.raw.info["nchan"],
            "channel_names": self.raw.ch_names,
            "sfreq": self.raw.info["sfreq"],
            "duration_sec": times[-1] if len(times) > 0 else 0,
            "n_samples": data.shape[1],
            "channel_types": self.raw.get_channel_types(),
            "n_classes": 4,
            "class_labels": ["left_hand", "right_hand", "feet", "tongue"],
        }

    def get_events(self) -> List[Dict[str, Any]]:
        """获取事件标记（只提取Target事件）"""
        mat = scipy.io.loadmat(self.file_path, simplify_cells=True)
        events = mat.get("event", [])
        event_list = []
        for ev in events:
            if ev["type"] == "Target":
                event_list.append(
                    {
                        "sample": int(ev["sample"]),
                        "time_sec": round(int(ev["sample"]) / self.raw.info["sfreq"], 3),
                        "event_id": int(ev["value"]),
                        "event_desc": f"Target_{ev['value']}",
                    }
                )
        return event_list

    def get_trials(
        self, tmin: float = 0.5, tmax: float = 4.5
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        按Trial切分数据，返回带标签的Epochs

        参数:
            tmin: 相对于Target onset的起始时间（秒）
            tmax: 相对于Target onset的结束时间（秒）

        返回:
            X: (n_trials, n_channels, n_samples)
            y: (n_trials,)
        """
        mat = scipy.io.loadmat(self.file_path, simplify_cells=True)
        eeg = mat["eeg"]
        data = eeg["data"]  # (128, n_samples_total)
        sfreq = float(eeg["fsample"])
        events = mat["event"]

        trials = []
        labels = []
        trial_len = int((tmax - tmin) * sfreq)

        for i, ev in enumerate(events):
            if ev["type"] == "Target":
                onset = int(ev["sample"])
                label = int(ev["value"]) - 1  # 转为0-based

                # 寻找对应的TrialEnd
                trial_end = None
                for j in range(i + 1, len(events)):
                    if events[j]["type"] == "TrialEnd":
                        trial_end = int(events[j]["sample"])
                        break

                if trial_end is None:
                    continue

                start = onset + int(tmin * sfreq)
                end = start + trial_len

                if end > data.shape[1] or end > trial_end:
                    continue

                trial_data = data[:, start:end].astype(np.float32)
                trials.append(trial_data)
                labels.append(label)

        if len(trials) == 0:
            return np.array([]), np.array([])

        X = np.stack(trials, axis=0)  # (n_trials, 128, trial_len)
        y = np.array(labels, dtype=np.int64)
        return X, y


async def simulate_realtime_stream(
    reader: BaseEEGReader,
    interval: float = 1.0,
    channel_subset: Optional[List[str]] = None,
) -> AsyncGenerator[Tuple[np.ndarray, float], None]:
    """
    异步生成器：模拟实时EEG数据流
    按照指定的时间间隔逐段yield数据

    参数:
        reader: EEG数据读取器实例
        interval: 每次发送的时间间隔（秒），默认1.0秒
        channel_subset: 可选的通道子集，None表示使用所有通道

    Yields:
        (data_segment, timestamp): 
            - data_segment: 形状为 (n_channels, n_samples_per_interval) 的数据段
            - timestamp: 当前数据段的时间戳（秒）
    """
    # 预加载所有数据
    data, times = reader.get_data()
    sfreq = reader.raw.info["sfreq"]
    samples_per_interval = int(sfreq * interval)
    n_samples = data.shape[1]

    # 如果指定了通道子集，只保留指定通道
    if channel_subset is not None:
        all_channels = reader.get_channel_names()
        ch_indices = [
            all_channels.index(ch)
            for ch in channel_subset
            if ch in all_channels
        ]
        data = data[ch_indices, :]

    # 计算起始时间
    start_time = asyncio.get_event_loop().time()

    start = 0
    while start < n_samples:
        # 获取当前数据段
        end = min(start + samples_per_interval, n_samples)
        segment = data[:, start:end]

        # 如果数据段不足，补零
        if segment.shape[1] < samples_per_interval:
            pad_width = samples_per_interval - segment.shape[1]
            segment = np.pad(segment, ((0, 0), (0, pad_width)), mode="constant")

        # 计算当前的时间戳（相对于数据开始的时间）
        data_timestamp = times[start] if start < len(times) else times[-1]

        yield segment, float(data_timestamp)

        # 计算已经过去的时间
        elapsed = asyncio.get_event_loop().time() - start_time
        target_time = (start + samples_per_interval) / sfreq

        # 等待以保持实时节奏
        wait_time = target_time - elapsed
        if wait_time > 0:
            await asyncio.sleep(wait_time)

        start += samples_per_interval


class PreprocessedRunReader:
    """
    读取预处理后的单个 run (.npz) 文件
    用于 S02 实时模拟流
    """

    def __init__(self, npz_path: str) -> None:
        self.npz_path = Path(npz_path)
        data = np.load(npz_path, allow_pickle=True)
        self.trials = data["trials"]          # (n_trials, n_channels, n_samples)
        self.labels = data["labels"]          # (n_trials,)
        self.rest_list = data["rest_segments"]
        self.sfreq = float(data["sfreq"])
        self.channel_names = list(data.get("channel_names", []))
        self.run_name = self.npz_path.stem.replace("_preprocessed", "")

    def get_info(self) -> Dict[str, Any]:
        return {
            "run_name": self.run_name,
            "n_trials": int(self.trials.shape[0]),
            "n_rest_segments": len(self.rest_list),
            "n_channels": int(self.trials.shape[1]),
            "trial_samples": int(self.trials.shape[2]),
            "sfreq": self.sfreq,
            "channel_names": self.channel_names,
        }


def load_session_runs(session_dir: str) -> List[PreprocessedRunReader]:
    """加载一个 session 目录下的所有 run"""
    session_path = Path(session_dir)
    runs = []
    for npz_file in sorted(session_path.glob("*_preprocessed.npz")):
        runs.append(PreprocessedRunReader(str(npz_file)))
    return runs


async def simulate_preprocessed_stream(
    runs: List[PreprocessedRunReader],
    window_sec: float = 1.0,
    step_sec: float = 0.5,
    speed_multiplier: float = 1.0,
) -> AsyncGenerator[Dict[str, Any], None]:
    """
    从预处理后的 runs 模拟实时滑动窗口流

    Yields:
        {
            "data": np.ndarray,       # (n_channels, n_samples)
            "timestamp": float,
            "source": str,            # "mi" or "rest"
            "true_label": int,        # MI标签(0=Thumb,1=Index,2=Middle,3=Pinky) 或 -1(Rest)
            "run_name": str,
            "window_idx": int,
        }
    """
    window_samples = int(runs[0].sfreq * window_sec)
    step_samples = int(runs[0].sfreq * step_sec)

    for run in runs:
        # 1. 先输出 MI trials 的滑动窗口
        for trial_idx in range(run.trials.shape[0]):
            trial_data = run.trials[trial_idx]  # (n_channels, trial_samples)
            label = int(run.labels[trial_idx])
            start = 0
            widx = 0
            while start + window_samples <= trial_data.shape[1]:
                seg = trial_data[:, start:start + window_samples].copy()
                yield {
                    "data": seg,
                    "timestamp": time.time(),
                    "source": "mi",
                    "true_label": label,
                    "run_name": run.run_name,
                    "window_idx": widx,
                }
                await asyncio.sleep(step_sec / speed_multiplier)
                start += step_samples
                widx += 1

        # 2. 再输出 Rest segments 的滑动窗口
        for rest_idx, rest_seg in enumerate(run.rest_list):
            if not isinstance(rest_seg, np.ndarray):
                continue
            start = 0
            widx = 0
            while start + window_samples <= rest_seg.shape[1]:
                seg = rest_seg[:, start:start + window_samples].copy()
                yield {
                    "data": seg,
                    "timestamp": time.time(),
                    "source": "rest",
                    "true_label": -1,
                    "run_name": run.run_name,
                    "window_idx": widx,
                }
                await asyncio.sleep(step_sec / speed_multiplier)
                start += step_samples
                widx += 1


# 便捷函数：根据文件扩展名自动选择读取器
def get_reader(file_path: str) -> BaseEEGReader:
    """
    根据文件扩展名自动选择合适的数据读取器

    参数:
        file_path: EEG数据文件路径

    返回:
        对应的数据读取器实例

    异常:
        ValueError: 不支持的文件格式
    """
    path = Path(file_path)
    ext = path.suffix.lower()

    if ext == ".gdf":
        return BCICIVDataReader(file_path)
    elif ext == ".set":
        return CarnegieMellonDataReader(file_path)
    elif ext == ".mat":
        return FieldTripMATReader(file_path)
    else:
        raise ValueError(
            f"不支持的文件格式: {ext}。支持的格式: .gdf (BCICIV), .set (EEGLAB), .mat (FieldTrip)"
        )
