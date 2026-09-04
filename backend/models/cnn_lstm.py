"""
CNN + LSTM混合模型
先用CNN提取空间特征，再用LSTM提取时间序列特征
结合了两者的优势：CNN的空间特征提取能力 + LSTM的时序建模能力
"""

import torch
import torch.nn as nn


class CNN_LSTM(nn.Module):
    """
    CNN+LSTM混合模型
    CNN层提取通道间的空间特征，LSTM层建模时间序列依赖

    参数:
        n_classes: 分类类别数
        n_channels: EEG通道数
        n_samples: 每个试次的采样点数
        cnn_out_channels: CNN输出通道数
        lstm_hidden: LSTM隐藏层大小
        num_lstm_layers: LSTM层数
        dropout_rate: Dropout比率
    """

    def __init__(
        self,
        n_classes: int = 4,
        n_channels: int = 22,
        n_samples: int = 250,
        cnn_out_channels: int = 32,
        lstm_hidden: int = 64,
        num_lstm_layers: int = 2,
        dropout_rate: float = 0.5,
    ) -> None:
        super(CNN_LSTM, self).__init__()

        self.n_classes = n_classes
        self.n_channels = n_channels
        self.n_samples = n_samples

        # ====== CNN层：提取空间特征 ======
        # 使用卷积将n_channels映射到cnn_out_channels
        self.cnn = nn.Sequential(
            nn.Conv2d(
                in_channels=1,
                out_channels=cnn_out_channels,
                kernel_size=(n_channels, 1),  # 在所有通道上做卷积
                bias=False,
            ),
            nn.BatchNorm2d(cnn_out_channels),
            nn.ELU(),
        )

        # ====== LSTM层：提取时间特征 ======
        # 输入: (batch, n_samples, cnn_out_channels)
        self.lstm = nn.LSTM(
            input_size=cnn_out_channels,
            hidden_size=lstm_hidden,
            num_layers=num_lstm_layers,
            batch_first=True,
            bidirectional=True,
            dropout=dropout_rate if num_lstm_layers > 1 else 0.0,
        )

        # ====== 分类器 ======
        self.dropout = nn.Dropout(dropout_rate)
        self.classifier = nn.Linear(lstm_hidden * 2, n_classes)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        前向传播

        参数:
            x: 输入张量，形状为 (batch_size, n_channels, n_samples)

        返回:
            logits: 分类输出，形状为 (batch_size, n_classes)
        """
        # 处理输入维度
        if x.dim() == 4:
            x = x.squeeze(1)
        if x.dim() == 2:
            x = x.unsqueeze(0)

        # 添加通道维度: (batch, 1, n_channels, n_samples)
        x = x.unsqueeze(1)

        # CNN: (batch, 1, n_channels, n_samples) → (batch, cnn_out, 1, n_samples)
        x = self.cnn(x)

        # 移除空间维度: (batch, cnn_out, 1, n_samples) → (batch, cnn_out, n_samples)
        x = x.squeeze(2)

        # 转置为LSTM输入: (batch, cnn_out, n_samples) → (batch, n_samples, cnn_out)
        x = x.permute(0, 2, 1)

        # LSTM: (batch, n_samples, cnn_out) → (batch, n_samples, lstm_hidden*2)
        lstm_out, _ = self.lstm(x)

        # 取最后一个时间步
        last_output = lstm_out[:, -1, :]  # (batch, lstm_hidden*2)

        # Dropout + 分类
        last_output = self.dropout(last_output)
        logits = self.classifier(last_output)

        return logits

    def get_output(self, x: torch.Tensor) -> torch.Tensor:
        """
        获取softmax概率输出

        参数:
            x: 输入张量

        返回:
            softmax概率，形状为 (batch_size, n_classes)
        """
        logits = self.forward(x)
        return torch.softmax(logits, dim=1)
