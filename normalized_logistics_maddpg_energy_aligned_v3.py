import os
import random
from collections import deque

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
import matplotlib.pyplot as plt


# ============================================================
# 0. 全局配置
# ============================================================

def seed_everything(seed=42):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


seed_everything(42)


# 时间与能耗奖励参数
TIME_PENALTY_PER_STEP = 0.10

# 对齐 digital-twin-logistics/backend/mission.py：
# cost = 0.003 * dt / 0.52 * (0.8 if energy_mode else 1)
# 电量为 0~1 归一化值；此处假设一个训练 step = 1 秒。
SIM_DT_SECONDS = 1.0
UAV_ENERGY_BASE_PER_SECOND = 0.003 / 0.52
# 请与实际 mission.py 的 self.energy_mode 保持一致；True 时能耗乘 0.8。
ENERGY_MODE_ENABLED = True
ENERGY_MODE_FACTOR = 0.8

# 对齐业务充电规则：idle + 与母车停机位距离 <= 0.2，每秒充 5%，最多 1.0。
UAV_DOCK_DISTANCE = 0.20
UAV_IDLE_HEIGHT = 0.05
UAV_CHARGE_PER_SECOND = 0.05
UAV_RECHARGE_TARGET = 0.90
# 训练环境没有业务 phase，用动作幅度近似判断无人机是否从停靠状态起飞。
UAV_LAUNCH_ACTION_THRESHOLD = 0.15

# 能耗惩罚按“实际消耗电量”计，不按距离、速度或动作方向计。
ENERGY_REWARD_COEF = 8.0
# 下列低电量返航规则是训练奖励引导，不是强制返航控制。
UAV_RETURN_BATTERY_THRESHOLD = 0.35
UAV_RETURN_PROGRESS_COEF = 8.0
LOW_BATTERY_ORDER_PROGRESS_SCALE = 0.25
# 训练用充电塑形奖励：实际补入 1.0 电量对应 5 分，补入 0.05 对应 0.25 分。
UAV_RECHARGE_REWARD_PER_BATTERY = 5.0


