// Shared by mission decisions and rendering: x/y are horizontal business axes,
// z is height. Never compare this anisotropic coordinate system as unitless xyz.
export const WORLD_UNITS = { coordScale: 200, coordOffset: -100, heightScale: 50 };
export const PICKUP_RULES = Object.freeze({
  horizontalTolerance: 0.35,
  verticalTolerance: 0.20,
  maxHoverSpeed: 0.15,
  hoverOffset: 0.95,
  stableSeconds: 0.8,
  animationSeconds: 3,
  approachRadius: 18,
  approachSpeed: 3,
  verticalSpeed: 1.2,
  returnSpeed: 5,
  returnHeight: 2.35,
  unloadSeconds: 1.5
});

export function missionToWorld(position) {
  return {
    x: position.x * WORLD_UNITS.coordScale + WORLD_UNITS.coordOffset,
    y: position.z * WORLD_UNITS.heightScale,
    z: position.y * WORLD_UNITS.coordScale + WORLD_UNITS.coordOffset
  };
}

export function pickupPose(order) {
  return { x: order.x, y: order.y, z: order.z + PICKUP_RULES.hoverOffset / WORLD_UNITS.heightScale };
}

export function returnPose(rover, uav) {
  const slot = [[-0.82, -0.68], [0.82, -0.68], [0, 0.78]][(uav.id - 1) % 3];
  return { x: rover.x + slot[0] / WORLD_UNITS.coordScale, y: rover.y + slot[1] / WORLD_UNITS.coordScale, z: PICKUP_RULES.returnHeight / WORLD_UNITS.heightScale };
}

export function distanceMeters(a, b) {
  return Math.hypot((a.x - b.x) * WORLD_UNITS.coordScale, (a.y - b.y) * WORLD_UNITS.coordScale, (a.z - b.z) * WORLD_UNITS.heightScale);
}

export function isAtPickup(worldPosition, order) {
  if (!worldPosition) return false;
  const target = missionToWorld(pickupPose(order));
  return Math.hypot(worldPosition.x - target.x, worldPosition.z - target.z) <= PICKUP_RULES.horizontalTolerance
    && Math.abs(worldPosition.y - target.y) <= PICKUP_RULES.verticalTolerance;
}

export function moveTowards(uav, destination, deltaSeconds, speed) {
  const dx = (destination.x - uav.x) * WORLD_UNITS.coordScale;
  const dy = (destination.y - uav.y) * WORLD_UNITS.coordScale;
  const distance = Math.hypot(dx, dy);
  const step = Math.min(distance, speed * deltaSeconds);
  if (distance > 0) {
    uav.x += dx / distance * step / WORLD_UNITS.coordScale;
    uav.y += dy / distance * step / WORLD_UNITS.coordScale;
  }
  const height = (destination.z - uav.z) * WORLD_UNITS.heightScale;
  uav.z += Math.sign(height) * Math.min(Math.abs(height), PICKUP_RULES.verticalSpeed * deltaSeconds) / WORLD_UNITS.heightScale;
}

export function pickupLift(progress) {
  // Lower the gripper first, then lift and latch. Use the same timing for the
  // parcel, cable and arrival confirmation so they cannot drift apart.
  const t = Math.max(0, Math.min(1, (progress - 0.28) / 0.47));
  return t * t * (3 - 2 * t);
}
