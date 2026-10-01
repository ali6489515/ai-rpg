"use strict";

/*
 * نقشه‌ی پویا (گراف مکان‌های کشف‌شده)
 *
 * - هر مکانی که بازیکن واقعاً به آن برود یک گره می‌شود.
 * - هر جابه‌جایی بین دو مکان یک یال (مسیر) می‌سازد.
 * - مختصات گره‌ها هنگام ساخت محاسبه و ذخیره می‌شود تا نقشه هر نوبت جابه‌جا نشود.
 *
 * ساختار:
 * {
 *   locations: { l1: { id, name, description, x, y, visits, firstTurn, lastTurn } },
 *   edges: [["l1", "l2"]],
 *   current: "l1",
 *   nextId: 2
 * }
 */

const MAX_LOCATIONS = 40;
const MAX_NAME_LENGTH = 40;
const MAX_DESCRIPTION_LENGTH = 160;
const MIN_NODE_DISTANCE = 0.85;

const world = require("./world");

/*
 * کلید مقایسه‌ی نام مکان؛ منطق اصلی در world.locationKey است تا
 * «مزرعهٔ سوخته» ، «مزرعه‌ی سوخته» و «مزرعه ی سوخته» همیشه یک گره باشند.
 */
function normalizeName(name) {
    return world.locationKey(name);
}

function cleanName(name) {
    return String(name || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, MAX_NAME_LENGTH);
}