# ==========================================
# 1. 连续空间相对坐标物流环境
# ==========================================
class NormalizedLogisticsEnv:
    def __init__(self, num_uavs=3, num_orders=8, max_steps=160):
        self.num_uavs = num_uavs
        self.num_agents = num_uavs + 1  # 1 台 Rover + N 架 UAV
        self.num_orders = num_orders
        self.max_steps = max_steps

        # 为保持原有 Actor/ONNX 接口兼容，观测维度不变。
        # Rover Obs: [rover_x, rover_y, rel_order_center_x, rel_order_center_y,
        #             remain_order_ratio, avg_uav_battery]
        self.rover_obs_dim = 6
        # UAV Obs: [uav_x, uav_y, uav_z, battery, rel_rover_x, rel_rover_y,
        #            rel_rover_z, rel_nearest_order_x, rel_nearest_order_y,
        #            rel_nearest_order_z]
        self.uav_obs_dim = 10
        self.obs_dims = [self.rover_obs_dim] + [self.uav_obs_dim] * self.num_uavs

        # Rover: [dx, dy]; UAV: [dx, dy, dz]
        self.action_dims = [2] + [3] * self.num_uavs

    def reset(self):
        self.step_count = 0
        self.rover_pos = np.array([0.5, 0.5], dtype=np.float32)

        # 订单位置：x/y 为 0.1~0.9，z 为 0.05~0.3
        self.orders_pos = np.random.uniform(0.1, 0.9, size=(self.num_orders, 3)).astype(np.float32)
        self.orders_pos[:, 2] = np.random.uniform(0.05, 0.3, size=self.num_orders)
        self.orders_delivered = np.zeros(self.num_orders, dtype=bool)

        # 无人机初始停靠在母车上
        self.uav_positions = np.tile(np.append(self.rover_pos, 0.0), (self.num_uavs, 1)).astype(np.float32)
        self.uav_batteries = np.ones(self.num_uavs, dtype=np.float32)
        self.uav_has_package = np.zeros(self.num_uavs, dtype=bool)  # 保留原字段
        self.uav_disabled = np.zeros(self.num_uavs, dtype=bool)
        # 业务代码有 phase；训练环境中以停机位位置/动作近似 idle 状态。
        self.uav_is_idle = np.ones(self.num_uavs, dtype=bool)
        # 低电量返航奖励采用滞回：低于阈值开启，充到目标电量后关闭。
        self.uav_return_mode = np.zeros(self.num_uavs, dtype=bool)

        # 统计总耗电（累计消耗、不扣除充入电量）、补能周期数和充电步数。
        self.uav_energy_used = np.zeros(self.num_uavs, dtype=np.float32)
        self.total_uav_energy_used = 0.0
        self.uav_recharge_count = np.zeros(self.num_uavs, dtype=np.int32)
        self.uav_charge_steps = np.zeros(self.num_uavs, dtype=np.int32)

        return self._get_obs()

    def _get_obs(self):
        obs_list = []
        unserved_mask = ~self.orders_delivered

        if np.any(unserved_mask):
            unserved_center = np.mean(self.orders_pos[unserved_mask, :2], axis=0)
            rel_order_center = unserved_center - self.rover_pos
        else:
            rel_order_center = np.array([0.0, 0.0], dtype=np.float32)

        # 1. Rover 观测
        rover_obs = np.concatenate([
            self.rover_pos,
            rel_order_center,
            np.array([
                np.sum(unserved_mask) / max(self.num_orders, 1),
                np.mean(self.uav_batteries) if self.num_uavs else 1.0,
            ], dtype=np.float32),
        ])
        obs_list.append(rover_obs.astype(np.float32))

        # 2. UAV 观测
        for i in range(self.num_uavs):
            rel_rover = self.rover_pos - self.uav_positions[i, :2]
            rel_rover_3d = np.append(rel_rover, 0.0 - self.uav_positions[i, 2])

            if np.any(unserved_mask):
                unserved_orders = self.orders_pos[unserved_mask]
                dists = np.linalg.norm(unserved_orders - self.uav_positions[i], axis=1)
                nearest_idx = int(np.argmin(dists))
                rel_nearest_order = unserved_orders[nearest_idx] - self.uav_positions[i]
            else:
                rel_nearest_order = np.array([0.0, 0.0, 0.0], dtype=np.float32)

            uav_obs = np.concatenate([
                self.uav_positions[i],
                np.array([self.uav_batteries[i]], dtype=np.float32),
                rel_rover_3d,
                rel_nearest_order,
            ])
            obs_list.append(uav_obs.astype(np.float32))

        return obs_list

    def step(self, actions):
        self.step_count += 1
        rewards = np.zeros(self.num_agents, dtype=np.float32)
        dones = [False] * self.num_agents

        # ---------- 0. 配送时长惩罚 ----------
        # 每经过一个仿真步，所有智能体都承担时间成本。
        # 因此在任务奖励相近时，更早完成配送的轨迹累计惩罚更少。
        rewards -= TIME_PENALTY_PER_STEP

        # ---------- 1. 母车移动逻辑 ----------
        rover_pos_before_move = self.rover_pos.copy()
        rover_action = np.clip(np.asarray(actions[0], dtype=np.float32), -1.0, 1.0)
        rover_step = rover_action * 0.03
        self.rover_pos = np.clip(self.rover_pos + rover_step, 0.0, 1.0)
        rover_delta = self.rover_pos - rover_pos_before_move

        # idle 无人机停在母车上时，会随母车一起移动。
        for i in range(self.num_uavs):
            if self.uav_is_idle[i] and not self.uav_disabled[i]:
                self.uav_positions[i, :2] = np.clip(
                    self.uav_positions[i, :2] + rover_delta, 0.0, 1.0
                )
                self.uav_positions[i, 2] = 0.0

        # ---------- 2. 无人机移动、按时间耗电与配送逻辑 ----------
        energy_mode_factor = ENERGY_MODE_FACTOR if ENERGY_MODE_ENABLED else 1.0
        energy_per_active_step = (
            UAV_ENERGY_BASE_PER_SECOND * SIM_DT_SECONDS * energy_mode_factor
        )

        for i in range(self.num_uavs):
            agent_idx = i + 1
            if self.uav_disabled[i]:
                dones[agent_idx] = True
                continue

            prev_pos = self.uav_positions[i].copy()
            battery_before_step = float(self.uav_batteries[i])
            uav_action = np.clip(
                np.asarray(actions[agent_idx], dtype=np.float32), -1.0, 1.0
            )
            action_magnitude = float(np.linalg.norm(uav_action))

            # 低电量时只改变奖励权重，不直接覆盖动作强制返航。
            if battery_before_step <= UAV_RETURN_BATTERY_THRESHOLD:
                self.uav_return_mode[i] = True
            elif battery_before_step >= UAV_RECHARGE_TARGET:
                self.uav_return_mode[i] = False
            should_return = bool(self.uav_return_mode[i])

            # 生成连续移动动作。母车仅移动 x/y，无人机动作是 x/y/z。
            self.uav_positions[i] = np.clip(
                self.uav_positions[i] + uav_action * 0.06, 0.0, 1.0
            )
            dist_to_rover = float(
                np.linalg.norm(self.uav_positions[i, :2] - self.rover_pos)
            )
            at_dock = (
                dist_to_rover <= UAV_DOCK_DISTANCE
                and float(self.uav_positions[i, 2]) < UAV_IDLE_HEIGHT
            )

            was_idle = bool(self.uav_is_idle[i])
            if was_idle:
                # 停靠状态下显著动作表示起飞；很小的动作仍视为 idle。
                self.uav_is_idle[i] = bool(
                    at_dock and action_magnitude < UAV_LAUNCH_ACTION_THRESHOLD
                )
            else:
                # 活动中的无人机回到停机范围且足够低，视为降落并进入 idle。
                self.uav_is_idle[i] = bool(at_dock)

            if not was_idle and self.uav_is_idle[i] and at_dock:
                self.uav_recharge_count[i] += 1

            # ---------- 2A. 电量规则：与业务代码一样按状态/时间扣电 ----------
            energy_used = 0.0
            if self.uav_is_idle[i] and at_dock:
                # idle 且在母车停机位附近：不扣电，每秒充 5%，上限为 1.0。
                old_battery = float(self.uav_batteries[i])
                self.uav_batteries[i] = min(
                    1.0, old_battery + UAV_CHARGE_PER_SECOND * SIM_DT_SECONDS
                )
                charged_amount = float(self.uav_batteries[i]) - old_battery
                if charged_amount > 0.0:
                    self.uav_charge_steps[i] += 1
                    # 仅用于训练的奖励塑形；实际业务充电公式本身不含这个奖励。
                    rewards[agent_idx] += (
                        UAV_RECHARGE_REWARD_PER_BATTERY * charged_amount
                    )
            else:
                # 活动状态固定按时间耗电，不依赖移动距离、速度或动作方向。
                energy_used = min(float(self.uav_batteries[i]), energy_per_active_step)
                self.uav_batteries[i] = max(
                    0.0, float(self.uav_batteries[i]) - energy_used
                )
                self.uav_energy_used[i] += energy_used
                self.total_uav_energy_used += energy_used
                rewards[agent_idx] -= ENERGY_REWARD_COEF * energy_used

            # ---------- 2B. 返航过程奖励：低电量时奖励逐步接近母车 ----------
            dock_pos = np.array(
                [self.rover_pos[0], self.rover_pos[1], 0.0], dtype=np.float32
            )
            prev_dock_dist = float(np.linalg.norm(prev_pos - dock_pos))
            current_dock_dist = float(np.linalg.norm(self.uav_positions[i] - dock_pos))
            if should_return:
                rewards[agent_idx] += (
                    prev_dock_dist - current_dock_dist
                ) * UAV_RETURN_PROGRESS_COEF

            # ---------- 2C. 订单配送奖励 ----------
            unserved_mask = ~self.orders_delivered
            if np.any(unserved_mask):
                order_dists = np.linalg.norm(
                    self.orders_pos - self.uav_positions[i], axis=1
                )
                order_dists[self.orders_delivered] = 999.0
                min_idx = int(np.argmin(order_dists))
                min_dist = float(order_dists[min_idx])
                prev_dist = float(np.linalg.norm(self.orders_pos[min_idx] - prev_pos))

                order_progress_scale = (
                    LOW_BATTERY_ORDER_PROGRESS_SCALE if should_return else 1.0
                )
                rewards[agent_idx] += (
                    prev_dist - min_dist
                ) * 15.0 * order_progress_scale

                if min_dist < 0.08:
                    self.orders_delivered[min_idx] = True
                    rewards[agent_idx] += 40.0
                    rewards[0] += 15.0

            # ---------- 2D. 电量耗尽惩罚 ----------
            if self.uav_batteries[i] <= 0.0:
                rewards[agent_idx] -= 50.0
                dones[agent_idx] = True
                self.uav_disabled[i] = True
                self.uav_is_idle[i] = False

        # ---------- 3. 结束条件判定 ----------
        all_delivered = bool(np.all(self.orders_delivered))
        timed_out = self.step_count >= self.max_steps

        if timed_out or all_delivered:
            dones = [True] * self.num_agents
            if all_delivered:
                rewards += 30.0

        info = {
            "step_count": self.step_count,
            "delivered_orders": int(np.sum(self.orders_delivered)),
            "total_orders": self.num_orders,
            "all_delivered": all_delivered,
            "timed_out": timed_out and not all_delivered,
            "total_uav_energy_used": float(self.total_uav_energy_used),
            "uav_energy_used": self.uav_energy_used.copy().tolist(),
            "uav_batteries": self.uav_batteries.copy().tolist(),
            "disabled_uavs": int(np.sum(self.uav_disabled)),
            "uav_recharge_count": self.uav_recharge_count.copy().tolist(),
            "total_recharges": int(np.sum(self.uav_recharge_count)),
            "total_charge_steps": int(np.sum(self.uav_charge_steps)),
            "idle_uavs": int(np.sum(self.uav_is_idle)),
            "energy_per_active_step": float(energy_per_active_step),
        }
        return self._get_obs(), rewards, dones, info


