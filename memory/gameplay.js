"use strict";

/*
 * منطق گیم‌پلی: برخوردها (مبارزه‌ی معمولی، مینی‌باس، باس)، پاداش، اقتصاد.
 * توابع این فایل بدون وابستگی به session هستند و فقط با آبجکت memory کار می‌کنند؛
 * تغییر state توسط server.js / gameMemory.js انجام می‌شود.
 */

const content = require("./content");
const questChoices = require("./questChoices");

const { LOC } = content;

/* =========================
   وضعیت پیشرفت (progress)
========================= */

function defaultProgress() {
    return {
        defeatedBosses: {},      // { bossId: turn }
        turnsAt: {},             // { نام مکان: تعداد نوبت اقدام }
        lastCombatTurn: -99,
        stats: { kills: 0, goldSpent: 0, goldEarned: 0, deaths: 0 }
    };
}

function normalizeProgress(value) {
    const d = defaultProgress();
    const v = value && typeof value === "object" ? value : {};
    return {
        defeatedBosses: v.defeatedBosses && typeof v.defeatedBosses === "object" && !Array.isArray(v.defeatedBosses)
            ? { ...v.defeatedBosses } : d.defeatedBosses,
        turnsAt: v.turnsAt && typeof v.turnsAt === "object" && !Array.isArray(v.turnsAt)
            ? { ...v.turnsAt } : d.turnsAt,
        lastCombatTurn: Number.isFinite(Number(v.lastCombatTurn)) ? Number(v.lastCombatTurn) : d.lastCombatTurn,
        stats: { ...d.stats, ...(v.stats && typeof v.stats === "object" ? v.stats : {}) }
    };
}

function progressOf(memory) {
    return normalizeProgress(memory && memory.progress);
}

function currentLocation(memory) {
    return questChoices.effectiveWorldLocation(memory);
}

/* =========================
   NPCها و اطلاعات منطقه برای پرامپت
========================= */

function npcsAt(locationName) {
    return content.NPCS.filter(n => n.location === locationName);
}

function miniBossAt(locationName) {
    return content.MINI_BOSSES.find(b => b.location === locationName) || null;
}

function bossAt(locationName) {
    return content.BOSSES.find(b => b.location === locationName) || null;
}

function storyQuestOf(memory) {
    return (memory && Array.isArray(memory.quests))
        ? memory.quests.find(q => q && q.storyQuest) || null
        : null;
}

function hasClue(memory, clueId) {
    const clues = (memory && memory.storyBible && memory.storyBible.clues) || [];
    return clues.some(c => c && c.id === clueId);
}

function bossAvailable(memory, boss) {
    if (!boss) return false;
    if (boss.requires === "clue5") return hasClue(memory, "main_clue_5");
    if (boss.requires === "final") {
        const q = storyQuestOf(memory);
        return Boolean(q && q.finalBossPending && !q.completed);
    }
    return true;
}

/* خطوط پرامپت AI درباره‌ی NPCهای ثابت و خطرهای منطقه */
function promptLines(memory) {
    const loc = currentLocation(memory);
    const progress = progressOf(memory);
    const lines = [];

    const npcs = npcsAt(loc);
    if (npcs.length) {
        const text = npcs.map(n =>
            `«${n.name}» (${n.role}؛ ${n.personality}) حقایق قطعی: ${n.facts.join(" / ")}`
        ).join(" ;; ");
        lines.push(`NPCهای ثابت این مکان (فقط همین حقایق را بگو؛ چیزی خارج از آن‌ها از زبانشان نساز و اگر چیزی را نمی‌دانند بگویند نمی‌دانند): ${text}`);
    }

    if (!content.SAFE_LOCATIONS.includes(loc)) {
        const enemies = (content.ENEMIES[loc] || []).map(e => e.name).join("، ");
        if (enemies) lines.push(`موجودات این منطقه (برای روایت خطر؛ مبارزه را سرور شروع می‌کند): ${enemies}`);
    }

    const mini = miniBossAt(loc);
    if (mini && !progress.defeatedBosses[mini.id]) {
        lines.push(`در این منطقه حریفی قدرتمند به نام «${mini.name}» پرسه می‌زند (${mini.desc}). او را خودت وارد صحنه نکن؛ فقط در صورت لزوم به شایعه یا ردپایش اشاره کن.`);
    }
    const boss = bossAt(loc);
    if (boss && bossAvailable(memory, boss) && !progress.defeatedBosses[boss.id]) {
        lines.push(`باس این منطقه: «${boss.name}». سرور خودش او را وارد مبارزه می‌کند؛ تو او را شکست‌خورده روایت نکن.`);
    }
    return lines;
}

/* =========================
   ساخت دشمن
========================= */

function scaledLevel(base, playerLevel) {
    const pl = Math.max(1, Math.floor(Number(playerLevel) || 1));
    return Math.max(base, Math.min(pl, base + 2));
}

