/**
 * 坐标系统转换工具
 * 业务坐标(0-1) <-> 世界坐标(米)
 */

// Pure rendering conversion. Business arrival rules live on the MEC backend.
export const COORD_CONFIG = { coordScale: 200, coordOffset: -100, heightScale: 50 };

/**
 * 业务坐标转世界坐标
 * @param {number} bx - 业务X (0-1)
 * @param {number} by - 业务Y (0-1)
 * @param {number} bz - 业务Z (0-1)
 * @returns {object} {x, y, z} 世界坐标（米）
 */
export function businessToWorld(bx, by, bz = 0) {
  return {
    x: bx * COORD_CONFIG.coordScale + COORD_CONFIG.coordOffset,
    y: bz * COORD_CONFIG.heightScale,  // Y是世界的高度
    z: by * COORD_CONFIG.coordScale + COORD_CONFIG.coordOffset
  };
}

/**
 * 世界坐标转业务坐标
 * @param {number} wx - 世界X (米)
 * @param {number} wy - 世界Y (米)
 * @param {number} wz - 世界Z (米)
 * @returns {object} {x, y, z} 业务坐标(0-1)
 */
export function worldToBusiness(wx, wy, wz) {
  return {
    x: (wx - COORD_CONFIG.coordOffset) / COORD_CONFIG.coordScale,
    y: (wz - COORD_CONFIG.coordOffset) / COORD_CONFIG.coordScale,
    z: wy / COORD_CONFIG.heightScale
  };
}