# ==========================================
# 2. MADDPG 神经网络与算法更新
# ==========================================
class Actor(nn.Module):
    def __init__(self, obs_dim, action_dim):
        super().__init__()
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


class Critic(nn.Module):
    def __init__(self, total_obs_dim, total_action_dim):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(total_obs_dim + total_action_dim, 256),
            nn.ReLU(),
            nn.Linear(256, 128),
            nn.ReLU(),
            nn.Linear(128, 1),
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
            np.array(rewards, dtype=np.float32),
            [np.array(no) for no in zip(*next_obs)],
            np.array(dones, dtype=np.float32),
        )

    def __len__(self):
        return len(self.buffer)


class MADDPGSolver:
    def __init__(self, obs_dims, action_dims, lr=3e-4, gamma=0.95, tau=0.01):
        self.num_agents = len(obs_dims)
        self.gamma = gamma
        self.tau = tau

        total_obs_dim = sum(obs_dims)
        total_action_dim = sum(action_dims)

        self.actors = [Actor(obs_dims[i], action_dims[i]) for i in range(self.num_agents)]
        self.critics = [Critic(total_obs_dim, total_action_dim) for _ in range(self.num_agents)]
        self.target_actors = [Actor(obs_dims[i], action_dims[i]) for i in range(self.num_agents)]
        self.target_critics = [Critic(total_obs_dim, total_action_dim) for _ in range(self.num_agents)]

        for i in range(self.num_agents):
            self.target_actors[i].load_state_dict(self.actors[i].state_dict())
            self.target_critics[i].load_state_dict(self.critics[i].state_dict())

        self.actor_opts = [optim.Adam(actor.parameters(), lr=lr) for actor in self.actors]
        self.critic_opts = [optim.Adam(critic.parameters(), lr=lr) for critic in self.critics]

    def select_action(self, obs_list, noise_std=0.1):
        actions = []
        for i, actor in enumerate(self.actors):
            obs_t = torch.as_tensor(obs_list[i], dtype=torch.float32).unsqueeze(0)
            actor.eval()
            with torch.no_grad():
                act = actor(obs_t).squeeze(0).cpu().numpy()
            actor.train()

            if noise_std > 0:
                act = act + np.random.normal(0, noise_std, size=act.shape)
            actions.append(np.clip(act, -1.0, 1.0).astype(np.float32))
        return actions

    def update(self, buffer, batch_size=128):
        if len(buffer) < batch_size:
            return

        obs, actions, rewards, next_obs, dones = buffer.sample(batch_size)
        obs_t = [torch.as_tensor(o, dtype=torch.float32) for o in obs]
        actions_t = [torch.as_tensor(a, dtype=torch.float32) for a in actions]
        next_obs_t = [torch.as_tensor(no, dtype=torch.float32) for no in next_obs]
        rewards_t = torch.as_tensor(rewards, dtype=torch.float32)
        dones_t = torch.as_tensor(dones, dtype=torch.float32)

        concat_obs = torch.cat(obs_t, dim=1)
        concat_actions = torch.cat(actions_t, dim=1)
        concat_next_obs = torch.cat(next_obs_t, dim=1)

        for i in range(self.num_agents):
            with torch.no_grad():
                next_acts = [self.target_actors[j](next_obs_t[j]) for j in range(self.num_agents)]
                concat_next_acts = torch.cat(next_acts, dim=1)
                target_q = self.target_critics[i](concat_next_obs, concat_next_acts).squeeze(1)
                y = rewards_t[:, i] + self.gamma * target_q * (1.0 - dones_t[:, i])

            current_q = self.critics[i](concat_obs, concat_actions).squeeze(1)
            critic_loss = nn.MSELoss()(current_q, y)
            self.critic_opts[i].zero_grad()
            critic_loss.backward()
            self.critic_opts[i].step()

            # 更新第 i 个 Actor，其他智能体动作使用回放池中的实际动作。
            curr_acts = [
                self.actors[j](obs_t[j]) if j == i else actions_t[j]
                for j in range(self.num_agents)
            ]
            concat_curr_acts = torch.cat(curr_acts, dim=1)
            actor_loss = -self.critics[i](concat_obs, concat_curr_acts).mean()
            self.actor_opts[i].zero_grad()
            actor_loss.backward()
            self.actor_opts[i].step()

            # 软更新目标网络
            with torch.no_grad():
                for p, pt in zip(self.actors[i].parameters(), self.target_actors[i].parameters()):
                    pt.copy_(self.tau * p + (1.0 - self.tau) * pt)
                for p, pt in zip(self.critics[i].parameters(), self.target_critics[i].parameters()):
                    pt.copy_(self.tau * p + (1.0 - self.tau) * pt)

    def save_checkpoint(self, filepath):
        checkpoint = {
            "actors": [actor.state_dict() for actor in self.actors],
            "critics": [critic.state_dict() for critic in self.critics],
            "target_actors": [actor.state_dict() for actor in self.target_actors],
            "target_critics": [critic.state_dict() for critic in self.target_critics],
        }
        torch.save(checkpoint, filepath)


