import * as THREE from 'three';

/**
 * 昼夜时间系统：timeOfDay 0–24 循环，驱动太阳位置/强度、天空与雾色。
 *
 * 白天 6:00–18:00，夜晚 18:00–6:00。太阳仰角按正弦近似：
 *   elevation = (timeOfDay - 6) / 12 * PI  （6 点 = 0，12 点 = PI/2，18 点 = PI）
 * 夜晚仰角为负，太阳落到地平线下。
 */

export interface DayNightState {
  timeOfDay: number;
  dayFactor: number; // 0=夜，1=昼，含晨昏平滑过渡
  isNight: boolean;
  sky: THREE.Color;
  fog: THREE.Color;
  sunIntensity: number;
  ambientIntensity: number;
  hemisphereIntensity: number;
  sunPosition: THREE.Vector3;
}

const DAY_SKY = new THREE.Color(0xd9ecf7);
const NIGHT_SKY = new THREE.Color(0x0a1226);
const DUSK_SKY = new THREE.Color(0xe8a45c);

const DAY_FOG = new THREE.Color(0xdcecf4);
const NIGHT_FOG = new THREE.Color(0x0c1428);

// 光照基准强度（沿用 createViewer 的白天值）
const SUN_DAY = 2.65;
const AMBIENT_DAY = 1.15;
const HEMISPHERE_DAY = 2.25;

const SUN_DISTANCE = 220;

export class DayNightController {
  timeOfDay = 9.5; // 从上午开始
  timeScale = 0.03; // 小时/秒：约 13 分钟跑完一整天

  private readonly _sky = new THREE.Color();
  private readonly _fog = new THREE.Color();
  private readonly _sunPosition = new THREE.Vector3();

  constructor() {
    this._sky.copy(DAY_SKY);
    this._fog.copy(DAY_FOG);
  }

  /** 手动跳到某个时刻（用于演示/调试）。 */
  setTime(hour: number): void {
    this.timeOfDay = ((hour % 24) + 24) % 24;
  }

  /** 每帧推进时间。delta 单位秒。 */
  update(delta: number): void {
    this.timeOfDay = (this.timeOfDay + delta * this.timeScale) % 24;
  }

  /** 太阳仰角（弧度）：6 点=0，12 点=PI/2，18 点=PI，夜晚为负。 */
  private elevation(): number {
    return ((this.timeOfDay - 6) / 12) * Math.PI;
  }

  /** 计算并返回当前时间状态。 */
  getState(): DayNightState {
    const elev = this.elevation();
    const sinElev = Math.sin(elev);

    // 晨昏平滑：sinElev 从 0 升到 0.22 的过程线性过渡昼/夜
    const dayFactor = THREE.MathUtils.smoothstep(sinElev, -0.06, 0.22);

    // 天空：白天→黄昏→夜晚三段插值
    if (sinElev > 0.18) {
      this._sky.copy(DAY_SKY);
    } else if (sinElev > -0.08) {
      this._sky.copy(DUSK_SKY).lerp(DAY_SKY, (sinElev + 0.08) / 0.26);
    } else {
      this._sky.copy(NIGHT_SKY).lerp(DUSK_SKY, (sinElev + 0.08) / 0.06 + 0.02);
    }
    this._fog.copy(DAY_FOG).lerp(NIGHT_FOG, 1 - dayFactor);

    // 太阳位置：固定方位角（西北），仰角随时间变化
    const azimuth = Math.PI * 0.78; // 约 140°
    const sunX = Math.cos(elev) * Math.cos(azimuth) * SUN_DISTANCE;
    const sunY = Math.sin(elev) * SUN_DISTANCE;
    const sunZ = Math.cos(elev) * Math.sin(azimuth) * SUN_DISTANCE;
    this._sunPosition.set(sunX, sunY, sunZ);

    return {
      timeOfDay: this.timeOfDay,
      dayFactor,
      isNight: dayFactor < 0.5,
      sky: this._sky.clone(),
      fog: this._fog.clone(),
      sunIntensity: SUN_DAY * dayFactor,
      ambientIntensity: AMBIENT_DAY * (0.12 + 0.88 * dayFactor),
      hemisphereIntensity: HEMISPHERE_DAY * (0.14 + 0.86 * dayFactor),
      sunPosition: this._sunPosition.clone(),
    };
  }

  /** 当前是否为夜晚（供路灯等联动）。 */
  isNight(): boolean {
    return this.getState().isNight;
  }

  /** 用 24 小时制格式化显示，如 "09:30"。 */
  clockString(): string {
    const h = Math.floor(this.timeOfDay);
    const m = Math.floor((this.timeOfDay - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
}
