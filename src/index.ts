/**
 * Langsys SDK — Hono middleware
 *
 * A thin server-side wrapper over langsys-js-typescript: a locale-keyed
 * catalog cache (multi-locale safe under concurrent requests) surfaced as one
 * Hono middleware. Runs anywhere Hono does — Node, Bun, Deno, Cloudflare
 * Workers. Same rule as every binding: the phrase in your code is both the
 * lookup key and the base-language default.
 */

export { langsys, type LangsysHonoOptions } from './middleware.js';
export { LangsysServer, type LangsysServerOptions, type ServerTFunction } from './server-translator.js';
export {
    resolveLocale,
    parseAcceptLanguage,
    matchSupported,
    type LocaleResolutionConfig,
    type LocaleSources,
} from './locale.js';

// Convenience re-exports so consumers rarely need the base package directly.
export type { TranslationParams, iCategories, iTranslations } from 'langsys-js-typescript';