# ==========================================
# 3. 策略无噪声评估函数
# ==========================================
def evaluate_policy(env, maddpg, eval_episodes=5):
    total_eval_rewards = []
    eval_stats = []

    for _ in range(eval_episodes):
        obs = env.reset()
        episode_reward = 0.0

        while True:
            actions = maddpg.select_action(obs, noise_std=0.0)
            next_obs, rewards, dones, info = env.step(actions)
            obs = next_obs
            episode_reward += float(np.sum(rewards))
            if all(dones):
                break

        total_eval_rewards.append(episode_reward)
        eval_stats.append(info)

    mean_stats = {
        "delivered_orders": float(np.mean([x["delivered_orders"] for x in eval_stats])),
        "steps": float(np.mean([x["step_count"] for x in eval_stats])),
        "uav_energy": float(np.mean([x["total_uav_energy_used"] for x in eval_stats])),
        "success_rate": float(np.mean([1.0 if x["all_delivered"] else 0.0 for x in eval_stats])),
        "disabled_uavs": float(np.mean([x["disabled_uavs"] for x in eval_stats])),
        "remaining_battery": float(np.mean([np.mean(x["uav_batteries"]) for x in eval_stats])),
        "recharges": float(np.mean([x["total_recharges"] for x in eval_stats])),
        "charge_steps": float(np.mean([x["total_charge_steps"] for x in eval_stats])),
        "idle_uavs": float(np.mean([x["idle_uavs"] for x in eval_stats])),
    }
    return float(np.mean(total_eval_rewards)), mean_stats


