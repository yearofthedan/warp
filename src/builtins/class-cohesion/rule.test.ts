import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import type { ClassFacts, FileFacts, Member, MemberKind } from '../../domain/facts/facts.ts';
import { classCohesion } from './rule.ts';

const member = (name: string, kind: MemberKind, line: number, endLine = line): Member => ({
  name,
  kind,
  line,
  endLine,
});

const server = (links: [number, number][]): ClassFacts => ({
  name: 'Server',
  line: 1,
  endLine: 40,
  lines: 40,
  members: {
    members: [
      member('#handlers', 'state', 2),
      member('#transportId', 'state', 3),
      member('addHandler', 'function', 5, 10),
      member('getHandler', 'function', 12, 15),
      member('send', 'function', 17, 30),
      member('status', 'function', 32, 39),
    ],
    links,
  },
});

const split: [number, number][] = [
  [2, 0],
  [3, 0],
  [4, 1],
];

const facts = (...classes: ClassFacts[]): FileFacts => ({
  path: 'src/server.ts',
  lines: 40,
  imports: [],
  externals: [],
  unresolved: [],
  members: { members: [], links: [] },
  functions: [],
  classes,
});

const check = (file: FileFacts, maxLines: number) => classCohesion.check({ file, options: { maxLines } });

describe('class-cohesion', () => {
  it('reports the groups of methods that use its state, counting only their lines against the tripwire', () => {
    assert.deepEqual(check(facts(server(split)), 23), [
      {
        rule: 'class-cohesion',
        key: 'class-cohesion:src/server.ts:Server',
        file: 'src/server.ts',
        line: 1,
        value: 2,
        limit: 1,
        message:
          'Class Server in src/server.ts:1 is 40 lines, 24 of them in methods that use its state (tripwire 23), and its ' +
          'methods fall into 2 groups that share no fields or calls: [addHandler, getHandler] (lines 5-15); [send] ' +
          '(lines 17-30). Each group can become its own class.',
        details: {
          lines: 40,
          judgedLines: 24,
          tripwire: 23,
          groups: [
            { names: ['addHandler', 'getHandler'], lines: [5, 15] },
            { names: ['send'], lines: [17, 30] },
          ],
        },
      },
    ]);
  });

  it('passes a class whose stateful methods are within the tripwire', () => {
    assert.deepEqual(check(facts(server(split)), 24), []);
  });

  it('passes a class whose methods share its state', () => {
    assert.deepEqual(check(facts(server([...split, [3, 1]])), 1), []);
  });

  it('counts a method that reaches state through a sibling, and leaves out a chain that reaches none', () => {
    const chained = server([...split, [5, 4]]);
    assert.match(check(facts(chained), 1)[0]?.message ?? '', /32 of them in methods/);
    const stateless = server([
      [2, 0],
      [3, 0],
      [4, 5],
    ]);
    assert.deepEqual(check(facts(stateless), 1), []);
  });

  it('keys classes that share a name by their order', () => {
    const keys = check(facts(server(split), server(split)), 1).map((finding) => finding.key);
    assert.deepEqual(keys, ['class-cohesion:src/server.ts:Server', 'class-cohesion:src/server.ts:Server#2']);
  });
});
