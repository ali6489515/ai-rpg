"use strict";

/*
 * انتخاب‌های هدفمند برای پیشبرد کوئست
 *
 * مشکل قبلی: انتخاب‌ها فقط بر اساس «شماره‌ی مرحله» ثابت بودند و به مکان فعلی بازیکن
 * توجه نمی‌کردند. مثلاً بازیکن در دهکده بود ولی گزینه «خاکستر رو بررسی می‌کنم» می‌آمد؛
 * چون سرنخ فقط در مکان درست و با «تحقیق» باز می‌شود، این انتخاب‌ها هیچ‌وقت کوئست را جلو نمی‌بردند.
 *
 * منطق جدید:
 *  - اگر بازیکن در مکان سرنخِ مرحله است → دو اقدام تحقیقی مخصوص همان مکان
 *    (حاوی کلمات تحقیق تا گیت سرنخ باز شود).
 *  - اگر نیست → قدم بعدی کوتاه‌ترین مسیر روی نقشه به سمت مکان سرنخ.
 */

const world = require("./world");

const TRAVEL_VERBS = [
    "می‌روم", "میروم", "می روم", "میرم", "می‌رم", "برو", "رفتن", "سفر", "حرکت",
    "راهی", "برمی‌گردم", "برمیگردم", "برگرد", "عازم", "رهسپار", "راه می‌افتم", "راه میفتم"
];

function key(v) {
    return world.locationKey(v);
}

/* مکان اصلی جهان که بازیکن در آن (یا در زیرمکانی از آن) است */
function effectiveWorldLocation(memory) {
    const loc = world.getLocation(memory && memory.location);
    if (loc) return loc.name;
    const last = world.getLocation(memory && memory.lastWorldLocation);
    if (last) return last.name;
    return world.WORLD_LOCATIONS[0].name;
}

/* کوتاه‌ترین مسیر (BFS) روی مسیرهای ثابت جهان */
function findPath(from, to) {
    if (!from || !to) return null;
    if (from === to) return [from];
    const prev = new Map([[from, null]]);
    const queue = [from];
    while (queue.length) {
        const cur = queue.shift();
        for (const n of world.neighbors(cur)) {
            if (prev.has(n)) continue;
            prev.set(n, cur);
            if (n === to) {
                const path = [to];
                let p = cur;
                while (p) { path.unshift(p); p = prev.get(p); }
                return path;
            }
            queue.push(n);
        }
    }
    return null;
}

function getActiveStoryQuest(memory) {
    return (memory && Array.isArray(memory.quests))
        ? memory.quests.find(q => q && q.storyQuest && !q.completed) || null
        : null;
}

function travelChoice(next, target) {
    return next === target
        ? `به ${target} می‌روم تا سرنخ را پیدا کنم`
        : `به سمت ${next} می‌روم (در راه ${target})`;
}

/**
 * دو انتخاب که هر دو به تکمیل کوئست اصلی کمک می‌کنند.
 * خروجی: { choices: [a, b], target, atTarget } یا null اگر کوئست اصلی فعال نیست.
 */