# ==========================================
# 4. 训练主程序（定期评估并保存最佳模型）
# ==========================================
def train_and_plot():
    env = NormalizedLogisticsEnv(num_uavs=3, num_orders=8, max_steps=160)
    maddpg = MADDPGSolver(obs_dims=env.obs_dims, action_dims=env.action_dims)
    buffer = ReplayBuffer(capacity=50000)

    episodes = 500
    batch_size = 128
    ep_rewards = []

    model_dir = "saved_models"
    os.makedirs(model_dir, exist_ok=True)

    best_eval_reward = -float("inf")
    eval_interval = 20
    eval_episodes = 5

    print("启动 MADDPG 训练（奖励包含配送时长与无人机能耗成本）...")
    energy_mode_factor = ENERGY_MODE_FACTOR if ENERGY_MODE_ENABLED else 1.0
    active_energy_per_step = UAV_ENERGY_BASE_PER_SECOND * SIM_DT_SECONDS * energy_mode_factor
    print(
        f"参数：每步时间惩罚={TIME_PENALTY_PER_STEP}, "
        f"仿真步长={SIM_DT_SECONDS:.2f}s, "
        f"能耗模式={'节能' if ENERGY_MODE_ENABLED else '标准'}, "
        f"活动状态耗电/步={active_energy_per_step:.6f}, "
        f"idle 充电率={UAV_CHARGE_PER_SECOND:.0%}/秒, "
        f"停机位距离={UAV_DOCK_DISTANCE}, "
        f"能耗惩罚系数={ENERGY_REWARD_COEF}, "
        f"低电量返航奖励阈值={UAV_RETURN_BATTERY_THRESHOLD}, "
        f"单局最大步数={env.max_steps}"
    )

    for ep in range(episodes):
        obs = env.reset()
        episode_reward = 0.0
        noise = max(0.05, 0.35 * (1.0 - ep / 400.0))

        while True:
            actions = maddpg.select_action(obs, noise_std=noise)
            next_obs, rewards, dones, info = env.step(actions)

            buffer.push(obs, actions, rewards, next_obs, dones)
            maddpg.update(buffer, batch_size)

            obs = next_obs
            episode_reward += float(np.sum(rewards))
            if all(dones):
                break

        ep_rewards.append(episode_reward)

        if (ep + 1) % eval_interval == 0:
            eval_reward, eval_stats = evaluate_policy(env, maddpg, eval_episodes=eval_episodes)
            recent_avg = float(np.mean(ep_rewards[-20:]))
            print(
                f"Episode [{ep + 1}/{episodes}] | "
                f"近20局训练总奖励均值: {recent_avg:.2f} | "
                f"无噪声评估奖励: {eval_reward:.2f} | "
                f"平均送达: {eval_stats['delivered_orders']:.2f}/{env.num_orders} | "
                f"平均步数: {eval_stats['steps']:.1f}/{env.max_steps} | "
                f"无人机累计耗电: {eval_stats['uav_energy']:.3f} | "
                f"全单完成率: {eval_stats['success_rate']:.0%} | "
                f"平均停用无人机: {eval_stats['disabled_uavs']:.2f}/{env.num_uavs} | "
                f"平均剩余电量: {eval_stats['remaining_battery']:.3f} | "
                f"平均补能周期数: {eval_stats['recharges']:.2f} | "
                f"平均充电步数: {eval_stats['charge_steps']:.2f} | "
                f"结束时 idle 无人机: {eval_stats['idle_uavs']:.2f}/{env.num_uavs}"
            )

            # 同时以总奖励作为当前模型选择依据；评估奖励已经包含时间与能耗惩罚。
            if eval_reward > best_eval_reward:
                best_eval_reward = eval_reward
                best_model_path = os.path.join(model_dir, "maddpg_best.pth")
                maddpg.save_checkpoint(best_model_path)
                print(f"  保存当前最佳模型：{best_model_path}（评估奖励 {best_eval_reward:.2f}）")

    print(f"\n训练结束！历史最高无噪声评估奖励：{best_eval_reward:.2f}")
    print("正在生成收敛曲线图...")

    plt.figure(figsize=(10, 5))
    plt.plot(ep_rewards, alpha=0.3, label="Raw Episode Reward")

    window_size = 20
    if len(ep_rewards) >= window_size:
        moving_avg = np.convolve(ep_rewards, np.ones(window_size) / window_size, mode="valid")
        plt.plot(
            range(window_size - 1, len(ep_rewards)),
            moving_avg,
            linewidth=2.5,
            label=f"{window_size}-Episode Moving Average",
        )

    plt.title("MADDPG Training Reward (Mission-Aligned Energy Model)")
    plt.xlabel("Episode")
    plt.ylabel("Total Cumulative Reward")
    plt.grid(True, linestyle="--", alpha=0.5)
    plt.legend()
    plt.tight_layout()

    plot_path = "maddpg_convergence_curve.png"
    plt.savefig(plot_path, dpi=300)
    print(f"收敛曲线已保存：{plot_path}")
    plt.show()


if __name__ == "__main__":
    train_and_plot()