function buildEnemy(template, { level, type, id = null, extra = {} }) {
    const hp = Math.max(1, Math.round((30 + 25 * level) * (template.hp || 1)));
    return {
        id,
        name: template.name,
        type,
        level,
        hp,
        maxHp: hp,
        attack: Math.max(1, Math.round((9 + 3.5 * level) * (template.atk || 1))),
        defense: Math.max(0, Math.round((2 + level) * (template.def || 1))),
        description: template.desc || "",
        ...extra
    };
}

function normalEnemyFor(memory, rng = Math.random) {
    const loc = currentLocation(memory);
    const pool = content.ENEMIES[loc];
    if (!pool || !pool.length) return null;
    const template = pool[Math.floor(rng() * pool.length)];
    const base = content.REGION_LEVEL[loc] || 1;
    return buildEnemy(template, {
        level: scaledLevel(base, memory.player && memory.player.level),
        type: "normal"
    });
}

function specialEnemy(memory, def, type) {
    return buildEnemy(def, {
        level: scaledLevel(def.minLevel, memory.player && memory.player.level),
        type,
        id: def.id,
        extra: {
            enrageBelow: def.enrageBelow || 0,
            enrageMult: def.enrageMult || 1,
            loot: def.loot || null,
            extraGold: def.extraGold || 0,
            finalBoss: Boolean(def.finalBoss)
        }
    });
}

/* =========================
   برخورد: چه موقع و با چه کسی مبارزه شروع شود
========================= */

const NORMAL_ENCOUNTER_CHANCE = 0.3;
const MINI_BOSS_CHANCE = 0.45;
const MINI_BOSS_MIN_TURNS = 3;
const ENCOUNTER_COOLDOWN_TURNS = 2;

/**
 * خروجی: { enemy, intro } یا null.
 * قبل از صدا زدن، bumpTurnsAt برای نوبت‌های غیر سفر انجام شده باشد.
 */
function rollEncounter(memory, { traveling = false, rng = Math.random } = {}) {
    if (!memory || !memory.player) return null;
    const loc = currentLocation(memory);
    const progress = progressOf(memory);
    const turn = Number(memory.turn) || 0;

    // ۱) باس: وقتی شرطش برقرار است و هنوز شکست نخورده، در اولین اقدام بازیکن در لانه‌اش ظاهر می‌شود
    const boss = bossAt(loc);
    if (boss && !traveling && !progress.defeatedBosses[boss.id] && bossAvailable(memory, boss)) {
        return {
            enemy: specialEnemy(memory, boss, "boss"),
            intro: `👑 باس! ${boss.intro}`
        };
    }

    // ۲) مکان امن مبارزه‌ی تصادفی ندارد
    if (content.SAFE_LOCATIONS.includes(loc)) return null;

    // ۳) بعد از هر مبارزه چند نوبت آرامش
    if (turn - progress.lastCombatTurn < ENCOUNTER_COOLDOWN_TURNS) return null;

    // ۴) مینی‌باس: بعد از چند نوبت حضور در منطقه
    const mini = miniBossAt(loc);
    if (
        mini &&
        !traveling &&
        !progress.defeatedBosses[mini.id] &&
        (progress.turnsAt[loc] || 0) >= MINI_BOSS_MIN_TURNS &&
        rng() < MINI_BOSS_CHANCE
    ) {
        return {
            enemy: specialEnemy(memory, mini, "mini_boss"),
            intro: `⚠️ حریف قدرتمند! ${mini.intro}`
        };
    }

    // ۵) مبارزه‌ی معمولی
    if (rng() < NORMAL_ENCOUNTER_CHANCE) {
        const enemy = normalEnemyFor(memory, rng);
        if (enemy) {
            return {
                enemy,
                intro: `⚔️ «${enemy.name}» جلوی راهت سبز می‌شود! ${enemy.description}`
            };
        }
    }
    return null;
}

/* =========================
   پاداش مبارزه
========================= */

function computeRewards(enemy, rng = Math.random) {
    const L = Math.max(1, Number(enemy.level) || 1);
    const baseGold = 6 + 5 * L;
    const variance = 0.8 + rng() * 0.4;
    let xpMult = 1;
    let goldMult = 1;
    if (enemy.type === "mini_boss") { xpMult = 3; goldMult = 4; }
    if (enemy.type === "boss") { xpMult = 6; goldMult = 6; }

    return {
        xp: Math.max(10, Math.round(L * 25 * xpMult)),
        gold: Math.max(5, Math.round(baseGold * variance * goldMult)) + (Number(enemy.extraGold) || 0)
    };
}