function buildQuestChoices(memory) {
    const quest = getActiveStoryQuest(memory);
    if (!quest) return null;

    const stage = Math.min(Math.max(Number(quest.stage) || 1, 1), world.STAGE_CLUES.length);
    const clue = world.STAGE_CLUES[stage - 1];
    if (!clue) return null;

    const here = effectiveWorldLocation(memory);
    const inSubLocation = !world.getLocation(memory.location);

    // ۱) بازیکن در مکان سرنخ است → تحقیق
    if (clue.locations.includes(here)) {
        const actions = (world.LOCATION_ACTIONS[here] || world.STAGE_CHOICES[stage] || []).slice(0, 2);
        if (actions.length >= 2) {
            return { choices: actions, target: here, atTarget: true, stage };
        }
    }

    // ۲) بازیکن جای دیگری است → قدم بعدی مسیر
    const routes = clue.locations
        .map(target => ({ target, path: findPath(here, target) }))
        .filter(r => r.path && r.path.length >= 2)
        .sort((a, b) => a.path.length - b.path.length);

    if (!routes.length) {
        const fallback = world.STAGE_CHOICES[stage] || [];
        return fallback.length >= 2 ? { choices: fallback.slice(0, 2), target: null, atTarget: false, stage } : null;
    }

    const best = routes[0];
    const choices = [];

    if (inSubLocation) {
        // اول باید از زیرمکان به مکان اصلی برگشت
        choices.push(`به ${here} برمی‌گردم و راهی ${best.target} می‌شوم`);
    } else {
        choices.push(travelChoice(best.path[1], best.target));
    }

    // گزینه‌ی دوم: مسیر/مقصد جایگزین که آن هم به سرنخ می‌رسد
    let second = null;
    if (!inSubLocation) {
        // فقط مسیر جایگزینِ هم‌اندازه (تا گزینه‌ی دوم بازیکن را عقب نبرد و رفت‌وبرگشت نشود)
        const alt = routes.find(r => r.path[1] !== best.path[1] && r.path.length === best.path.length);
        if (alt) {
            second = travelChoice(alt.path[1], alt.target);
        } else {
            // مسیر جایگزین هم‌طول از همسایه‌ی دیگر
            const dist = best.path.length - 1;
            for (const n of world.neighbors(here)) {
                if (n === best.path[1]) continue;
                for (const t of clue.locations) {
                    const p = findPath(n, t);
                    if (p && p.length - 1 === dist - 1) {
                        second = travelChoice(n, t);
                        break;
                    }
                }
                if (second) break;
            }
        }
    }
    if (!second) {
        // فقط یک مسیر کوتاه هست: گزینه‌ی دوم هم همان قدم را برمی‌دارد ولی با رویکرد دیگر،
        // تا هر دو انتخاب واقعاً بازیکن را به سرنخ نزدیک کنند (نه درجا زدن).
        second = inSubLocation
            ? `از اینجا بیرون می‌روم و به ${here} برمی‌گردم`
            : (best.path[1] === best.target
                ? `بی‌درنگ راهی ${best.target} می‌شوم و آماده‌ی جست‌وجو می‌شوم`
                : `راهی ${best.path[1]} می‌شوم و سراغ راه ${best.target} را می‌گیرم`);
    }
    choices.push(second);

    return { choices, target: best.target, atTarget: false, stage };
}

function formatChoices(choices) {
    if (!Array.isArray(choices) || choices.length < 2) return "";
    return `🎯 انتخاب‌های پیش رو:\n۱) ${choices[0]}\n۲) ${choices[1]}\nیا کار دیگری انجام بده.`;
}

/* اگر پیام بازیکن «۱» / «2» / «گزینه ۱» بود، متن همان انتخاب را از آخرین پیام راوی برمی‌گرداند */
function resolveNumericChoice(message, recentMessages) {
    const m = String(message || "").trim()
        .match(/^(?:گزینه(?:‌ی| ی)?\s*|انتخاب\s*)?([1۱2۲])\s*[\)\.\-]?\s*$/);
    if (!m) return null;
    const num = (m[1] === "1" || m[1] === "۱") ? 1 : 2;
    const list = Array.isArray(recentMessages) ? recentMessages : [];
    for (let i = list.length - 1; i >= 0; i--) {
        const msg = list[i];
        if (!msg || msg.role !== "assistant") continue;
        const re = num === 1 ? /^\s*[1۱]\s*[\)\-\.]\s*(.+)$/m : /^\s*[2۲]\s*[\)\-\.]\s*(.+)$/m;
        const hit = String(msg.content || "").match(re);
        return hit ? hit[1].trim() : null;
    }
    return null;
}

/* آیا بازیکن قصد سفر به یکی از مکان‌های اصلیِ مجاور دارد؟ نام مقصد یا null */
function detectTravelTarget(memory, message) {
    const text = String(message || "");
    if (!TRAVEL_VERBS.some(v => text.includes(v))) return null;
    const here = effectiveWorldLocation(memory);
    const inSub = !world.getLocation(memory.location);
    const msgKey = key(text);

    // بازگشت از زیرمکان به مکان اصلی
    if (inSub && msgKey.includes(key(here))) return here;

    const candidates = world.neighbors(here)
        .filter(n => msgKey.includes(key(n)))
        .sort((a, b) => key(b).length - key(a).length);
    if (!candidates.length) return null;
    // اگر چند مقصد آمد، اولین موردی که در متن جلوتر آمده
    candidates.sort((a, b) => msgKey.indexOf(key(a)) - msgKey.indexOf(key(b)));
    return candidates[0];
}

module.exports = {
    effectiveWorldLocation,
    findPath,
    buildQuestChoices,
    formatChoices,
    resolveNumericChoice,
    detectTravelTarget,
    getActiveStoryQuest
};
