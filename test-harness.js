"use strict";

/*
 * هارنس تست آفلاین: express و openai را شبیه‌سازی می‌کند تا هندلرهای واقعی server.js
 * بدون شبکه و بدون AI اجرا شوند.
 *   node test-harness.js
 */

const Module = require("module");
const path = require("path");

const routes = [];

function fakeExpress() {
    const app = {
        use() {},
        get(p, ...h) { routes.push({ method: "GET", path: p, handler: h[h.length - 1] }); },
        post(p, ...h) { routes.push({ method: "POST", path: p, handler: h[h.length - 1] }); },
        listen() { return { close() {} }; }
    };
    const fn = () => app;
    fn.json = () => () => {};
    fn.static = () => () => {};
    return fn;
}

class FakeOpenAI {
    constructor() {
        this.chat = { completions: { create: async () => ({ choices: [{ message: { content: "ادامه‌ی داستان." } }] }) } };
    }
}

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === "express") return fakeExpress();
    if (request === "openai") return FakeOpenAI;
    if (request === "dotenv") return { config() {} };
    return origLoad.apply(this, arguments);
};

process.env.SESSIONS_DIR_TEST = "1";
require("./server.js");

const gm = require("./memory/gameMemory");
const gameplay = require("./memory/gameplay");
const content = require("./memory/content");

function findRoute(method, p) {
    const r = routes.find(x => x.method === method && x.path === p);
    if (!r) throw new Error(`route not found: ${method} ${p}`);
    return r;
}

async function call(sessionId, method, p, body = {}) {
    const r = findRoute(method, p);
    return new Promise((resolve, reject) => {
        gm.runWithSession(sessionId, async () => {
            try {
                await gm.hydrateSession(sessionId);
                const req = { body, headers: { "x-session-id": sessionId }, path: p, method };
                const res = {
                    statusCode: 200,
                    status(c) { this.statusCode = c; return this; },
                    json(o) { resolve({ status: this.statusCode, body: o }); return this; },
                    setHeader() {}, flushHeaders() {}, write() {}, end() { resolve({ status: this.statusCode, body: null }); }
                };
                await r.handler(req, res);
            } catch (e) { reject(e); }
        });
    });
}

/* اجرای تابع داخل session برای دستکاری مستقیم state */
function inSession(sessionId, fn) {
    return new Promise((resolve, reject) => {
        gm.runWithSession(sessionId, async () => {
            try { await gm.hydrateSession(sessionId); resolve(await fn()); } catch (e) { reject(e); }
        });
    });
}

module.exports = { call, inSession, gm, gameplay, content, routes };

if (require.main === module) {
    require("./test-run");
}