/* آیا جایزه‌ی تجهیزات از تجهیزات فعلی بهتر است؟ */
function evaluateLoot(loot, equipment) {
    if (!loot) return null;
    if (loot.type === "weapon") {
        const current = Number(equipment?.weapon?.attack) || 0;
        const better = loot.attack > current;
        return { ...loot, better, sellValue: Math.round(loot.attack * 10) };
    }
    if (loot.type === "armor") {
        const current = Number(equipment?.armor?.defense) || 0;
        const better = loot.defense > current;
        return { ...loot, better, sellValue: Math.round(loot.defense * 14) };
    }
    return null;
}

/* =========================
   اقتصاد: استراحت، ارتقا، فروشگاه، عوارض، شکست
========================= */

function restOption(memory) {
    const loc = currentLocation(memory);
    const level = memory.player && memory.player.level;
    if (content.INN_LOCATIONS.includes(loc)) {
        return { kind: "inn", cost: content.innCost(level), fraction: 1, label: "مسافرخانه" };
    }
    return { kind: "camp", cost: content.campCost(level), fraction: 0.5, label: "اردوی موقت" };
}

function upgradeInfo(memory, slot) {
    const eq = (memory.equipment && memory.equipment[slot]) || {};
    const tier = Number(eq.tier) || 0;
    const U = content.UPGRADE;
    const atMax = tier >= U.maxTier;
    const stat = slot === "weapon" ? "attack" : "defense";
    const bonus = slot === "weapon" ? U.weaponAttackPerTier : U.armorDefensePerTier;
    return {
        slot,
        name: eq.name || "—",
        tier,
        maxTier: U.maxTier,
        atMax,
        cost: atMax ? null : U.costs[tier],
        bonus,
        stat
    };
}

function tollFor(locationName) {
    return content.TOLLS[locationName] || 0;
}

function shopView(memory) {
    const loc = currentLocation(memory);
    const shop = content.SHOPS[loc];
    if (!shop) return null;
    const level = Number(memory.player && memory.player.level) || 1;
    const gold = Number(memory.player && memory.player.gold) || 0;
    return {
        id: shop.id,
        title: shop.title,
        items: shop.stock.map(key => {
            const it = content.ITEMS[key];
            return {
                key,
                name: it.name,
                icon: it.icon,
                price: it.price,
                type: it.type,
                effect: it.effect || null,
                attack: it.attack || null,
                defense: it.defense || null,
                minLevel: it.minLevel || 1,
                locked: level < (it.minLevel || 1),
                affordable: gold >= it.price
            };
        })
    };
}

/* اطلاعات کامل مکان فعلی برای رابط کاربری */
function locationInfo(memory) {
    const loc = currentLocation(memory);
    const progress = progressOf(memory);
    const mini = miniBossAt(loc);
    const boss = bossAt(loc);
    const canUpgrade = loc === content.UPGRADE.location;

    return {
        location: loc,
        safe: content.SAFE_LOCATIONS.includes(loc),
        npcs: npcsAt(loc).map(n => ({
            id: n.id,
            name: n.name,
            role: n.role,
            services: n.services
        })),
        shop: shopView(memory),
        rest: restOption(memory),
        upgrades: canUpgrade
            ? { weapon: upgradeInfo(memory, "weapon"), armor: upgradeInfo(memory, "armor") }
            : null,
        danger: {
            miniBoss: mini ? { name: mini.name, defeated: Boolean(progress.defeatedBosses[mini.id]) } : null,
            boss: boss && bossAvailable(memory, boss)
                ? { name: boss.name, defeated: Boolean(progress.defeatedBosses[boss.id]) }
                : null
        },
        toll: tollFor(loc)
    };
}

/* جریمه‌ی شکست: بخشی از طلا از دست می‌رود، با جان کم به دهکده برمی‌گردی */
function defeatPenalty(player) {
    const gold = Math.max(0, Number(player.gold) || 0);
    const lost = Math.floor(gold * content.DEFEAT_GOLD_LOSS);
    const maxHp = Math.max(1, Number(player.maxHp) || 1);
    const maxMana = Math.max(0, Number(player.maxMana) || 0);
    return {
        lostGold: lost,
        gold: gold - lost,
        hp: Math.max(1, Math.ceil(maxHp * content.DEFEAT_HP_FRACTION)),
        mana: Math.floor(maxMana * 0.5),
        respawn: content.LOC.village
    };
}

module.exports = {
    defaultProgress,
    normalizeProgress,
    progressOf,
    currentLocation,
    npcsAt,
    miniBossAt,
    bossAt,
    hasClue,
    bossAvailable,
    promptLines,
    buildEnemy,
    rollEncounter,
    computeRewards,
    evaluateLoot,
    restOption,
    upgradeInfo,
    tollFor,
    shopView,
    locationInfo,
    defeatPenalty,
    NORMAL_ENCOUNTER_CHANCE,
    MINI_BOSS_CHANCE,
    MINI_BOSS_MIN_TURNS,
    LOC
};
