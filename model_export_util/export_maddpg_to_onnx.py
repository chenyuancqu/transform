#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Export a saved MADDPG actor checkpoint to ONNX files for inference.

Expected checkpoint format (from the training script):
    {
        "actors": [actor0.state_dict(), actor1.state_dict(), ...],
        "critics": [...],
        "target_actors": [...],
        "target_critics": [...],
    }

Exports:
    rover.onnx  : input [batch, 6],  output [batch, 2]
    uav_1.onnx  : input [batch, 10], output [batch, 3]
    uav_2.onnx  : input [batch, 10], output [batch, 3]
    uav_3.onnx  : input [batch, 10], output [batch, 3]

Only Actor networks are needed for inference. The output remains the raw
Tanh action in [-1, 1]. Do not multiply by environment movement scales here
unless the downstream simulation interface is intentionally being changed.
"""

from __future__ import annotations

import argparse
import inspect
import sys
from pathlib import Path
from typing import Any, Dict

import numpy as np
import torch
import torch.nn as nn


class Actor(nn.Module):
    """Keep this architecture identical to Actor in the training script."""

    def __init__(self, obs_dim: int, action_dim: int) -> None:
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(obs_dim, 128),
            nn.ReLU(),
            nn.Linear(128, 128),
            nn.ReLU(),
            nn.Linear(128, action_dim),
            nn.Tanh(),
        )

    def forward(self, obs: torch.Tensor) -> torch.Tensor:
        return self.net(obs)


def safe_load_checkpoint(path: Path) -> Dict[str, Any]:
    """Load the user's own training checkpoint on CPU."""
    try:
        # The saved checkpoint consists of tensors and ordinary containers.
        checkpoint = torch.load(path, map_location="cpu", weights_only=True)
    except TypeError:
        # Compatibility with older PyTorch versions that do not have
        # the weights_only argument. Only load a checkpoint you trust.
        checkpoint = torch.load(path, map_location="cpu")

    if not isinstance(checkpoint, dict):
        raise ValueError("Checkpoint 格式错误：期望 torch.save 保存的字典。")
    if "actors" not in checkpoint:
        available = ", ".join(map(str, checkpoint.keys()))
        raise KeyError(
            "Checkpoint 中没有 'actors' 键。当前脚本需要训练代码保存的完整 checkpoint，"
            f"实际顶层键为：{available or '(空)'}"
        )
    if not isinstance(checkpoint["actors"], (list, tuple)):
        raise ValueError("Checkpoint['actors'] 应该是包含 4 个 Actor state_dict 的列表。")
    if len(checkpoint["actors"]) != 4:
        raise ValueError(
            f"预期 4 个 Actor（母车 + 3 架无人机），实际找到 {len(checkpoint['actors'])} 个。"
        )
    return checkpoint


