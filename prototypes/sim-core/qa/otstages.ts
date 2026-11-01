// 추월 5단계 흐름의 하나씩 켜는 순서 (지시서 2026-11-02, AG-P036 A). 앞 단계 스위치를 유지하고 하나씩 더한다
import { BOOST_COMPARE, DIRTY_AIR_ON } from '../src/config.ts';
import type { RaceOptions } from '../src/types.ts';

const s1: Partial<RaceOptions> = { desiredSpeed: 'target' };
const s2 = { ...s1, otRelease: true };
const s3 = { ...s2, otSpanCorner: true };
const s4 = { ...s3, dirtyAir: DIRTY_AIR_ON };

export const STAGES: { name: string; opts: Partial<RaceOptions> }[] = [
  { name: '0 현행 (OT-4 기록만)', opts: {} },
  { name: '1 + OT-1 가고 싶은 속도', opts: s1 },
  { name: '2 + OT-2 묶임 해제', opts: s2 },
  { name: '3 + OT-3 시도 유지', opts: s3 },
  { name: `4 + OT-5 더티 에어 ${DIRTY_AIR_ON}%`, opts: s4 },
  ...BOOST_COMPARE.map((y) => ({ name: `5 + OT-6 부스트 ${y}%`, opts: { ...s4, boost: y } })),
  ...BOOST_COMPARE.map((y) => ({ name: `6 + OT-7 코너 우선권 (부스트 ${y}%)`, opts: { ...s4, boost: y, cornerPriority: true } })),
];
