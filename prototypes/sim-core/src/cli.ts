// node src/cli.ts --input examples/race.json [--seed 42] [--laps 3] [--out result.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { DEFAULT_LAPS } from './config.ts';
import { simulate } from './sim.ts';
import type { RaceInput } from './types.ts';

const { values } = parseArgs({
  options: {
    input: { type: 'string' },
    seed: { type: 'string' },
    laps: { type: 'string' },
    out: { type: 'string' },
  },
});
if (!values.input) {
  console.error('사용법: node src/cli.ts --input <참가자 세팅 json> [--seed N] [--laps N] [--out 결과.json]');
  process.exit(1);
}

const file = JSON.parse(readFileSync(values.input, 'utf8'));
const input: RaceInput = {
  seed: values.seed !== undefined ? Number(values.seed) : file.seed,
  track: file.track,
  laps: values.laps !== undefined ? Number(values.laps) : (file.laps ?? DEFAULT_LAPS),
  entries: file.entries,
};

const json = JSON.stringify(simulate(input));
if (values.out) writeFileSync(values.out, json);
else process.stdout.write(json + '\n');