def export_one_actor(
    actor_state: Dict[str, torch.Tensor],
    obs_dim: int,
    action_dim: int,
    output_path: Path,
    opset: int,
) -> None:
    actor = Actor(obs_dim, action_dim).cpu().eval()
    actor.load_state_dict(actor_state, strict=True)

    example_input = torch.zeros((1, obs_dim), dtype=torch.float32)
    export_kwargs = {
        "input_names": ["state"],
        "output_names": ["action"],
        "dynamic_axes": {
            "state": {0: "batch_size"},
            "action": {0: "batch_size"},
        },
        "opset_version": opset,
    }

    # PyTorch 2.9+ changes exporter defaults in some environments.
    # Explicitly use the legacy exporter when this option is available so
    # exporting requires onnx, not the extra onnxscript package.
    if "dynamo" in inspect.signature(torch.onnx.export).parameters:
        export_kwargs["dynamo"] = False

    with torch.no_grad():
        torch.onnx.export(actor, example_input, str(output_path), **export_kwargs)

    # Parse/check exported file when ONNX is installed (it is required by
    # torch.onnx.export in supported environments).
    try:
        import onnx  # type: ignore

        model = onnx.load(str(output_path))
        onnx.checker.check_model(model)
    except ImportError as exc:
        raise RuntimeError(
            "没有安装 onnx。请使用当前训练环境的 Python 执行："
            "python -m pip install onnx onnxruntime"
        ) from exc

    # Numerical parity test: compare the loaded ONNX with the PyTorch Actor.
    try:
        import onnxruntime as ort  # type: ignore

        session = ort.InferenceSession(str(output_path), providers=["CPUExecutionProvider"])
        test_input = np.random.default_rng(42).uniform(
            -1.0, 1.0, size=(3, obs_dim)
        ).astype(np.float32)
        with torch.no_grad():
            torch_output = actor(torch.from_numpy(test_input)).cpu().numpy()
        ort_output = session.run(["action"], {"state": test_input})[0]
        if torch_output.shape != ort_output.shape:
            raise RuntimeError(
                f"ONNX 输出形状不一致：PyTorch={torch_output.shape}, ONNX={ort_output.shape}"
            )
        max_abs_diff = float(np.max(np.abs(torch_output - ort_output)))
        if not np.allclose(torch_output, ort_output, rtol=1e-4, atol=1e-5):
            raise RuntimeError(
                f"ONNX 与 PyTorch 输出不一致，最大绝对误差={max_abs_diff:.8g}"
            )
        print(f"  校验通过：输入 (3, {obs_dim}) -> 输出 {ort_output.shape}，最大误差={max_abs_diff:.2e}")
    except ImportError:
        print("  提示：未安装 onnxruntime，已导出并通过 ONNX 文件结构检查，但跳过推理一致性测试。")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="将 MADDPG 的 4 个 Actor 从 maddpg_best.pth 导出为 ONNX。"
    )
    # 默认使用用户提供的 Windows 绝对路径；命令行参数仍可覆盖默认值。
    parser.add_argument(
        "--checkpoint",
        type=Path,
        default=Path(r"D:\aitransformer\saved_models\maddpg_best.pth"),
        help=r"训练保存的 checkpoint 路径（默认：D:\aitransformer\saved_models\maddpg_best.pth）",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path(r"D:\aitransformer\onnx_models_v2"),
        help=r"ONNX 输出目录（默认：D:\aitransformer\onnx_models_v2）",
    )
    parser.add_argument(
        "--opset",
        type=int,
        default=17,
        help="ONNX opset 版本（默认：17；若旧运行时不支持，可试 12）",
    )
    args = parser.parse_args()

    checkpoint_path = args.checkpoint.expanduser().resolve()
    output_dir = args.output_dir.expanduser().resolve()

    if not checkpoint_path.is_file():
        print(f"错误：找不到 checkpoint：{checkpoint_path}", file=sys.stderr)
        print(
            "请用 --checkpoint 指定实际的 maddpg_best.pth 路径。",
            file=sys.stderr,
        )
        return 2

    if args.opset < 11:
        print("错误：建议使用 ONNX opset 11 或更高版本。", file=sys.stderr)
        return 2

    print(f"PyTorch 版本：{torch.__version__}")
    print(f"Checkpoint：{checkpoint_path}")
    print(f"输出目录：{output_dir}")

    try:
        checkpoint = safe_load_checkpoint(checkpoint_path)
        output_dir.mkdir(parents=True, exist_ok=True)

        actor_specs = [
            (0, "rover.onnx", 6, 2, "母车"),
            (1, "uav_1.onnx", 10, 3, "无人机 1"),
            (2, "uav_2.onnx", 10, 3, "无人机 2"),
            (3, "uav_3.onnx", 10, 3, "无人机 3"),
        ]

        for actor_index, filename, obs_dim, action_dim, label in actor_specs:
            output_path = output_dir / filename
            print(f"\n导出 {label}: Actor[{actor_index}] -> {output_path.name}")
            print(f"  输入 shape: [batch, {obs_dim}]；输出 shape: [batch, {action_dim}]")
            export_one_actor(
                actor_state=checkpoint["actors"][actor_index],
                obs_dim=obs_dim,
                action_dim=action_dim,
                output_path=output_path,
                opset=args.opset,
            )
            print(f"  已生成：{output_path}")

    except Exception as exc:
        print(f"\n导出失败：{type(exc).__name__}: {exc}", file=sys.stderr)
        return 1

    print("\n全部导出完成。生成的文件：")
    for filename in ("rover.onnx", "uav_1.onnx", "uav_2.onnx", "uav_3.onnx"):
        print(f"  {output_dir / filename}")
    print("\n注意：ONNX 输出仍是 Tanh 原始动作 [-1, 1]，没有乘以 0.03 或 0.06。")
    print("请确认下游仿真模块按训练时约定执行动作缩放，并保持 MQTT state 特征顺序不变。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
