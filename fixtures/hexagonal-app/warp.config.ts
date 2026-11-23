import { archetype, defineConfig, ruleset } from 'warp';

const layer = archetype('layer').contains((p) => p.files('src', '**'));

const hexagon = archetype('hexagon')
  .contains((p) =>
    p
      .dir('domain', 'src/domain', layer)
      .dir('app', 'src/app', layer, { using: (s) => [s.domain] })
      .dir('adapters', 'src/adapters', layer, { using: (s) => [s.domain, s.app] }),
  )
  .exposes(() => ({}));

const base = ruleset().rules({
  'file-cohesion': { maxLines: 15 },
  'function-cohesion': { maxLines: 6 },
  'cognitive-complexity': { max: 4 },
});

export default defineConfig({ root: hexagon, rulesets: { default: base } });
