import type { MiddlewareHandler } from 'hono';
import { LangsysServer, type LangsysServerOptions, type ServerTFunction } from './server-translator.js';
import { resolveLocale } from './locale.js';

export interface LangsysHonoOptions extends LangsysServerOptions {
    /** Locale served when nothing on the request matches. Defaults to baseLocale. */
    defaultLocale?: string;
    /** Locales the app serves; request locales are matched against it (exact, then language prefix). */
    supportedLocales?: string[];
    /** Query parameter carrying an explicit locale choice. Default 'locale'. */
    queryParam?: string;
    /** Cookie persisting the visitor's choice. Default 'langsys_locale'; empty string disables persistence. */
    cookieName?: string;
}

declare module 'hono' {
    interface ContextVariableMap {
        /** Translation function bound to this request's locale. */
        t: ServerTFunction;
        /** The locale resolved for this request (canonical BCP 47). */
        langsysLocale: string;
        /** The shared translator instance (refresh, stats, flush). */
        langsys: LangsysServer;
    }
}

function readCookie(header: string | undefined, name: string): string | null {
    if (!header || !name) return null;
    for (const part of header.split(';')) {
        const [key, ...rest] = part.trim().split('=');
        if (key === name) return decodeURIComponent(rest.join('='));
    }
    return null;
}

/**
 * Langsys middleware for Hono. Resolves the visitor's locale (?locale →
 * cookie → Accept-Language → default), persists explicit switches in a
 * cookie, loads that locale's catalog, and exposes:
 *
 *   c.var.t             — t() bound to the request locale
 *   c.var.langsysLocale — the resolved locale
 *   c.var.langsys       — the shared LangsysServer (refresh/stats/flush)
 *
 * After the response, pending phrase registrations flush via
 * executionCtx.waitUntil on edge runtimes (Cloudflare Workers) and
 * fire-and-forget on long-lived runtimes (Node, Bun, Deno).
 *
 *   const app = new Hono();
 *   app.use(langsys({ projectid: '…', key: '…', baseLocale: 'en-US' }));
 *   app.get('/', (c) => c.html(`<h1>${c.var.t('Welcome to our store', 'Home')}</h1>`));
 */
export function langsys(options: LangsysHonoOptions): MiddlewareHandler {
    const server = new LangsysServer(options);
    const queryParam = options.queryParam ?? 'locale';
    const cookieName = options.cookieName ?? 'langsys_locale';
    const resolution = {
        defaultLocale: options.defaultLocale ?? options.baseLocale ?? 'en',
        supportedLocales: options.supportedLocales,
    };

    return async (c, next) => {
        const rawQuery = c.req.query(queryParam) ?? null;
        const locale = resolveLocale(
            {
                query: rawQuery,
                cookie: readCookie(c.req.header('Cookie'), cookieName),
                acceptLanguage: c.req.header('Accept-Language') ?? null,
            },
            resolution
        );

        // Translation must never take the page down — a failed load still
        // yields a t() that renders source text.
        let t: ServerTFunction;
        try {
            t = await server.translator(locale);
        } catch {
            t = server.tFor(locale);
        }

        c.set('t', t);
        c.set('langsysLocale', locale);
        c.set('langsys', server);

        // Persist an explicit switch so it survives navigation without the param.
        if (rawQuery && cookieName) {
            c.header('Set-Cookie', `${cookieName}=${encodeURIComponent(locale)}; Path=/; Max-Age=31536000; SameSite=Lax`, {
                append: true,
            });
        }

        await next();

        const pending = server.flush();
        try {
            // Edge isolates can be torn down right after the response —
            // waitUntil keeps them alive until registration completes.
            c.executionCtx.waitUntil(pending);
        } catch {
            // Node/Bun/Deno: no executionCtx; the process outlives the request.
        }
    };
}
