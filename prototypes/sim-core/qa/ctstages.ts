// 접촉 규칙 하나씩 켜는 순서 (AG-P039 A, AG-P040 A). 바탕은 OT_FLOW_ALL(부스트 5%)
import { CT_ALL, OT_FLOW_ALL } from '../src/config.ts';
import type { RaceOptions } from '../src/types.ts';

const BASE_OPTS: Partial<RaceOptions> = { reaction: false, slipstream: true, ...OT_FLOW_ALL };
export const CT_STAGES: { name: string; opts: Partial<RaceOptions> }[] = [
  { name: '0 OT_FLOW_ALL (CT-4 기록만)', opts: BASE_OPTS },
  { name: '1 + CT-1 차선 안 흔들림', opts: { ...BASE_OPTS, ctWobble: true } },
  { name: '2 + CT-2 라인 정확도', opts: { ...BASE_OPTS, ctWobble: true, ctLine: CT_ALL.ctLine } },
  { name: '3 + CT-3 접촉 3종', opts: { ...BASE_OPTS, ...CT_ALL } },
];

