# Changelog

## 0.1.0 — Unreleased

Initial release.

- Built on `langsys-js-typescript` ^0.6.5, so a missing ICU argument (the
  `<name>_gender` Langsys adds in gendered locales) renders the `other` branch
  instead of raw ICU.

- `langsys()` middleware — query → cookie → `Accept-Language` → default locale resolution with cookie persistence; typed `c.var.t`, `c.var.langsysLocale`, `c.var.langsys`.
- `LangsysServer` — multi-locale, locale-keyed catalog cache over the base SDK's API client: TTL + stampede guard, negative caching on failure, per-locale `t()` with the base SDK's lookup semantics and ICU interpolation.
- Post-response phrase registration: `executionCtx.waitUntil` on edge runtimes, background flush on Node/Bun/Deno; read-only keys never register.
