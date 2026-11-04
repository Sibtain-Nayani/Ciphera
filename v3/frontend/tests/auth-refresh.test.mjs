import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const sourcePath = fileURLToPath(new URL("../src/lib/auth.ts", import.meta.url));
const source = await readFile(sourcePath, "utf8");
const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const auth = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

const originalFetch = globalThis.fetch;
const originalStorage = globalThis.localStorage;
const originalDocument = globalThis.document;
const originalWindow = globalThis.window;
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");

function installBrowserMocks() {
    const values = new Map();
    const events = [];
    globalThis.localStorage = {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: key => values.delete(key),
    };
    globalThis.document = { cookie: "" };
    globalThis.window = { dispatchEvent: event => events.push(event.type) };
    Object.defineProperty(globalThis, "navigator", {
        configurable: true,
        value: { locks: { request: (_name, callback) => callback({}) } },
    });
    return { events };
}

function credentials(access, refresh, userId) {
    return {
        access_token: access,
        refresh_token: refresh,
        token_type: "bearer",
        expires_in: 900,
        user: { user_id: userId, email: `${userId}@example.com`, full_name: userId, plan: "free" },
    };
}

function response(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalStorage;
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
    else delete globalThis.navigator;
});

test("concurrent 401 handlers share one refresh request", async () => {
    installBrowserMocks();
    auth.saveTokens(credentials("access-old", "refresh-old", "user-a"));

    let fetchCount = 0;
    let resolveFetch;
    globalThis.fetch = () => {
        fetchCount += 1;
        return new Promise(resolve => { resolveFetch = resolve; });
    };

    const first = auth.refreshTokens();
    const second = auth.refreshTokens();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(fetchCount, 1);

    resolveFetch(response(credentials("access-new", "refresh-new", "user-a")));
    assert.deepEqual(await Promise.all([first, second]), [true, true]);
    assert.equal(auth.getAccessToken(), "access-new");
    assert.equal(auth.getRefreshToken(), "refresh-new");
});

test("concurrent authenticated requests refresh once and each retries with the rotated token", async () => {
    installBrowserMocks();
    auth.saveTokens(credentials("access-old", "refresh-old", "user-a"));

    let refreshCount = 0;
    let resolveRefresh;
    const requestTokens = [];
    const apiBase = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
    globalThis.fetch = (url, options) => {
        if (String(url).endsWith("/api/v3/auth/refresh")) {
            refreshCount += 1;
            return new Promise(resolve => { resolveRefresh = resolve; });
        }
        const authorization = options.headers.get("Authorization");
        requestTokens.push(authorization);
        return Promise.resolve(authorization === "Bearer access-old"
            ? response({ detail: "expired" }, 401)
            : response({ ok: true }));
    };

    const pending = Promise.all([
        auth.authFetch(`${apiBase}/api/v3/documents/one`),
        auth.authFetch(`${apiBase}/api/v3/documents/two`),
    ]);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(refreshCount, 1);

    resolveRefresh(response(credentials("access-new", "refresh-new", "user-a")));
    const results = await pending;
    assert.deepEqual(results.map(result => result.status), [200, 200]);
    assert.equal(refreshCount, 1);
    assert.equal(requestTokens.filter(token => token === "Bearer access-old").length, 2);
    assert.equal(requestTokens.filter(token => token === "Bearer access-new").length, 2);
});

test("a late refresh response cannot replace a newly selected account", async () => {
    installBrowserMocks();
    auth.saveTokens(credentials("access-a", "refresh-a", "user-a"));

    let resolveFetch;
    globalThis.fetch = () => new Promise(resolve => { resolveFetch = resolve; });
    const pending = auth.refreshTokens();
    await new Promise(resolve => setImmediate(resolve));

    auth.saveTokens(credentials("access-b", "refresh-b", "user-b"));
    resolveFetch(response(credentials("access-a-new", "refresh-a-new", "user-a")));

    assert.equal(await pending, false);
    assert.equal(auth.getAccessToken(), "access-b");
    assert.equal(auth.getRefreshToken(), "refresh-b");
});

test("an in-flight request is not retried as a newly selected account", async () => {
    installBrowserMocks();
    auth.saveTokens(credentials("access-a", "refresh-a", "user-a"));

    let resolveRequest;
    let requestCount = 0;
    globalThis.fetch = () => {
        requestCount += 1;
        return new Promise(resolve => { resolveRequest = resolve; });
    };
    const apiBase = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
    const pending = auth.authFetch(`${apiBase}/api/v3/documents/private`);
    await new Promise(resolve => setImmediate(resolve));

    auth.saveTokens(credentials("access-b", "refresh-b", "user-b"));
    resolveRequest(response({ detail: "expired" }, 401));

    assert.equal((await pending).status, 401);
    assert.equal(requestCount, 1);
    assert.equal(auth.getAccessToken(), "access-b");
});

test("refresh failure clears credentials and notifies the auth context", async () => {
    const { events } = installBrowserMocks();
    auth.saveTokens(credentials("access-old", "refresh-old", "user-a"));
    globalThis.fetch = async () => response({ detail: "expired" }, 401);

    assert.equal(await auth.refreshTokens(), false);
    assert.equal(auth.getAccessToken(), null);
    assert.equal(auth.getRefreshToken(), null);
    assert.deepEqual(events, ["ciphera:auth-expired"]);
});

test("logout clears local credentials even when the server cannot be reached", async () => {
    installBrowserMocks();
    auth.saveTokens(credentials("access-old", "refresh-old", "user-a"));
    globalThis.fetch = async () => { throw new Error("network unavailable"); };

    await auth.logoutApi();
    assert.equal(auth.getAccessToken(), null);
    assert.equal(auth.getRefreshToken(), null);
});
