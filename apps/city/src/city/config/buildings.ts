import { buildingPosition } from './cityLayout';
import { DISCOVERED_CATEGORY_BUILDINGS } from './knowledge';

const OFFICE_SCENE_URL = import.meta.env.DEV
  ? 'http://127.0.0.1:5174/office.html'
  : './office.html';

/** 城市建筑配置：布局语义与 3D 资产解耦。 */
export interface BuildingDef {
  id: string;
  name: string;
  color: number;
  accentColor: number;
  width: number;
  depth: number;
  height: number;
  position: [number, number, number];
  asset?: string;
  labelHeight?: number;
  tagline: string;
  summary: string;
  roomScene?: string;
  roomSceneLabel?: string;
}

const CORE_BUILDINGS: BuildingDef[] = [
  {
    id: 'company', name: '公司', color: 0xe3ded3, accentColor: 0x2463df,
    width: 26, depth: 26, height: 36, position: buildingPosition('company'),
    asset: '/assets/kenney-city/building-skyscraper-d.glb', labelHeight: 25,
    tagline: '决策与创造', summary: '收录产品判断、用户需求与公开边界的工作档案。',
    roomScene: OFFICE_SCENE_URL, roomSceneLabel: '进入公司内部',
  },
  {
    id: 'home', name: '家庭', color: 0xe6ded2, accentColor: 0xb77846,
    width: 22, depth: 20, height: 15, position: buildingPosition('home'),
    asset: '/assets/kenney-city/building-e.glb',
    tagline: '生活与关系', summary: '收纳训练、搬家、注意力与长期成长的私人记录。',
    roomScene: './home.html', roomSceneLabel: '进入家庭内部',
  },
  {
    id: 'school', name: '学校', color: 0xe8e3d8, accentColor: 0x4667ad,
    width: 26, depth: 20, height: 16, position: buildingPosition('school'),
    asset: '/assets/kenney-city/building-k.glb',
    tagline: '学习与探索', summary: '把未完成的问题留在这里：商业、性能、研究与创意 Agent。',
    roomScene: './classroom.html', roomSceneLabel: '进入学校内部',
  },
  {
    id: 'hospital', name: '医院', color: 0xf0ede5, accentColor: 0xc94b4b,
    width: 24, depth: 20, height: 20, position: buildingPosition('hospital'),
    asset: '/assets/kenney-city/building-j.glb',
    tagline: '健康与照护', summary: '用于知识库健康检查、质量诊断与修复记录。',
    roomScene: './hospital.html', roomSceneLabel: '进入医院内部',
  },
  {
    id: 'canteen', name: '食堂', color: 0xe3dfd0, accentColor: 0x5f8f63,
    width: 20, depth: 16, height: 12, position: buildingPosition('canteen'),
    asset: '/assets/kenney-city/building-e.glb',
    tagline: '味觉与共享', summary: '保存视觉实验、封面测试与可以共享的创作记录。',
    roomScene: './canteen.html', roomSceneLabel: '进入企业食堂',
  },
  {
    id: 'construction', name: '施工工地', color: 0xc9b99d, accentColor: 0xc47a3f,
    width: 18, depth: 18, height: 16, position: buildingPosition('construction'),
    asset: '/assets/kenney-city/building-i.glb',
    tagline: '实验与未完成', summary: '承载黑客松、技能分类和尚未收口的工程实验。',
    roomScene: './construction.html', roomSceneLabel: '进入施工工地',
  },
  {
    id: 'characters', name: '角色广场', color: 0xd9e4e1, accentColor: 0x4d6bfe,
    width: 18, depth: 16, height: 11, position: [-98, 0, -48],
    tagline: '角色与行动', summary: '牛来的牛与 DeepSeek 在城市里留下入口；进入后可选择角色、移动与巡游。',
    roomScene: './characters.html', roomSceneLabel: '进入角色实验场',
  },
  {
    id: 'museum', name: '美术馆', color: 0xe6dfd6, accentColor: 0x8b5e83,
    width: 22, depth: 16, height: 18, position: buildingPosition('museum'),
    asset: '/assets/kenney-city/building-c.glb',
    tagline: '艺术与观看', summary: '收录艺术史、美术、绘画、雕塑、展览与建筑美学知识。',
  },
];

export const BUILDINGS: BuildingDef[] = [...CORE_BUILDINGS, ...DISCOVERED_CATEGORY_BUILDINGS];
