"""
EEG窗口预处理原型
用于运动想象数据回放与原型验证
使用NumPy/SciPy实现；本项目未测量端到端处理时延
支持带通滤波、陷波滤波、ICA去伪迹、CSP特征提取等功能
"""

import time
import warnings
from typing import Any, Dict, Optional, Tuple

import numpy as np
from scipy import signal
from scipy.linalg import eigh
from sklearn.decomposition import FastICA
from sklearn.preprocessing import StandardScaler

warnings.filterwarnings("ignore", category=RuntimeWarning)


class EEGPreprocessor:
    """
    EEG信号窗口预处理器
    用于运动想象(MI)回放解码；滤波并非因果在线实现
    所有操作基于NumPy数组，避免MNE的耗时操作
    """

    # 运动想象相关频段定义 (Hz)
    BANDS = {
        "mu": (8.0, 13.0),      # mu节律，与运动想象密切相关
        "beta": (13.0, 30.0),   # beta节律，与运动准备和执行相关
        "alpha": (8.0, 12.0),   # alpha节律
        "low_beta": (13.0, 20.0),
        "high_beta": (20.0, 30.0),
    }

    def __init__(
        self,
        sfreq: float = 250.0,
        l_freq: float = 8.0,
        h_freq: float = 30.0,
        notch_freq: float = 50.0,
        ica_components: int = 15,
        use_ica: bool = False,
    ) -> None:
        """
        初始化EEG预处理器

        参数:
            sfreq: 采样率(Hz)，BCICIV_2a默认为250Hz
            l_freq: 带通滤波低截止频率(Hz)，运动想象推荐8Hz(mu节律低端)
            h_freq: 带通滤波高截止频率(Hz)，运动想象推荐30Hz(beta节律高端)
            notch_freq: 陷波滤波频率(Hz)，用于去除工频干扰，默认50Hz(中国)
            ica_components: ICA分解的独立成分数量
            use_ica: 是否在预处理流水线中使用ICA去伪迹（计算开销较大，默认关闭）
        """
        self.sfreq: float = sfreq
        self.l_freq: float = l_freq
        self.h_freq: float = h_freq
        self.notch_freq: float = notch_freq
        self.ica_components: int = ica_components
        self.use_ica: bool = use_ica

        # 预计算滤波器系数以提高实时性能
        self._bandpass_b: Optional[np.ndarray] = None
        self._bandpass_a: Optional[np.ndarray] = None
        self._notch_b: Optional[np.ndarray] = None
        self._notch_a: Optional[np.ndarray] = None
        self._precompute_filters()

        # 标准化器（拟合后缓存）
        self._scaler: Optional[StandardScaler] = None

        # ICA对象（拟合后缓存）
        self._ica: Optional[FastICA] = None

        # 质量指标缓存
        self._last_quality_metrics: Dict[str, float] = {}

    def _precompute_filters(self) -> None:
        """预计算滤波器系数，避免每次滤波时重新计算"""
        # 使用IIR巴特沃斯滤波器（比FIR计算效率高，适合实时处理）
        nyquist = self.sfreq / 2.0

        # 带通滤波器 (8-30Hz，覆盖mu和beta节律)
        low_norm = self.l_freq / nyquist
        high_norm = self.h_freq / nyquist
        # 使用4阶巴特沃斯滤波器，零相位滤波
        self._bandpass_b, self._bandpass_a = signal.butter(
            N=4,
            Wn=[low_norm, high_norm],
            btype="bandpass",
        )

        # 陷波滤波器 (50Hz工频)
        notch_norm = self.notch_freq / nyquist
        # 使用2阶陷波滤波器，带宽为2Hz
        bw = 2.0 / nyquist  # 带宽
        self._notch_b, self._notch_a = signal.iirnotch(
            w0=notch_norm,
            Q=self.notch_freq / bw,
        )

    def notch_filter(self, data: np.ndarray, freq: Optional[float] = None) -> np.ndarray:
        """
        陷波滤波：去除指定频率的工频干扰

        参数:
            data: 输入EEG数据，形状为(n_channels, n_samples)
            freq: 陷波频率(Hz)，None则使用初始化时的默认值

        返回:
            滤波后的数据，形状与输入相同
        """
        if freq is not None and freq != self.notch_freq:
            # 临时计算新的陷波滤波器
            nyquist = self.sfreq / 2.0
            notch_norm = freq / nyquist
            bw = 2.0 / nyquist
            b, a = signal.iirnotch(w0=notch_norm, Q=freq / bw)
            return signal.filtfilt(b, a, data, axis=1)

        return signal.filtfilt(self._notch_b, self._notch_a, data, axis=1)

    def bandpass_filter(self, data: np.ndarray) -> np.ndarray:
        """
        带通滤波：保留运动想象相关频段(8-30Hz)
        使用零相位滤波(filtfilt)，会访问当前窗口内的未来样本

        参数:
            data: 输入EEG数据，形状为(n_channels, n_samples)

        返回:
            滤波后的数据，形状与输入相同
        """
        return signal.filtfilt(self._bandpass_b, self._bandpass_a, data, axis=1)

    def apply_ica(
        self,
        data: np.ndarray,
        n_components: Optional[int] = None,
        fit: bool = False,
    ) -> np.ndarray:
        """
        ICA（独立成分分析）去伪迹
        去除眼电(EOG)、肌电(EMG)等伪迹
        注意：ICA计算开销较大，在实时系统中可离线拟合后在线应用

        参数:
            data: 输入EEG数据，形状为(n_channels, n_samples)
            n_components: ICA成分数量，None则使用初始化时的默认值
            fit: 是否重新拟合ICA模型，True用于训练阶段，False用于实时推理

        返回:
            去伪迹后的数据，形状与输入相同
        """
        n_comp = n_components or self.ica_components
        n_channels, n_samples = data.shape

        # 确保成分数不超过通道数
        n_comp = min(n_comp, n_channels)

        # 转置数据以符合sklearn的格式: (n_samples, n_channels)
        data_t = data.T  # (n_samples, n_channels)

        if fit or self._ica is None:
            # 训练阶段：拟合ICA模型
            self._ica = FastICA(
                n_components=n_comp,
                random_state=42,
                max_iter=200,
                tol=0.001,
            )
            ica_components = self._ica.fit_transform(data_t)  # (n_samples, n_comp)
            # 识别并去除伪迹成分（简单启发式方法）
            # 实际应用中可使用更复杂的伪迹识别算法
            component_var = np.var(ica_components, axis=0)
            # 去除方差最大的前2个成分（通常对应眼电伪迹）
            artifact_indices = np.argsort(component_var)[-2:]
            ica_components[:, artifact_indices] = 0
            # 反变换
            data_clean = self._ica.inverse_transform(ica_components)
        else:
            # 实时推理阶段：使用已拟合的模型
            ica_components = self._ica.transform(data_t)
            # 同样去除伪迹成分
            component_var = np.var(ica_components, axis=0)
            artifact_indices = np.argsort(component_var)[-2:]
            ica_components[:, artifact_indices] = 0
            data_clean = self._ica.inverse_transform(ica_components)

        return data_clean.T  # 转回 (n_channels, n_samples)

    def apply_csp(
        self,
        data: np.ndarray,
        labels: Optional[np.ndarray] = None,
        n_filters: int = 6,
    ) -> np.ndarray:
        """
        CSP（共同空间模式）特征提取
        用于运动想象任务的经典特征提取方法
        能最大化两类信号方差比的滤波器

        参数:
            data: 输入EEG数据，形状为(n_trials, n_channels, n_samples)
            labels: 试次标签，形状为(n_trials,)，None则不执行CSP
            n_filters: CSP滤波器对数（每类n_filters个），默认6对

        返回:
            CSP特征，形状为(n_trials, 2*n_filters)
        """
        if labels is None:
            # 如果没有标签，无法计算CSP，直接返回展平的数据
            return data.reshape(data.shape[0], -1)

        n_trials, n_channels, n_samples = data.shape
        class_labels = np.unique(labels)
        n_classes = len(class_labels)

        if n_classes < 2:
            return data.reshape(n_trials, -1)

        # 计算每个类别的协方差矩阵
        cov_matrices = []
        for c in class_labels:
            class_data = data[labels == c]  # (n_trials_c, n_channels, n_samples)
            # 计算平均协方差
            cov_sum = np.zeros((n_channels, n_channels))
            for trial in class_data:
                # 去均值
                trial_centered = trial - np.mean(trial, axis=1, keepdims=True)
                cov = np.dot(trial_centered, trial_centered.T) / trial.shape[1]
                cov_sum += cov
            cov_avg = cov_sum / len(class_data)
            cov_matrices.append(cov_avg)

        # 计算复合协方差矩阵
        cov_total = sum(cov_matrices)

        # 特征值分解
        eigvals, eigvecs = eigh(cov_matrices[0], cov_total)

        # 选择最前面和最后面的特征向量
        # 前面的对应第一类方差最大，最后面的对应第二类方差最大
        sorted_indices = np.argsort(eigvals)[::-1]
        csp_filters = eigvecs[:, sorted_indices]

        # 选择n_filters对（前后各n_filters个）
        selected_filters = np.concatenate([
            csp_filters[:, :n_filters],
            csp_filters[:, -n_filters:]
        ], axis=1)  # (n_channels, 2*n_filters)

        # 应用CSP滤波器到所有试次
        features = np.zeros((n_trials, 2 * n_filters))
        for i in range(n_trials):
            filtered = np.dot(selected_filters.T, data[i])  # (2*n_filters, n_samples)
            # 计算对数方差特征
            var = np.var(filtered, axis=1)
            features[i] = np.log(var + 1e-10)

        return features

    def standardize(
        self,
        data: np.ndarray,
        fit: bool = False,
    ) -> np.ndarray:
        """
        Z-score标准化：对每个通道独立进行标准化

        参数:
            data: 输入数据，形状为(n_channels, n_samples)
            fit: 是否拟合标准化参数，True用于训练阶段

        返回:
            标准化后的数据
        """
        # 逐通道标准化 (n_channels, n_samples)
        mean = np.mean(data, axis=1, keepdims=True)
        std = np.std(data, axis=1, keepdims=True)
        std[std == 0] = 1.0  # 避免除零
        return (data - mean) / std

    def compute_psd(
        self,
        data: np.ndarray,
        sfreq: Optional[float] = None,
    ) -> Dict[str, np.ndarray]:
        """
        计算功率谱密度(PSD)

        参数:
            data: 输入EEG数据，形状为(n_channels, n_samples)
            sfreq: 采样率，None则使用初始化时的默认值

        返回:
            包含'freqs'和'psd'的字典:
                - freqs: 频率数组
                - psd: 功率谱密度，形状为(n_channels, n_freqs)
        """
        fs = sfreq or self.sfreq
        n_channels, n_samples = data.shape

        # 使用Welch方法计算PSD
        freqs, psd = signal.welch(
            data,
            fs=fs,
            nperseg=min(256, n_samples),
            axis=1,
        )

        return {
            "freqs": freqs,      # 频率轴
            "psd": psd,          # 功率谱 (n_channels, n_freqs)
        }

    def compute_band_powers(
        self,
        data: np.ndarray,
        sfreq: Optional[float] = None,
    ) -> Dict[str, np.ndarray]:
        """
        计算各频段能量

        参数:
            data: 输入EEG数据，形状为(n_channels, n_samples)
            sfreq: 采样率，None则使用初始化时的默认值

        返回:
            频段名到能量数组的映射，每个数组形状为(n_channels,)
        """
        fs = sfreq or self.sfreq
        psd_result = self.compute_psd(data, fs)
        freqs = psd_result["freqs"]
        psd = psd_result["psd"]

        band_powers = {}
        for band_name, (low, high) in self.BANDS.items():
            # 找到频段范围内的频率索引
            idx = np.logical_and(freqs >= low, freqs <= high)
            if np.any(idx):
                # 在该频段内对PSD进行积分
                power = np.trapz(psd[:, idx], freqs[idx], axis=1)
                band_powers[band_name] = power
            else:
                band_powers[band_name] = np.zeros(psd.shape[0])

        # 计算总功率
        band_powers["total"] = np.trapz(psd, freqs, axis=1)

        return band_powers

    def compute_snr(
        self,
        raw_data: np.ndarray,
        filtered_data: np.ndarray,
    ) -> Dict[str, float]:
        """
        计算信噪比(SNR)指标

        参数:
            raw_data: 原始EEG数据
            filtered_data: 滤波后的EEG数据

        返回:
            包含各SNR指标的字典
        """
        # 信号功率 (滤波后保留的频段)
        signal_power = np.mean(filtered_data ** 2)

        # 噪声功率 (原始信号减去滤波信号)
        noise = raw_data - filtered_data
        noise_power = np.mean(noise ** 2)

        if noise_power == 0:
            snr_db = 100.0
        else:
            snr_db = 10.0 * np.log10(signal_power / noise_power)

        # 计算每个通道的SNR
        channel_snr = []
        for ch in range(raw_data.shape[0]):
            sig_p = np.mean(filtered_data[ch] ** 2)
            noise_p = np.mean(noise[ch] ** 2)
            if noise_p > 0:
                channel_snr.append(10.0 * np.log10(sig_p / noise_p))
            else:
                channel_snr.append(100.0)

        return {
            "snr_db": float(snr_db),
            "snr_per_channel": [float(s) for s in channel_snr],
            "mean_snr": float(np.mean(channel_snr)),
            "signal_power": float(signal_power),
            "noise_power": float(noise_power),
        }

    def get_quality_metrics(
        self,
        raw_data: np.ndarray,
        preprocessed_data: np.ndarray,
    ) -> Dict[str, Any]:
        """
        计算信号质量指标

        参数:
            raw_data: 原始数据
            preprocessed_data: 预处理后数据

        返回:
            质量指标字典
        """
        snr_metrics = self.compute_snr(raw_data, preprocessed_data)

        # 计算各通道的方差
        channel_var = np.var(preprocessed_data, axis=1)

        # 检测可能的坏通道（方差过大或过小）
        mean_var = np.mean(channel_var)
        bad_channel_threshold = 5.0  # 方差超过均值5倍的通道视为坏通道
        bad_channels = np.where(channel_var > mean_var * bad_channel_threshold)[0].tolist()

        quality_metrics = {
            **snr_metrics,
            "channel_variance": [float(v) for v in channel_var],
            "mean_variance": float(mean_var),
            "bad_channels": bad_channels,
            "n_bad_channels": len(bad_channels),
            "signal_range_uv": {
                "min": float(np.min(preprocessed_data)),
                "max": float(np.max(preprocessed_data)),
                "mean_amplitude": float(np.mean(np.abs(preprocessed_data))),
            },
        }

        self._last_quality_metrics = quality_metrics
        return quality_metrics

    def preprocess_pipeline(
        self,
        data: np.ndarray,
        apply_ica: bool = False,
        compute_features: bool = True,
    ) -> Dict[str, Any]:
        """
        完整预处理流水线
        步骤: 陷波滤波 → 带通滤波 → 标准化 → (可选)ICA

        参数:
            data: 输入EEG数据，形状为(n_channels, n_samples)
            apply_ica: 是否应用ICA去伪迹
            compute_features: 是否计算PSD和频段能量

        返回:
            包含以下字段的字典:
                - preprocessed_data: 预处理后的数据
                - psd: PSD功率谱信息（如果compute_features=True）
                - band_powers: 各频段能量（如果compute_features=True）
                - quality_metrics: 信号质量指标
        """
        raw_data = data.copy()
        start_time = time.time()

        # Step 1: 陷波滤波（去除50Hz工频干扰）
        data = self.notch_filter(data)

        # Step 2: 带通滤波（8-30Hz，mu和beta节律）
        data = self.bandpass_filter(data)

        # Step 3: Z-score标准化
        data = self.standardize(data)

        # Step 4: (可选)ICA去伪迹
        if apply_ica or self.use_ica:
            data = self.apply_ica(data, fit=False)

        elapsed = time.time() - start_time

        result: Dict[str, Any] = {
            "preprocessed_data": data,
            "processing_time_sec": elapsed,
        }

        # 计算PSD和频段能量
        if compute_features:
            psd_result = self.compute_psd(data)
            result["psd"] = psd_result
            result["band_powers"] = self.compute_band_powers(data)

        # 计算质量指标
        result["quality_metrics"] = self.get_quality_metrics(raw_data, data)

        return result

    def preprocess_for_training(
        self,
        data: np.ndarray,
        labels: Optional[np.ndarray] = None,
        apply_ica: bool = False,
    ) -> Dict[str, Any]:
        """
        用于训练阶段的预处理流水线（拟合标准化和ICA参数）

        参数:
            data: 输入数据，形状为(n_channels, n_samples)
            labels: 可选的标签数据
            apply_ica: 是否拟合并应用ICA

        返回:
            预处理结果字典
        """
        raw_data = data.copy()

        # Step 1: 陷波滤波
        data = self.notch_filter(data)

        # Step 2: 带通滤波
        data = self.bandpass_filter(data)

        # Step 3: 标准化（拟合参数）
        data = self.standardize(data)

        # Step 4: ICA（拟合并应用）
        if apply_ica:
            data = self.apply_ica(data, fit=True)

        result: Dict[str, Any] = {
            "preprocessed_data": data,
        }

        psd_result = self.compute_psd(data)
        result["psd"] = psd_result
        result["band_powers"] = self.compute_band_powers(data)
        result["quality_metrics"] = self.get_quality_metrics(raw_data, data)

        # 如果提供了标签，计算CSP特征
        if labels is not None:
            result["csp_features"] = self.apply_csp(
                data[np.newaxis, ...], labels
            )

        return result
