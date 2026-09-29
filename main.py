import os
import random
import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
import matplotlib.pyplot as plt
from collections import deque


def seed_everything(seed=42):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)


seed_everything(42)


# ==========================================
# 1. 连续空间相对坐标物流环境 (LogisticsEnv V2)
# ==========================================
class NormalizedLogisticsEnv:
    def __init__(self, num_uavs=3, num_orders=8):
        self.num_uavs = num_uavs
        self.num_agents = num_uavs + 1  # 1 Rover + N UAVs
        self.num_orders = num_orders

        # Rover Obs: [rover_x, rover_y, rel_order_center_x, rel_order_center_y, remain_order_ratio, avg_uav_battery]
        self.rover_obs_dim = 6
        # UAV Obs: [uav_x, uav_y, uav_z, battery, rel_rover_x, rel_rover_y, rel_rover_z, rel_nearest_order_x, rel_nearest_order_y, rel_nearest_order_z]
        self.uav_obs_dim = 10

        self.obs_dims = [self.rover_obs_dim] + [self.uav_obs_dim] * self.num_uavs

        # 连续动作空间:
        # Rover: [dx, dy] 移动方向 (-1~1)
        # UAV: [dx, dy, dz] 移动方向 (-1~1)
        self.action_dims = [2] + [3] * self.num_uavs

    def reset(self):
        self.step_count = 0
        self.rover_pos = np.array([0.5, 0.5])  # 地图中央 (0~1 归一化)

        # 3D 订单生成 (0.1 ~ 0.9 范围内)
        self.orders_pos = np.random.uniform(0.1, 0.9, size=(self.num_orders, 3))
        self.orders_pos[:, 2] = np.random.uniform(0.05, 0.3, size=self.num_orders)  # 高度范围
        self.orders_delivered = np.zeros(self.num_orders, dtype=bool)

        # 无人机初始停靠在母车上
        self.uav_positions = np.tile(np.append(self.rover_pos, 0.0), (self.num_uavs, 1))
        self.uav_batteries = np.ones(self.num_uavs)
        self.uav_has_package = np.zeros(self.num_uavs, dtype=bool)

        return self._get_obs()

    def _get_obs(self):
        obs_list = []

        # 未完成订单统计
        unserved_mask = ~self.orders_delivered
        if np.any(unserved_mask):
            unserved_center = np.mean(self.orders_pos[unserved_mask, :2], axis=0)
            rel_order_center = unserved_center - self.rover_pos
        else:
            rel_order_center = np.array([0.0, 0.0])

        # 1. Rover 观测
        rover_obs = np.concatenate([
            self.rover_pos,
            rel_order_center,
            [np.sum(unserved_mask) / self.num_orders, np.mean(self.uav_batteries)]
        ])
        obs_list.append(rover_obs.astype(np.float32))

        # 2. UAV 观测
        for i in range(self.num_uavs):
            rel_rover = self.rover_pos - self.uav_positions[i, :2]
            rel_rover_3d = np.append(rel_rover, 0.0 - self.uav_positions[i, 2])

            if np.any(unserved_mask):
                dists = np.linalg.norm(self.orders_pos[unserved_mask] - self.uav_positions[i], axis=1)
                nearest_idx = np.argmin(dists)
                rel_nearest_order = self.orders_pos[unserved_mask][nearest_idx] - self.uav_positions[i]
            else:
                rel_nearest_order = np.array([0.0, 0.0, 0.0])

            uav_obs = np.concatenate([
                self.uav_positions[i],
                [self.uav_batteries[i]],
                rel_rover_3d,
                rel_nearest_order
            ])
            obs_list.append(uav_obs.astype(np.float32))

        return obs_list

    def step(self, actions):
        self.step_count += 1
        rewards = np.zeros(self.num_agents)
        dones = [False] * self.num_agents

        # ---------- 1. 母车移动逻辑 ----------
        rover_step = actions[0] * 0.03
        self.rover_pos = np.clip(self.rover_pos + rover_step, 0.0, 1.0)

        # ---------- 2. 无人机移动与逻辑 ----------
        for i in range(self.num_uavs):
            uav_act = actions[i + 1] * 0.06
            prev_pos = np.copy(self.uav_positions[i])
            self.uav_positions[i] = np.clip(self.uav_positions[i] + uav_act, 0.0, 1.0)

            # 耗电逻辑
            self.uav_batteries[i] -= 0.012

            # 计算到母车和最近订单的距离
            dist_to_rover = np.linalg.norm(self.uav_positions[i][:2] - self.rover_pos)

            # A. 自动充电逻辑
            if dist_to_rover < 0.08 and self.uav_positions[i][2] < 0.05:
                if self.uav_batteries[i] < 0.9:
                    self.uav_batteries[i] = 1.0
                    rewards[i + 1] += 5.0

            # B. 订单派送逻辑 (势能增量奖励)
            unserved_mask = ~self.orders_delivered
            if np.any(unserved_mask):
                order_dists = np.linalg.norm(self.orders_pos - self.uav_positions[i], axis=1)
                order_dists[self.orders_delivered] = 999.0

                min_idx = np.argmin(order_dists)
                min_dist = order_dists[min_idx]

                prev_dist = np.linalg.norm(self.orders_pos[min_idx] - prev_pos)
                rewards[i + 1] += (prev_dist - min_dist) * 15.0

                if min_dist < 0.08:
                    self.orders_delivered[min_idx] = True
                    rewards[i + 1] += 40.0
                    rewards[0] += 15.0

            # C. 没电惩罚
            if self.uav_batteries[i] <= 0:
                rewards[i + 1] -= 50.0
                dones[i + 1] = True

        # ---------- 3. 结束条件判定 ----------
        all_delivered = np.all(self.orders_delivered)
        if self.step_count >= 80 or all_delivered:
            dones = [True] * self.num_agents
            if all_delivered:
                rewards += 30.0

        return self._get_obs(), rewards, dones, {}


