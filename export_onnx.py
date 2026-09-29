import os
import torch
import torch.nn as nn


# 1. 定义与训练时一致的 Actor 结构
class Actor(nn.Module):

  def __init__(self, obs_dim, action_dim):
    super(Actor, self).__init__()
    self.net = nn.Sequential(
        nn.Linear(obs_dim, 128),
        nn.ReLU(),
        nn.Linear(128, 128),
        nn.ReLU(),
        nn.Linear(128, action_dim),
        nn.Tanh(),
    )

  def forward(self, obs):
    return self.net(obs)


def export_maddpg_to_onnx():
  checkpoint_path = 'saved_models/maddpg_best.pth'
  output_dir = 'onnx_models'
  os.makedirs(output_dir, exist_ok=True)

  # 2. 声明 4 个 Agent 的结构
  # Agent 0: Rover (Obs: 6, Act: 2)
  # Agent 1~3: UAVs (Obs: 10, Act: 3)
  obs_dims = [6, 10, 10, 10]
  action_dims = [2, 3, 3, 3]
  agent_names = ['rover', 'uav_1', 'uav_2', 'uav_3']

  # 3. 加载 PyTorch 权重
  print(f'正在读取权重大包: {checkpoint_path} ...')
  checkpoint = torch.load(checkpoint_path, map_location=torch.device('cpu'))

  for i in range(len(agent_names)):
    actor = Actor(obs_dims[i], action_dims[i])
    actor.load_state_dict(checkpoint['actors'][i])
    actor.eval()

    # 伪造输入维度 (Batch Size = 1)
    dummy_input = torch.randn(1, obs_dims[i], dtype=torch.float32)
    onnx_file_path = os.path.join(output_dir, f'{agent_names[i]}.onnx')

    # 导出 ONNX
    torch.onnx.export(
        actor,
        dummy_input,
        onnx_file_path,
        export_params=True,
        opset_version=14,  # 标准 ONNX 版本
        do_constant_folding=True,  # 优化常量折叠
        input_names=['observation'],  # 前端传入的节点名
        output_names=['action'],  # 前端接收的输出名
        dynamic_axes={
            'observation': {0: 'batch_size'},
            'action': {0: 'batch_size'},
        },
    )
    print(f'✅ 已成功导出 {agent_names[i]} 模型 -> {onnx_file_path}')

  print(
      f"\n🎉 所有 ONNX 文件已就绪！请将 '{output_dir}' 目录下的 4 个 .onnx 文件交给前端开发。"
  )


if __name__ == '__main__':
  export_maddpg_to_onnx()