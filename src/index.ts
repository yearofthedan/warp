/** What a warp.config.ts and a project's own rules import from `warp`. */
export { defineConfig, type WarpConfig, type RuleSettings } from './model/config.ts';
export type { Ruleset, RulesetOverlay } from './model/ruleset.ts';
export type { Complexity, FunctionFacts, ImportEdge, ModuleFacts, Unit, UnitGraph, UnitKind } from './model/facts.ts';
export { ConfigError, type Finding, type Kind, type Plugin, type Rule, type RuleContext, wholeNumberOptions } from './model/rule.ts';
