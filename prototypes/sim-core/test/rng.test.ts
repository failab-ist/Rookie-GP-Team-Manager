import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng, shuffle } from '../src/rng.ts';

const take = (seed: number, n: number) => {
  const rng = createRng(seed);
  return Array.from({ length: n }, () => rng());
};

test('같은 시드면 같은 수열', () => {
  assert.deepEqual(take(42, 1000), take(42, 1000));
});

test('다른 시드면 다른 수열', () => {
  assert.notDeepEqual(take(42, 10), take(43, 10));
});

test('값은 [0, 1)', () => {
  for (const v of take(7, 10000)) assert.ok(v >= 0 && v < 1);
});

test('shuffle은 같은 시드면 같은 순서, 원소는 그대로', () => {
  const items = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  const a = shuffle(createRng(5), items);
  assert.deepEqual(a, shuffle(createRng(5), items));
  assert.deepEqual([...a].sort((x, y) => x - y), items);
  assert.deepEqual(items, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
});