function hashString(text) {
    let h = 2166136261;
    const s = String(text);
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function round2(n) {
    return Math.round(n * 100) / 100;
}

function createEmptyMap(startName, turn = 0) {
    const requested = cleanName(startName) || "دهکده‌ی آغازین";
    const start = world.getLocation(requested) || world.WORLD_LOCATIONS[0];
    const locations = {};
    const coords = {
        "دهکده‌ی آغازین": [0, 0],
        "جنگل مه‌گرفته": [-1.7, -1.2],
        "رودخانهٔ نقره‌ای": [-3.0, -0.4],
        "مزرعهٔ سوخته": [1.8, -1.4],
        "خرابه‌های سنگی": [-2.9, -2.0],
        "بازار سرخ": [2.5, 0.2],
        "برج دیده‌بانی متروک": [3.6, -1.5],
        "غار استخوان": [2.8, -2.8],
        "زیارتگاه خاموش": [-1.7, -2.9],
        "گردنهٔ کلاغ‌ها": [2.0, -3.9],
        "دریاچهٔ بی‌صدا": [-0.1, -5.0]
    };

    world.WORLD_LOCATIONS.forEach((item, index) => {
        const [x, y] = coords[item.name] || [index, 0];
        locations[`l${index + 1}`] = {
            id: `l${index + 1}`,
            name: item.name,
            description: item.description,
            x, y,
            visits: item.name === start.name ? 1 : 0,
            firstTurn: item.name === start.name ? turn : null,
            lastTurn: item.name === start.name ? turn : 0,
            discovered: item.name === start.name
        };
    });

    const idsByName = Object.fromEntries(
        Object.values(locations).map(l => [l.name, l.id])
    );

    return {
        locations,
        edges: world.WORLD_EDGES
            .map(([a, b]) => [idsByName[a], idsByName[b]])
            .filter(([a, b]) => a && b),
        current: idsByName[start.name] || "l1",
        nextId: world.WORLD_LOCATIONS.length + 1
    };
}

function isValidMap(map) {
    return (
        map &&
        typeof map === "object" &&
        map.locations &&
        typeof map.locations === "object" &&
        !Array.isArray(map.locations) &&
        Object.keys(map.locations).length > 0 &&
        Array.isArray(map.edges)
    );
}

/* برای سیوهای قدیمی که map ندارند یا داده‌ی خراب دارند */
function mergeMap(saved, currentLocationName, turn = 0) {
    // دنیای اصلی ثابت است؛ داده‌های بازدید/توصیف سیو قدیمی را روی همین اسکلت می‌نشانیم.
    const base = createEmptyMap(currentLocationName, turn);

    if (!isValidMap(saved)) {
        return base;
    }

    const savedLocations = Object.values(saved.locations)
        .filter(loc => loc && typeof loc === "object" && loc.name);

    for (const loc of savedLocations) {
        const target = findByName(base, loc.name);
        if (!target) continue;

        target.visits = Math.max(0, Number(loc.visits) || 0);
        target.firstTurn = loc.firstTurn == null ? target.firstTurn : Number(loc.firstTurn) || 0;
        target.lastTurn = Number(loc.lastTurn) || target.lastTurn || 0;
        target.discovered = loc.discovered !== false && target.visits > 0;

        const savedDescription = String(loc.description || "").trim();
        if (savedDescription) {
            target.description = savedDescription.slice(0, MAX_DESCRIPTION_LENGTH);
        }
    }

    const savedCurrent = saved.locations[saved.current];
    const currentName = savedCurrent?.name || currentLocationName;
    const current = findByName(base, currentName) || findByName(base, currentLocationName);
    if (current) {
        base.current = current.id;
        current.discovered = true;
        current.visits = Math.max(1, current.visits || 0);
    }

    return base;
}

function findByName(map, name) {
    const key = normalizeName(name);
    if (!key) return null;
    return (
        Object.values(map.locations).find(
            l => normalizeName(l.name) === key
        ) || null
    );
}

function hasEdge(map, a, b) {
    return map.edges.some(
        ([p, q]) => (p === a && q === b) || (p === b && q === a)
    );
}

function minDistanceTo(map, x, y) {
    let best = Infinity;
    for (const l of Object.values(map.locations)) {
        const d = Math.hypot(l.x - x, l.y - y);
        if (d < best) best = d;
    }
    return best;
}

/* مختصات مکان جدید نسبت به مکان فعلی؛ کاملاً قطعی (بر اساس هش نام) */
function placeNear(map, origin, name) {
    const base = (hashString(normalizeName(name)) % 360) * (Math.PI / 180);
    const steps = 16;

    for (const dist of [1.0, 1.3, 1.6, 2.0, 2.6]) {
        for (let k = 0; k < steps; k++) {
            const angle = base + (k * 2 * Math.PI) / steps;
            const x = origin.x + Math.cos(angle) * dist;
            const y = origin.y + Math.sin(angle) * dist;
            if (minDistanceTo(map, x, y) >= MIN_NODE_DISTANCE) {
                return { x: round2(x), y: round2(y) };
            }
        }
    }

    // آخرین چاره: بسیار دور از مبدأ
    return {
        x: round2(origin.x + Math.cos(base) * 3.2),
        y: round2(origin.y + Math.sin(base) * 3.2)
    };
}

function enforceCap(map) {
    const ids = Object.keys(map.locations);
    if (ids.length <= MAX_LOCATIONS) return;

    const removable = ids
        .filter(id => id !== map.current)
        .sort(
            (a, b) =>
                (map.locations[a].lastTurn || 0) -
                (map.locations[b].lastTurn || 0)
        );

    const victim = removable[0];
    if (!victim) return;

    delete map.locations[victim];
    map.edges = map.edges.filter(([a, b]) => a !== victim && b !== victim);
}

/**
 * بازیکن به مکانی رفته (یا در همان مکان مانده).
 * map را در جا تغییر می‌دهد و همان را برمی‌گرداند.
 */
function visit(map, name, turn = 0, note = "") {
    const clean = cleanName(name);
    if (!clean) return map;

    let target = findByName(map, clean);
    const previous = map.locations[map.current] || null;

    if (!target) {
        const origin = previous || { x: 0, y: 0 };
        const pos = placeNear(map, origin, clean);
        const id = `l${map.nextId++}`;

        target = {
            id,
            name: clean,
            description: "",
            x: pos.x,
            y: pos.y,
            visits: 0,
            firstTurn: turn,
            lastTurn: turn
        };

        map.locations[id] = target;
    }

    const moved = !previous || previous.id !== target.id;

    if (moved) {
        target.visits = (target.visits || 0) + 1;
        target.discovered = true;

        if (previous && !hasEdge(map, previous.id, target.id)) {
            map.edges.push([previous.id, target.id]);
        }

        map.current = target.id;
    }

    target.lastTurn = turn;

    const cleanNote = String(note || "").trim().slice(0, MAX_DESCRIPTION_LENGTH);
    if (cleanNote && !target.description) {
        target.description = cleanNote;
    }

    enforceCap(map);

    return map;
}

/* توصیف مکان فعلی (بدون جابه‌جایی) */
function describeCurrent(map, note) {
    const loc = map.locations[map.current];
    const cleanNote = String(note || "").trim().slice(0, MAX_DESCRIPTION_LENGTH);
    if (loc && cleanNote && !loc.description) {
        loc.description = cleanNote;
    }
    return map;
}

function neighborsOf(map, id) {
    const out = [];
    for (const [a, b] of map.edges) {
        if (a === id && map.locations[b]) out.push(map.locations[b]);
        else if (b === id && map.locations[a]) out.push(map.locations[a]);
    }
    return out;
}

module.exports = {
    MAX_LOCATIONS,
    normalizeName,
    createEmptyMap,
    mergeMap,
    findByName,
    visit,
    describeCurrent,
    neighborsOf
};
