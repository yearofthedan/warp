import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import type { Finding } from '../rules/rule.ts';
import { lineAt, placeFindings, placeProblems } from './configLines.ts';

const lines = new Map([
  ['root.main', 3],
  ['root.main.dependencies', 4],
  ['root.mainline', 9],
]);

describe('config lines', () => {
  it('places a text at the longest name it starts with', () => {
    assert.equal(lineAt(lines, 'root.main.dependencies names db, but nothing imports through it.'), 4);
    assert.equal(lineAt(lines, 'root.main: unknown key x'), 3);
    assert.equal(lineAt(lines, 'root.main.dependencies->db'), 4);
    assert.equal(lineAt(lines, 'root.mainline matches no files'), 9);
    assert.equal(lineAt(lines, 'root.mains matches no files'), undefined);
  });

  it('puts the file and line before each problem it can place', () => {
    assert.equal(
      placeProblems(lines, 'warp.yaml', 'root.main: unknown key x\nwarp.yaml: unknown key y\nplugins: expected paths'),
      'warp.yaml:3: root.main: unknown key x\nwarp.yaml: unknown key y\nplugins: expected paths',
    );
  });

  it("points the advice in the code's findings at the config's lines", () => {
    const [placed] = placeFindings(lines, 'warp.yaml', [
      {
        rule: 'r',
        key: 'k',
        file: 'src/a.ts',
        line: 2,
        value: 1,
        message: 'Add db to root.main.dependencies, or move the code.',
      },
    ]);
    assert.equal(placed!.message, 'Add db to root.main.dependencies (warp.yaml:4), or move the code.');
    assert.equal(placed!.line, 2);
  });

  it("moves the config's findings to their lines, and leaves the code's", () => {
    const finding = (file: string, message: string): Finding => ({
      rule: 'r',
      key: 'k',
      file,
      line: 1,
      value: 1,
      message,
    });
    assert.deepEqual(
      placeFindings(lines, 'warp.yaml', [
        finding('warp.yaml', 'root.main.dependencies names db'),
        finding('warp.yaml', 'nothing here'),
        finding('src/a.ts', 'root.main.dependencies names db'),
      ]).map((placed) => placed.line),
      [4, 1, 1],
    );
  });
});
