import torch
from torch import nn
from torch.distributions import Categorical
from env import ORDER_DIM, GLOBAL_DIM, CANDIDATE_DIM


class DispatchPolicy(nn.Module):
    """One cooperative policy with shared order scoring, seeing every order.

    Pooled order encodings make the global context invariant to order permutation.
    A candidate head supports both rendezvous sites and masked order selection.
    """
    def __init__(self):
        super().__init__()
        self.orders = nn.Sequential(nn.Linear(ORDER_DIM, 32), nn.Tanh(), nn.Linear(32, 32), nn.Tanh())
        self.context = nn.Sequential(nn.Linear(64 + GLOBAL_DIM, 96), nn.Tanh())
        self.actor = nn.Sequential(nn.Linear(96 + CANDIDATE_DIM, 64), nn.Tanh(), nn.Linear(64, 1))
        self.critic = nn.Sequential(nn.Linear(96, 64), nn.Tanh(), nn.Linear(64, 1))
        for module in self.modules():
            if isinstance(module, nn.Linear):
                nn.init.orthogonal_(module.weight, gain=1.)
                nn.init.zeros_(module.bias)
        nn.init.orthogonal_(self.actor[-1].weight, gain=.01)

    def forward(self, orders, global_features, candidates, mask):
        embedding = self.orders(orders)
        present = orders[..., 7:8] > 0
        mean = (embedding * present).sum(1) / present.sum(1).clamp(min=1)
        maximum = embedding.masked_fill(~present, -1e9).max(1).values
        context = self.context(torch.cat((mean, maximum, global_features), dim=-1))
        context_for_actions = context[:, None, :].expand(-1, candidates.shape[1], -1)
        logits = self.actor(torch.cat((context_for_actions, candidates), dim=-1)).squeeze(-1)
        return Categorical(logits=logits.masked_fill(~mask, -1e9)), self.critic(context).squeeze(-1)


def tensors(observations):
    import numpy as np
    return {key: torch.from_numpy(np.stack([o[key] for o in observations])) for key in observations[0]}
