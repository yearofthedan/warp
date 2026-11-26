# Changelog

## [0.4.1](https://github.com/yearofthedan/warp/compare/warp-v0.4.0...warp-v0.4.1) (2026-11-26)


### Features

* **cli:** say so when no rule is on ([e0802f7](https://github.com/yearofthedan/warp/commit/e0802f7069bd4c0585ec657f8c28192280d32fc2))
* find the nearest warp.yaml in the current folder or above it ([32dd765](https://github.com/yearofthedan/warp/commit/32dd76516ee3e838f01a710d11ed7753578faccb))


### Bug Fixes

* **advice:** bind a requires at every use, one with no instance yet ([eda1e1a](https://github.com/yearofthedan/warp/commit/eda1e1a46936b732b57eef14a14ee96ceefd5e68))
* **advice:** name a shadowed module with top., and refuse top. naming itself ([8afdbb9](https://github.com/yearofthedan/warp/commit/8afdbb975d477f6fc62037fc11758914da767d4b))
* **advice:** offer exposing a private file as a choice, and give a test file's real reason ([2af21ed](https://github.com/yearofthedan/warp/commit/2af21edfcfc249e2e6f478ade23e347cc57f4317))
* **advice:** require through an inline module that holds the archetype ([48982d8](https://github.com/yearofthedan/warp/commit/48982d8bb09114cca362690938d10a4a6ea666c2))
* clearer output for loose files, rule pages and the getting-started tsconfig ([a015004](https://github.com/yearofthedan/warp/commit/a015004c1022506c312bca5ec8ecc0c8572767cb))
* **cli:** count warp:recommended as on when a ruleset turns some rules off ([00b163c](https://github.com/yearofthedan/warp/commit/00b163cd51ffee9c6ef4cff4cce3d71ffde1a135))
* **cli:** keep git's error out of the output outside a repository ([2baabdf](https://github.com/yearofthedan/warp/commit/2baabdf38791a56eb60dfb7031abfb7bc0822b94))
* **config:** hint at requires or npm: when a name is not in scope ([7e58729](https://github.com/yearofthedan/warp/commit/7e5872986200c0fcce83d85bc294094351a9dcac))
* **config:** name a files module's test module by its dotted name ([1e04d03](https://github.com/yearofthedan/warp/commit/1e04d03e3684cf1bb24db0839005f42560b0bdc3))
* **config:** point an error about a modules block at its line ([b46993d](https://github.com/yearofthedan/warp/commit/b46993d58a36522d5ed83ac72b82d5d8ed272567))
* **config:** put every config error at its warp.yaml line ([c0d0c85](https://github.com/yearofthedan/warp/commit/c0d0c8510663f489a946881e39b6e318e5a64784))
* **config:** refuse a module that shadows an input ([57b4202](https://github.com/yearofthedan/warp/commit/57b42029283b0888387f7e3947219c2edeebc39d))
* **model:** fill {name} inside an inline module from the instance that holds it ([e02b1c3](https://github.com/yearofthedan/warp/commit/e02b1c3e9c50ce9694161d46375795fa2d7aa414))
* **unused-declaration:** judge a binding with the requires it fills ([ca772dd](https://github.com/yearofthedan/warp/commit/ca772ddb12d3bed8e0d599bcf3557c3083c836ff))

## [0.4.0](https://github.com/yearofthedan/warp/compare/warp-v0.3.0...warp-v0.4.0) (2026-11-25)


### ⚠ BREAKING CHANGES

* drop mirrored test modules, which the YAML language has no form for
* read the config from warp.yaml, with names scoped like the language
* **model:** a dir() test module no longer counts as files('x/**'), so a sibling files('x/*.dsl.ts') no longer reaches into its folder; declare it inside with contains().
* **model:** give test code its own surface with testExposes

### Features

* **model:** give test code its own surface with testExposes ([a56a304](https://github.com/yearofthedan/warp/commit/a56a304e841dbe4c3c586deb7dcb57ec86a2850d))
* **model:** let a dir() test module hold test modules of its own ([c5eaf70](https://github.com/yearofthedan/warp/commit/c5eaf704c90fd50c5a6c91daea6de7593c91a66c))
* point load errors and finding advice at their lines in warp.yaml ([c26729b](https://github.com/yearofthedan/warp/commit/c26729bfd5910bbacdc066264fe5ca8b041d5039))
* read the config from warp.yaml, with names scoped like the language ([5dbf57b](https://github.com/yearofthedan/warp/commit/5dbf57b5d7ff4d067f0abda8e64d05cf96992b74))


### Bug Fixes

* **model:** leave a test folder out of the test kit it inherits ([027d15d](https://github.com/yearofthedan/warp/commit/027d15de4df29d37b6b1c99a2c052149d0683285))
* offer a require through each archetype between a module and what it needs ([c048b61](https://github.com/yearofthedan/warp/commit/c048b61abf7c42375707942d8afc079c6667b35a))
* offer no fix that closes a cycle through other modules, and name packages as written ([96f5e0d](https://github.com/yearofthedan/warp/commit/96f5e0dd4b77ee038ae99a8c27e6a0ffe15a7a50))


### Code Refactoring

* drop mirrored test modules, which the YAML language has no form for ([b011713](https://github.com/yearofthedan/warp/commit/b0117130ed716c03c5b2921d2cb842a87550d57d))

## [0.3.0](https://github.com/yearofthedan/warp/compare/warp-v0.2.0...warp-v0.3.0) (2026-11-24)


### ⚠ BREAKING CHANGES

* **model:** `defineConfig({ tests })` is removed.
* **model:** `.tests()` is removed. Declare test code with `.testModule()` and shared test reach with `.testUsing()`. A file the config's `tests` patterns match that no test module claims is a config error.

### Features

* count a top-level module's entry as used ([9cd0b32](https://github.com/yearofthedan/warp/commit/9cd0b32da97ea6450ccd1260cfca2f256c38496d))
* give findings advice the config can follow ([9e242c9](https://github.com/yearofthedan/warp/commit/9e242c9304ef97863728ae4aa293a7571f11e4fe))
* **model:** drop the config's tests key ([5a1c44b](https://github.com/yearofthedan/warp/commit/5a1c44b2337c744a017788b696a843bb385bc43d))
* **model:** replace test layers with test modules and test kits ([6e4cd34](https://github.com/yearofthedan/warp/commit/6e4cd3450cd506b8f3f993c4a597aebaa380a7f7))
* report relative imports that resolve to no file, and skip warp's own config ([d905869](https://github.com/yearofthedan/warp/commit/d905869ec0cbafb9b040b3a366c688a9be16e9c5))

## [0.2.0](https://github.com/yearofthedan/warp/compare/warp-v0.1.0...warp-v0.2.0) (2026-11-23)


### ⚠ BREAKING CHANGES

* configs and custom rules import from '@yearofthedan/warp' instead of 'warp'.
* name the rules API rules and warp's own rules builtins
* count type-only imports in no-cycle and unit-cycle by default
* remove mustImport until a project needs required imports
* declare required imports on parts and set unclassified in rulesets
* keep rule settings in rulesets and remove kinds configs

### Features

* add test layers to archetypes ([2e96ca0](https://github.com/yearofthedan/warp/commit/2e96ca0477484d4cd99c89d9455c81b67a16fac3))
* archetype config builders with load-time checks ([5e226d9](https://github.com/yearofthedan/warp/commit/5e226d94b5e0946b3e44cd5ba1c8d7211a4034a3))
* count check findings by rule and module ([57c90dd](https://github.com/yearofthedan/warp/commit/57c90dda41009018c8c7e89f90a769f7b70164e9))
* count type-only imports in no-cycle and unit-cycle by default ([4640a46](https://github.com/yearofthedan/warp/commit/4640a46203697a95e8b0215b681d6294554cbe2b))
* declare required imports on parts and set unclassified in rulesets ([00147b7](https://github.com/yearofthedan/warp/commit/00147b79a2f76190df33f862929c70a9a13e8b8d))
* flag double exports on a surface instead of private re-exports ([50fe79b](https://github.com/yearofthedan/warp/commit/50fe79bf6c082aad63b97e27408ba06dbd4e0b68))
* gate comments and docs in ./do check ([69ba887](https://github.com/yearofthedan/warp/commit/69ba8879ab75c14dabdc2c5f3f5b7d2370fb4298))
* judge imports on archetype configs against each file's reach ([4cb50d6](https://github.com/yearofthedan/warp/commit/4cb50d682a8ef381c360253c01d985f8fb62153b))
* judge package imports and surface re-exports in archetype configs ([d4905a8](https://github.com/yearofthedan/warp/commit/d4905a8fd62827a2ba45d84fe89ab38af35e4a70))
* keep rule settings in rulesets and remove kinds configs ([7ddb0ca](https://github.com/yearofthedan/warp/commit/7ddb0ca29fe1a8df639f3d7b8100b491eda06329))
* **omp:** say once when warp is unavailable instead of staying silent ([a6ffc0c](https://github.com/yearofthedan/warp/commit/a6ffc0cc49be09bea10aacbbb1aec2574537ab10))
* publish as @yearofthedan/warp ([4694ffc](https://github.com/yearofthedan/warp/commit/4694ffcedd3457d451357e65159fe136bdb3c21c))
* remove mustImport until a project needs required imports ([d252b4a](https://github.com/yearofthedan/warp/commit/d252b4a844a3294fd9f59adb78295691012c8dbb))
* report each import loop once, shown in diff at the import that closed it ([e774bb1](https://github.com/yearofthedan/warp/commit/e774bb1cd0bafc318c0b76bc01796634e5f9b616))
* report only what changed since the last run with diff --since-last-run ([a3321f1](https://github.com/yearofthedan/warp/commit/a3321f115647d665b8141144e9a6b39fd32b4f6f))
* report pass-through re-exports in archetype configs ([70f7573](https://github.com/yearofthedan/warp/commit/70f757376d7967a8fb5f1ebf1b7337f3a43a0beb))
* report unused using entries, surfaces and empty modules ([944c229](https://github.com/yearofthedan/warp/commit/944c229d86380eeece5cf0405befad8520b29136))
* resolve archetype configs into units and parts ([a700933](https://github.com/yearofthedan/warp/commit/a7009331e18c10ee11683cd682b28b506a0b0bb4))
* reuse each file's facts between runs ([c1ccf83](https://github.com/yearofthedan/warp/commit/c1ccf8346fef387f8ee9edd8c09a14b6c426328c))
* rule settings, mustImport and cycles on archetype configs ([9cbd50b](https://github.com/yearofthedan/warp/commit/9cbd50b27cbcfc0e326ae444321ff907665a303f))
* run plugins' rules on archetype configs ([9d3aa50](https://github.com/yearofthedan/warp/commit/9d3aa50525a8434043882016201b045164d9798e))
* run the built-in rules on archetype configs through the rule contract ([ca65ff3](https://github.com/yearofthedan/warp/commit/ca65ff38f9d8bfb097e036a60fcc0ebf135bcacb))
* tell Claude once when warp fails in the claude-hook reporter ([9c100ef](https://github.com/yearofthedan/warp/commit/9c100efc77f4ae5cf444bfb0252b0dbfb8421ea1))


### Bug Fixes

* escape repository text and bound what agents are shown ([a458c89](https://github.com/yearofthedan/warp/commit/a458c89466fad16f7e8f9514c498c3ed1cac7d03))
* export a ref's files for diff without a git worktree ([6560d3e](https://github.com/yearofthedan/warp/commit/6560d3e04e93d9f162981c4def3b517e01ea813a))
* let conventional root files follow their convention in the docs check ([e72dbc0](https://github.com/yearofthedan/warp/commit/e72dbc0a54a0d5942dd4bfa2a4568eac78fdcc37))
* **model:** point tied folder globs at dir() ([a50ec6c](https://github.com/yearofthedan/warp/commit/a50ec6c20fe70897ab292f450f1f7ccb38e99232))
* redo cached facts when resolved compiler options or package files change ([beb3d69](https://github.com/yearofthedan/warp/commit/beb3d6957480874f3feca250baf2a667607b9b39))
* say an import of a loose file is to a file in no module yet ([f615e0a](https://github.com/yearofthedan/warp/commit/f615e0ab05e8cf343260a45ece6f1546ce95f273))


### Code Refactoring

* name the rules API rules and warp's own rules builtins ([7ebad8a](https://github.com/yearofthedan/warp/commit/7ebad8aa412392a17b2af11951312664b5fcdd13))
