import { all, archetype, defineConfig, dir, exposes, files, ruleset } from 'warp';

const layer = archetype('layer')
  .contains((m) => m.module('src', files('**'), exposes(all())))
  .exposes(all());

const hexagon = archetype('hexagon')
  .contains((m) =>
    m
      .module('domain', dir('src/domain'), layer)
      .module('app', dir('src/app'), layer.using((s) => [s.domain]))
      .module('adapters', dir('src/adapters'), layer.using((s) => [s.domain, s.app])),
  );

const base = ruleset().rules({
  'file-cohesion': { maxLines: 15 },
  'function-cohesion': { maxLines: 6 },
  'cognitive-complexity': { max: 4 },
});

export default defineConfig({ root: hexagon, rulesets: { default: base } });
