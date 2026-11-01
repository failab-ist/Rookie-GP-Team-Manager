// node src/cli.ts --input examples/race.json [--track data/tracks/T1.json] [--seed 42] [--laps 3] [--out result.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { DEFAULT_LAPS } from './config.ts';
import { checkCarTotal, simulate } from './sim.ts';
import type { Entry, RaceInput } from './types.ts';

const { values } = parseArgs({
  options: {
    input: { type: 'string' },
    track: { type: 'string' },
    seed: { type: 'string' },
    laps: { type: 'string' },
    out: { type: 'string' },
  },
});
if (!values.input) {
  console.error('사용법: node src/cli.ts --input <참가자 세팅 json> [--track <트랙 json>] [--seed N] [--laps N] [--out 결과.json]');
  process.exit(1);
}

const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const file = readJson(values.input);
const input: RaceInput = {
  seed: values.seed !== undefined ? Number(values.seed) : file.seed,
  track: values.track ? readJson(values.track) : file.track,
  laps: values.laps !== undefined ? Number(values.laps) : (file.laps ?? DEFAULT_LAPS),
  entries: file.entries,
};
for (const { car } of input.entries as Entry[]) checkCarTotal(car.id, car.stats);

const json = JSON.stringify(simulate(input));
if (values.out) writeFileSync(values.out, json);
else process.stdout.write(json + '\n');