# ==========================================
# 2. MADDPG 神经网络与算法更新
# ==========================================
class Actor(nn.Module):
    def __init__(self, obs_dim, action_dim):
        super(Actor, self).__init__()
        self.net = nn.Sequential(
            nn.Linear(obs_dim, 128),
            nn.ReLU(),
            nn.Linear(128, 128),
            nn.ReLU(),
            nn.Linear(128, action_dim),
            nn.Tanh()
        )

    def forward(self, obs):
        return self.net(obs)


class Critic(nn.Module):
    def __init__(self, total_obs_dim, total_action_dim):
        super(Critic, self).__init__()
        self.net = nn.Sequential(
            nn.Linear(total_obs_dim + total_action_dim, 256),
            nn.ReLU(),
            nn.Linear(256, 128),
            nn.ReLU(),
            nn.Linear(128, 1)
        )

    def forward(self, total_obs, total_actions):
        return self.net(torch.cat([total_obs, total_actions], dim=-1))


class ReplayBuffer:
    def __init__(self, capacity=50000):
        self.buffer = deque(maxlen=capacity)

    def push(self, obs, actions, rewards, next_obs, dones):
        self.buffer.append((obs, actions, rewards, next_obs, dones))

    def sample(self, batch_size):
        batch = random.sample(self.buffer, batch_size)
        obs, actions, rewards, next_obs, dones = zip(*batch)
        return (
            [np.array(o) for o in zip(*obs)],
            [np.array(a) for a in zip(*actions)],
            np.array(rewards),
            [np.array(no) for no in zip(*next_obs)],
            np.array(dones)
        )

    def __len__(self):
        return len(self.buffer)


class MADDPGSolver:
    def __init__(self, obs_dims, action_dims, lr=3e-4, gamma=0.95, tau=0.01):
        self.num_agents = len(obs_dims)
        self.gamma = gamma
        self.tau = tau

        self.actors = [Actor(obs_dims[i], action_dims[i]) for i in range(self.num_agents)]
        self.critics = [Critic(sum(obs_dims), sum(action_dims)) for i in range(self.num_agents)]
        self.target_actors = [Actor(obs_dims[i], action_dims[i]) for i in range(self.num_agents)]
        self.target_critics = [Critic(sum(obs_dims), sum(action_dims)) for i in range(self.num_agents)]

        for i in range(self.num_agents):
            self.target_actors[i].load_state_dict(self.actors[i].state_dict())
            self.target_critics[i].load_state_dict(self.critics[i].state_dict())

        self.actor_opts = [optim.Adam(a.parameters(), lr=lr) for a in self.actors]
        self.critic_opts = [optim.Adam(c.parameters(), lr=lr) for c in self.critics]

    def select_action(self, obs_list, noise_std=0.1):
        actions = []
        for i, actor in enumerate(self.actors):
            obs_t = torch.FloatTensor(obs_list[i]).unsqueeze(0)
            actor.eval()
            with torch.no_grad():
                act = actor(obs_t).squeeze(0).numpy()
            actor.train()
            act += np.random.normal(0, noise_std, size=act.shape)
            actions.append(np.clip(act, -1.0, 1.0))
        return actions

    def update(self, buffer, batch_size=128):
        if len(buffer) < batch_size:
            return

        obs, actions, rewards, next_obs, dones = buffer.sample(batch_size)

        obs_t = [torch.FloatTensor(o) for o in obs]
        actions_t = [torch.FloatTensor(a) for a in actions]
        next_obs_t = [torch.FloatTensor(no) for no in next_obs]
        rewards_t = torch.FloatTensor(rewards)
        dones_t = torch.FloatTensor(dones)

        concat_obs = torch.cat(obs_t, dim=1)
        concat_actions = torch.cat(actions_t, dim=1)
        concat_next_obs = torch.cat(next_obs_t, dim=1)

        for i in range(self.num_agents):
            next_acts = [self.target_actors[j](next_obs_t[j]) for j in range(self.num_agents)]
            concat_next_acts = torch.cat(next_acts, dim=1)

            with torch.no_grad():
                target_q = self.target_critics[i](concat_next_obs, concat_next_acts).squeeze(1)
                y = rewards_t[:, i] + self.gamma * target_q * (1 - dones_t[:, i])

            current_q = self.critics[i](concat_obs, concat_actions).squeeze(1)
            critic_loss = nn.MSELoss()(current_q, y)

            self.critic_opts[i].zero_grad()
            critic_loss.backward()
            self.critic_opts[i].step()

            curr_acts = [self.actors[j](obs_t[j]) if j == i else actions_t[j] for j in range(self.num_agents)]
            concat_curr_acts = torch.cat(curr_acts, dim=1)
            actor_loss = -self.critics[i](concat_obs, concat_curr_acts).mean()

            self.actor_opts[i].zero_grad()
            actor_loss.backward()
            self.actor_opts[i].step()

            for p, pt in zip(self.actors[i].parameters(), self.target_actors[i].parameters()):
                pt.data.copy_(self.tau * p.data + (1 - self.tau) * pt.data)
            for p, pt in zip(self.critics[i].parameters(), self.target_critics[i].parameters()):
                pt.data.copy_(self.tau * p.data + (1 - self.tau) * pt.data)

    # ---------- 新增：保存 Checkpoint 接口 ----------
    def save_checkpoint(self, filepath):
        checkpoint = {
            'actors': [actor.state_dict() for actor in self.actors],
            'critics': [critic.state_dict() for critic in self.critics],
            'target_actors': [target_actor.state_dict() for target_actor in self.target_actors],
            'target_critics': [target_critic.state_dict() for target_critic in self.target_critics]
        }
        torch.save(checkpoint, filepath)


