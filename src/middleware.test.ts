import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { langsys } from './middleware.js';
import type { LangsysServer } from './server-translator.js';

/** In-process end-to-end: a real Hono app, a mocked Langsys API. */

let fetchLog: Array<{ url: string; method: string; body: unknown }> = [];
let keyType: 'read' | 'write' = 'read';

const CATALOGS: Record<string, Record<string, Record<string, string>>> = {
    'es-ES': { Greetings: { 'Hello, {name}!': '¡Hola, {name}!' } },
    'fr-FR': { Greetings: { 'Hello, {name}!': 'Bonjour, {name}!' } },
};

function jsonResponse(payload: unknown, ok = true, status = 200) {
    return { ok, status, statusText: ok ? 'OK' : 'Error', url: 'mock', json: async () => payload };
}

beforeEach(() => {
    fetchLog = [];
    keyType = 'read';
    vi.stubGlobal('fetch', async (url: string, init?: { method?: string; body?: string }) => {
        fetchLog.push({ url: String(url), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(init.body) : undefined });
        if (String(url).includes('authorize-project')) return jsonResponse({ status: true, data: { key_type: keyType } });
        if (String(url).includes('/translations')) {
            const locale = new URL(String(url)).searchParams.get('locale') ?? '';
            return jsonResponse({ status: true, data: structuredClone(CATALOGS[locale] ?? {}) });
        }
        if (String(url).includes('translatable-items')) return jsonResponse({ status: true, data: [] });
        return jsonResponse({ status: false, errors: ['unexpected route'] }, false, 404);
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
});

function makeApp(extra: Record<string, unknown> = {}) {
    let captured: LangsysServer | null = null;
    const app = new Hono();
    app.use(
        langsys({
            projectid: 'test-project',
            key: 'test-key',
            baseLocale: 'en-US',
            supportedLocales: ['en-US', 'es-ES', 'fr-FR', 'de-DE'],
            ...extra,
        })
    );
    app.get('/', (c) => {
        captured = c.var.langsys;
        return c.text(`${c.var.langsysLocale}|${c.var.t('Hello, {name}!', 'Greetings', { name: 'Sara' })}`);
    });
    return { app, server: () => captured };
}

describe('langsys() middleware', () => {
    it('translates using the ?locale query param and persists it in a cookie', async () => {
        const { app } = makeApp();
        const res = await app.request('/?locale=es-ES');
        expect(await res.text()).toBe('es-ES|¡Hola, Sara!');
        expect(res.headers.get('set-cookie')).toContain('langsys_locale=es-ES');
    });

    it('reads the persisted cookie when no query param is present', async () => {
        const { app } = makeApp();
        const res = await app.request('/', { headers: { Cookie: 'langsys_locale=fr-FR' } });
        expect(await res.text()).toBe('fr-FR|Bonjour, Sara!');
        expect(res.headers.get('set-cookie')).toBeNull(); // nothing new to persist
    });

    it('matches Accept-Language against supported locales (prefix match)', async () => {
        const { app } = makeApp();
        const res = await app.request('/', { headers: { 'Accept-Language': 'fr-CA, en;q=0.5' } });
        expect(await res.text()).toBe('fr-FR|Bonjour, Sara!');
    });

    it('falls back to the default locale and source text', async () => {
        const { app } = makeApp();
        const res = await app.request('/', { headers: { 'Accept-Language': 'ja-JP' } });
        expect(await res.text()).toBe('en-US|Hello, Sara!');
    });

    it('serves concurrent requests in different locales without cross-talk', async () => {
        const { app } = makeApp();
        const [es, fr] = await Promise.all([
            app.request('/?locale=es-ES'),
            app.request('/?locale=fr-FR'),
        ]);
        expect(await es.text()).toBe('es-ES|¡Hola, Sara!');
        expect(await fr.text()).toBe('fr-FR|Bonjour, Sara!');
    });

    it('registers discovered phrases after the response on a write key', async () => {
        keyType = 'write';
        let captured: LangsysServer | null = null;
        const app = new Hono();
        app.use(langsys({ projectid: 'test-project', key: 'test-key', baseLocale: 'en-US' }));
        app.get('/new', (c) => {
            captured = c.var.langsys;
            return c.text(c.var.t('Fresh off the press', 'News'));
        });

        const res = await app.request('/new?locale=es-ES');
        expect(await res.text()).toBe('Fresh off the press');
        await captured!.flush();

        const posts = fetchLog.filter((e) => e.url.includes('translatable-items'));
        expect(posts).toHaveLength(1);
        expect((posts[0].body as { translatable_items: unknown[] }).translatable_items).toEqual([
            { type: 'phrase', phrase: 'Fresh off the press', category: 'News' },
        ]);
    });

    it('never registers on a read-only key', async () => {
        const { app, server } = makeApp();
        await app.request('/?locale=de-DE'); // de catalog is empty → every phrase misses
        await server()!.flush();
        expect(fetchLog.filter((e) => e.url.includes('translatable-items'))).toHaveLength(0);
    });
});
