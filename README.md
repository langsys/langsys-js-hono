# langsys-js-hono

Hono middleware for the [Langsys](https://langsys.dev) translation SDK — realtime continuous translations with automatic token discovery, on every runtime Hono runs on: Node, Bun, Deno, and Cloudflare Workers.

A thin server-side wrapper over [`langsys-js-typescript`](https://github.com/langsys/langsys-js-typescript). Same rule as every Langsys binding: **the phrase in your code is both the lookup key and the base-language default** — no keys file, no extraction step. Unlike the browser bindings, this one keeps a **locale-keyed catalog cache**, so concurrent requests in different locales never race.

## Install

```sh
npm install langsys-js-hono
```

## Use

```ts
import { Hono } from 'hono';
import { langsys } from 'langsys-js-hono';

const app = new Hono();

app.use(
    langsys({
        projectid: process.env.LANGSYS_PROJECT_ID!,
        key: process.env.LANGSYS_API_KEY!, // write key — server-side only
        baseLocale: 'en-US',
        supportedLocales: ['en-US', 'es-ES', 'fr-FR', 'de-DE'],
    })
);

app.get('/', (c) =>
    c.html(`
        <h1>${c.var.t('Welcome to our store', 'Home')}</h1>
        <p>${c.var.t('Hello, {name}!', 'Greetings', { name: 'Sara' })}</p>
    `)
);

export default app;
```

The middleware resolves the visitor's locale (`?locale` → cookie → `Accept-Language` → default), persists explicit switches in a cookie, loads that locale's catalog, and exposes `c.var.t`, `c.var.langsysLocale`, and `c.var.langsys` (the shared instance: `refresh()`, `stats()`, `flush()`). Context variables are fully typed via Hono's `ContextVariableMap`.

ICU plurals work the same as every Langsys SDK:

```ts
c.var.t('You have {count, plural, one {# new message} other {# new messages}}.', 'Inbox', { count: 3 });
```

## How it behaves

- **Multi-locale safe.** One catalog per locale, cached with a TTL (default 300s) and a stampede guard. Concurrent requests in different locales each get their own `t()`.
- **Edge-aware.** No timers, no Node-only APIs. After the response, pending phrase registrations flush via `executionCtx.waitUntil` on Workers; on long-lived runtimes they flush in the background.
- **Fails soft.** Bad credentials, an unreachable API, a cold catalog — pages render source text; nothing throws in the request path.
- **Token discovery on write keys.** A phrase `t()` has never seen is registered with your project (batched); with a read-only key the queue is skipped entirely.

## Notes

- The underlying API client is process-global: one server (or isolate) serves one Langsys project.
- On Workers, put the write key in a secret binding and pass it through your app's env plumbing — never in source.

## License

MIT © Flexark International Ltda.