# ==========================================
# 3. 训练主程序 (导出最佳模型 + 生成收敛曲线)
# ==========================================
def train_and_plot():
    env = NormalizedLogisticsEnv(num_uavs=3, num_orders=8)
    maddpg = MADDPGSolver(obs_dims=env.obs_dims, action_dims=env.action_dims)
    buffer = ReplayBuffer(capacity=50000)

    episodes = 500
    batch_size = 128
    ep_rewards = []  # 记录每局奖励

    # 最佳模型保存相关变量
    model_dir = "saved_models"
    os.makedirs(model_dir, exist_ok=True)
    best_avg_reward = -float('inf')
    window_size = 20  # 计算近20局的平均表现

    print("🚀 启动 MADDPG 训练并监控收敛曲线与最佳模型保存...")

    for ep in range(episodes):
        obs = env.reset()
        ep_reward = 0
        noise = max(0.05, 0.35 * (1.0 - ep / 400))

        while True:
            actions = maddpg.select_action(obs, noise_std=noise)
            next_obs, rewards, dones, _ = env.step(actions)

            buffer.push(obs, actions, rewards, next_obs, dones)
            maddpg.update(buffer, batch_size)

            obs = next_obs
            ep_reward += sum(rewards)

            if all(dones):
                break

        ep_rewards.append(ep_reward)

        # 判定与保存最佳模型逻辑
        if len(ep_rewards) >= window_size:
            current_avg_reward = float(np.mean(ep_rewards[-window_size:]))
            if current_avg_reward > best_avg_reward:
                best_avg_reward = current_avg_reward
                best_model_path = os.path.join(model_dir, "maddpg_best.pth")
                maddpg.save_checkpoint(best_model_path)
                print(f"✨ Episode [{ep + 1}/{episodes}] 刷新最佳 20 局平均奖励: {best_avg_reward:.2f}，模型已更新保存至 '{best_model_path}'")

        if (ep + 1) % 20 == 0:
            avg_last_20 = np.mean(ep_rewards[-20:])
            print(f"Episode [{ep + 1}/{episodes}] | Recent 20 Avg Reward: {avg_last_20:.2f} | Noise: {noise:.2f}")

    print(f"\n🏆 训练完成！最高滑动平均奖励为: {best_avg_reward:.2f}")
    print("📊 正在生成收敛曲线图...")

    # 绘制 Matplotlib 收敛曲线
    plt.figure(figsize=(10, 5))
    plt.plot(ep_rewards, alpha=0.3, color='dodgerblue', label='Raw Episode Reward')

    # 20 Episode 滑动平均
    moving_avg = np.convolve(ep_rewards, np.ones(window_size) / window_size, mode='valid')
    plt.plot(range(window_size - 1, len(ep_rewards)), moving_avg, color='navy', linewidth=2.5,
             label=f'{window_size}-Episode Moving Average')

    plt.axhline(y=400, color='crimson', linestyle='--', alpha=0.7, label='Target High Efficiency Threshold')
    plt.title('MADDPG Training Convergence Trajectory (Normalized Logistics Env)')
    plt.xlabel('Episode')
    plt.ylabel('Total Cumulative Reward')
    plt.grid(True, linestyle='--', alpha=0.5)
    plt.legend()
    plt.tight_layout()

    plt.savefig('maddpg_convergence_curve.png', dpi=300)
    print("✅ 收敛曲线图片已保存为 'maddpg_convergence_curve.png'")
    plt.show()


if __name__ == "__main__":
    train_and_plot()