import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import { commentsIn, judge, syntaxOf } from './_comments.ts';

const verdictOn = (path: string, text: string) => {
  const syntax = syntaxOf(path);
  assert.ok(syntax);
  return commentsIn(text, syntax).map((comment) => judge(path, comment));
};

describe('syntaxOf', () => {
  it('knows each kind of file warp keeps', () => {
    assert.equal(syntaxOf('src/a.ts'), 'script');
    assert.equal(syntaxOf('tsconfig.json'), 'script');
    assert.equal(syntaxOf('.github/workflows/ci.yml'), 'hash');
    assert.equal(syntaxOf('scripts/check'), 'hash');
    assert.equal(syntaxOf('.vite-hooks/pre-commit'), 'hash');
    assert.equal(syntaxOf('.gitignore'), 'hash');
    assert.equal(syntaxOf('docs/a.md'), 'markdown');
    assert.equal(syntaxOf('logo.svg'), 'markup');
    assert.equal(syntaxOf('LICENSE'), 'none');
  });

  it('leaves a file it does not know unclaimed, so the gate can refuse it', () => {
    assert.equal(syntaxOf('assets/thing.toml'), undefined);
    assert.equal(syntaxOf('notes'), undefined);
  });
});

describe('commentsIn', () => {
  it('joins line comments on consecutive lines into one comment', () => {
    const comments = commentsIn('const a = 1;\n// why: x\n// until: #1\nconst b = 2; // why: y\n', 'script');
    assert.deepEqual(comments, [
      { line: 2, lines: ['why: x', 'until: #1'] },
      { line: 4, lines: ['why: y'] },
    ]);
  });

  it('reads block comments line by line', () => {
    assert.deepEqual(commentsIn('/**\n * why: x\n * until: #1\n */\n', 'script'), [
      { line: 1, lines: ['', 'why: x', 'until: #1', ''] },
    ]);
  });

  it('skips comment markers inside strings, templates and regular expressions', () => {
    const text = "const a = '// no';\nconst b = `/* ${a} */`;\nconst c = /\\/\\/ no/;\nconst d = 4 / 2 / 1;\n";
    assert.deepEqual(commentsIn(text, 'script'), []);
  });

  it('reads hash comments outside quotes, past a shebang', () => {
    const text = '#!/bin/sh\necho \'# no\' "# no" ${#x}\n# why: x\n# until: #1\nrun: ls # why: y\n';
    assert.deepEqual(commentsIn(text, 'hash'), [
      { line: 3, lines: ['why: x', 'until: #1'] },
      { line: 5, lines: ['why: y'] },
    ]);
  });

  it('reads HTML comments in markdown outside its code fences', () => {
    const text = '<!-- why: x -->\n```html\n<!-- example -->\n```\n';
    assert.deepEqual(commentsIn(text, 'markdown'), [{ line: 1, lines: ['why: x'] }]);
  });
});

describe('judge', () => {
  it('passes a why: and an until: that names something checkable', () => {
    for (const until of ['#12', 'yearofthedan/warp#3', 'https://x.dev/y', 'vite-plus@1.7.0', '2027-01-01']) {
      assert.deepEqual(verdictOn('a.ts', `// why: x\n// until: ${until}\n`), [undefined]);
    }
  });

  it('passes directives under the same template', () => {
    assert.deepEqual(verdictOn('a.ts', '// why: x\n// until: #1\n// @ts-expect-error\n'), [undefined]);
  });

  it('refuses a comment without both lines, including a lone directive', () => {
    const [bare, directive] = verdictOn('a.ts', '// a note\nconst a = 1;\n// oxlint-disable-next-line no-x\n');
    assert.deepEqual(bare?.problems.slice(0, 2), ['needs one why: line, has 0', 'needs one until: line, has 0']);
    assert.equal(directive?.problems.length, 2);
  });

  it('refuses prose riding under the template, anywhere in the comment', () => {
    const [verdict] = verdictOn('a.ts', '/* why: x\n   until: #1\n   and more besides */\n');
    assert.deepEqual(verdict?.problems, ['holds lines other than why:, until: and directives: "and more besides"']);
  });

  it('refuses a second why: or until:', () => {
    const [verdict] = verdictOn('a.ts', '// why: x\n// why: y\n// until: #1\n');
    assert.deepEqual(verdict?.problems, ['needs one why: line, has 2']);
  });

  it('refuses an until: that names no end', () => {
    for (const until of ['never', 'n/a', 'TBD', 'forever', 'if one is ever used', 'when needed', 'later', '-']) {
      const [verdict] = verdictOn('a.ts', `// why: x\n// until: ${until}\n`);
      assert.deepEqual(verdict?.problems, [`until: names no point it ends: "${until}"`], until);
    }
  });

  it('flags a free-text until: for review without failing', () => {
    assert.deepEqual(verdictOn('a.ts', '// why: x\n// until: Vite+ bundles TypeScript 7.1\n'), [
      { line: 1, problems: [], review: 'Vite+ bundles TypeScript 7.1' },
    ]);
  });

  it('refuses a line past the length cap', () => {
    const [verdict] = verdictOn('a.ts', `// why: ${'x'.repeat(120)}\n// until: #1\n`);
    assert.deepEqual(verdict?.problems, ['why: runs past 120 characters']);
  });

  it("passes the markers tools read: ./do's help line and a pinned action's version", () => {
    assert.deepEqual(verdictOn('scripts/check', '#!/bin/sh\n# help: Run it.\n'), [undefined]);
    assert.deepEqual(verdictOn('.github/workflows/ci.yml', 'uses: a/b@0123 # v7.0.1\n'), [undefined]);
    assert.notEqual(verdictOn('src/a.ts', '// help: Run it.\n')[0], undefined);
  });
});
