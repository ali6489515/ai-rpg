const fs = require("fs");
const path = require("path");
const { AsyncLocalStorage } = require("async_hooks");
const worldMap = require("./worldMap");
const world = require("./world");

let MongoClient = null;
try {
    MongoClient = require("mongodb").MongoClient;
} catch {
    MongoClient = null;
}

const sessionStorage = new AsyncLocalStorage();

function runWithSession(sessionId, fn) {
    return sessionStorage.run(sessionId, fn);
}

function currentSessionId() {
    const id = sessionStorage.getStore();
    if (
        !id ||
        typeof id !== "string" ||
        !/^[a-zA-Z0-9_-]{8,64}$/.test(id)
    ) {
        throw new Error("شناسه جلسه نامعتبر است.");
    }
    return id;
}

const memoryFolder = __dirname;
const SESSIONS_DIR = path.join(memoryFolder, "sessions");
const sessionCache = new Map();

let mongoDb = null;
let mongoReady = null;

function ensureSessionsDir() {
    if (!fs.existsSync(SESSIONS_DIR)) {
        fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    }
}

function getSessionDir(sessionId) {
    ensureSessionsDir();
    const dir = path.join(SESSIONS_DIR, sessionId);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
}

function getFilePaths(sessionId) {
    const dir = getSessionDir(sessionId);
    return {
        gameFile: path.join(dir, "game.json"),
        permanentFile: path.join(dir, "permanentMemory.json")
    };
}

async function initMongo() {
    if (mongoReady) {
        return mongoReady;
    }

    mongoReady = (async () => {
        const uri = process.env.MONGODB_URI;
        if (!uri || !MongoClient) {
            console.log("Storage: local files (no MONGODB_URI)");
            return null;
        }

        try {
            const client = new MongoClient(uri, {
                serverSelectionTimeoutMS: 8000
            });
            await client.connect();
            mongoDb = client.db(process.env.MONGODB_DB || "shadow_legends");
            await mongoDb.collection("sessions").createIndex(
                { sessionId: 1 },
                { unique: true }
            );
            console.log("Storage: MongoDB connected");
            return mongoDb;
        } catch (err) {
            console.error("MongoDB failed, using files:", err.message);
            mongoDb = null;
            return null;
        }
    })();

    return mongoReady;
}

function createDefaultMemory() {
    return {
        player: {
            name: null,
            class: null,
            level: 1,
            xp: 0,
            xpNeeded: 100,
            hp: 100,
            maxHp: 100,
            mana: 50,
            maxMana: 50,
            attack: 15,
            defense: 5,
            criticalChance: 10,
            gold: 100
        },
        equipment: {
            weapon: {
                name: "شمشیر زنگ‌زده",
                attack: 0
            },
            armor: {
                name: "لباس مسافر",
                defense: 0
            }
        },
        inventory: [
            {
                name: "معجون درمان",
                type: "potion",
                effect: 40,
                quantity: 3
            },
            {
                name: "معجون مانا",
                type: "mana",
                effect: 30,
                quantity: 2
            }
        ],
        location: "دهکده‌ی آغازین",
        quests: [
            {
                name: world.MAIN_STORY.title,
                description: world.MAIN_STORY.premise,
                objective: world.MAIN_STORY.stages[0],
                deadlineInTurns: null,
                storyQuest: true,
                stage: 1
            }
        ],
        importantEvents: [],
        summary: "",
        summaryAt: null,
        summaryTurn: 0,
        // حافظه‌ی ساختاریافته‌ی داستان؛ متن AI منبع حقیقت نیست.
        storyBible: {
            clues: [],
            decisions: [],
            secrets: [],
            flags: {},
            currentArc: null,
            lastVerifiedTurn: 0
        },
        turn: 0,
        lastEventTurn: -99,
        npcs: [],
        reputation: {},
        map: worldMap.createEmptyMap("دهکده‌ی آغازین", 0),
        combat: {
            active: false,
            enemy: {
                name: null,
                type: null,
                hp: 0,
                maxHp: 0,
                attack: 0,
                defense: 0,
                level: 1,
                xp: 0,
                gold: 0
            },
            turn: null,
            defending: false
        }
    };
}

/* نام‌های انگلیسی معجون در سیوهای قدیمی به فارسی تبدیل و هم‌نام‌ها ادغام می‌شوند */
const POTION_RENAMES = {
    "health potion": "معجون درمان",
    "mana potion": "معجون مانا"
};

function normalizeInventory(list) {
    const out = [];
    const potionNames = new Set(Object.values(POTION_RENAMES));
    for (const item of Array.isArray(list) ? list : []) {
        if (!item || typeof item !== "object") continue;
        const renamed =
            POTION_RENAMES[String(item.name || "").trim().toLowerCase()];
        const next = renamed ? { ...item, name: renamed } : { ...item };
        // معجون‌های هم‌نام (قدیمی انگلیسی + فارسی) در یک ردیف ادغام می‌شوند
        const existing = potionNames.has(next.name)
            ? out.find(i => i.name === next.name)
            : null;
        if (existing) {
            existing.quantity =
                (Number(existing.quantity) || 0) +
                (Number(next.quantity) || 0);
        } else {
            out.push(next);
        }
    }
    return out;
}

function mergePermanent(saved) {
    const merged = mergePermanentRaw(saved);
    try { syncStoryQuest(merged); } catch { /* ignore */ }
    return merged;
}

function mergePermanentRaw(saved) {
    const defaults = createDefaultMemory();
    if (!saved || typeof saved !== "object") {
        return defaults;
    }

    return {
        ...defaults,
        ...saved,
        player: {
            ...defaults.player,
            ...(saved.player || {}),
            xpNeeded: Number(
                saved.player?.xpNeeded ||
                saved.player?.nextXp ||
                defaults.player.xpNeeded
            )
        },
        equipment: {
            ...defaults.equipment,
            ...(saved.equipment || {}),
            weapon: {
                ...defaults.equipment.weapon,
                ...(saved.equipment?.weapon || {})
            },
            armor: {
                ...defaults.equipment.armor,
                ...(saved.equipment?.armor || {})
            }
        },
        inventory: Array.isArray(saved.inventory)
            ? normalizeInventory(saved.inventory)
            : defaults.inventory,
        quests: Array.isArray(saved.quests) ? saved.quests : [],
        importantEvents: Array.isArray(saved.importantEvents)
            ? saved.importantEvents
            : [],
        summary: typeof saved.summary === "string" ? saved.summary : "",
        summaryAt: saved.summaryAt || null,
        summaryTurn: Number(saved.summaryTurn) || 0,
        storyBible: normalizeStoryBible(saved.storyBible),
        turn: Number(saved.turn) || 0,
        lastEventTurn: Number.isFinite(Number(saved.lastEventTurn))
            ? Number(saved.lastEventTurn)
            : -99,
        npcs: Array.isArray(saved.npcs) ? saved.npcs : [],
        map: worldMap.mergeMap(
            saved.map,
            saved.location || defaults.location,
            Number(saved.turn) || 0
        ),
        reputation:
            saved.reputation &&
            typeof saved.reputation === "object" &&
            !Array.isArray(saved.reputation)
                ? saved.reputation
                : {},
        combat: {
            ...defaults.combat,
            ...(saved.combat || {}),
            enemy: {
                ...defaults.combat.enemy,
                ...(saved.combat?.enemy || {})
            }
        }
    };
}

function normalizeStoryBible(value) {
    const source = value && typeof value === "object" ? value : {};
    const list = (items, max, fields) =>
        (Array.isArray(items) ? items : [])
            .filter(x => x && typeof x === "object")
            .slice(-max)
            .map(x => {
                const out = {};
                for (const field of fields) {
                    if (x[field] !== undefined && x[field] !== null) {
                        out[field] = field === "revealed"
                            ? Boolean(x[field])
                            : String(x[field]).slice(0, 500);
                    }
                }
                return out;
            })
            .filter(x => Object.keys(x).length);

    const flags = source.flags && typeof source.flags === "object" &&
        !Array.isArray(source.flags) ? source.flags : {};

    return {
        clues: list(source.clues, 100, ["id", "title", "status", "details"]),
        decisions: list(source.decisions, 60, ["id", "decision", "consequence"]),
        secrets: list(source.secrets, 60, ["id", "title", "details", "revealed"]),
        flags: Object.fromEntries(
            Object.entries(flags).slice(-100).map(([k, v]) => [String(k).slice(0, 80), Boolean(v)])
        ),
        currentArc: source.currentArc ? String(source.currentArc).slice(0, 240) : null,
        lastVerifiedTurn: Number(source.lastVerifiedTurn) || 0
    };
}

/* =========================
   پیشروی کوئست اصلی بر اساس سرنخ‌ها
========================= */

function textKey(value) {
    return world.locationKey(value);
}

const INVESTIGATE_KEYWORDS = [
    "بررسی", "برسی", "بررسی‌", "برسی‌",
    "گردم", "می‌گردم", "گرد", "گردن", "گشت", "می‌گشت", "گشتم",
    "جست", "جستجو", "جستن", "می‌جست",
    "کاوش", "می‌کاوم", "کاو", "کاوم",
    "تحقیق", "تحقیق‌کن", "می‌کنم تحقیق",
    "پرس", "پرسم", "می‌پرسم", "سوال", "سؤال", "می‌پرس",
    "بخوان", "می‌خوانم", "خواندن", "خوندن",
    "نگاه", "می‌نگرم", "نگرم",
    "لمس", "می‌لمسم",
    "ردپا", "رد پا", "دنبال", "دنبال کردن",
    "معاینه", "زیر و رو", "تفتیش", "فحص"
];

function isInvestigating(message) {
    if (!message) return false;
    const text = String(message).toLowerCase();
    return INVESTIGATE_KEYWORDS.some(kw => text.includes(kw.toLowerCase()));
}

const INVESTIGATE_RE = null; // استفاده‌ نشدنی; isInvestigating رو استفاده کن

function getStoryQuest(memory) {
    return (memory && Array.isArray(memory.quests))
        ? memory.quests.find(q => q && q.storyQuest)
        : null;
}

/**
 * سرور (نه AI) تصمیم می‌گیرد سرنخ کلیدی این نوبت قابل آشکار شدن هست یا نه.
 * شرط‌ها: بازیکن در یکی از مکان‌های مرحله باشد، واقعاً تحقیق کند،
 * و به حداقل تعداد نوبتِ تحقیق آن مرحله رسیده باشد.
 */
function getClueGate(memory, message) {
    const quest = getStoryQuest(memory);
    if (!quest || quest.completed) return null;
    const stage = Math.min(Math.max(Number(quest.stage) || 1, 1), world.STAGE_CLUES.length);
    const clue = world.STAGE_CLUES[stage - 1];
    if (!clue) return null;

    const here = textKey(memory.location);
    const atLocation = clue.locations.some(l => textKey(l) === here);
    const investigating = isInvestigating(message);
    const progress = Number(quest.stageProgress) || 0;
    const revealable = atLocation && investigating && progress + 1 >= clue.minTurns;

    return { stage, clue, atLocation, investigating, progress, revealable };
}

/** شیء memory را بدون جلو بردن، با مرحله‌ی ذخیره‌شده هماهنگ می‌کند (برای سیوهای قدیمی) */
function syncStoryQuest(memory) {
    const quest = getStoryQuest(memory);
    if (!quest) return null;
    const stages = world.MAIN_STORY.stages;
    const stage = Math.min(Math.max(Number(quest.stage) || 1, 1), stages.length);
    quest.stage = stage;
    quest.objective = stages[stage - 1];
    quest.stageProgress = Number(quest.stageProgress) || 0;
    return null;
}

/**
 * بعد از جواب AI صدا زده می‌شود. حداکثر یک مرحله در هر نوبت جلو می‌رود و فقط اگر
 * گیت باز بوده و AI واقعاً سرنخ را آشکار کرده باشد (id درست یا حقیقت کلیدی در روایت).
 */
function progressStoryQuest(gate, { clueIds = [], narration = "" } = {}) {
    if (!gate) return null;
    const memory = loadPermanentMemory();
    const quest = getStoryQuest(memory);
    if (!quest || quest.completed || Number(quest.stage) !== gate.stage) return null;

    if (gate.atLocation && gate.investigating) {
        quest.stageProgress = (Number(quest.stageProgress) || 0) + 1;
    }

    let result = null;
    const text = textKey(narration);
    const revealed =
        clueIds.includes(gate.clue.id) ||
        gate.clue.keywords.some(k => text.includes(textKey(k)));

    if (gate.revealable && revealed) {
        memory.storyBible = normalizeStoryBible(memory.storyBible);
        if (!memory.storyBible.clues.some(c => c.id === gate.clue.id)) {
            memory.storyBible.clues.push({
                id: gate.clue.id,
                title: gate.clue.title,
                status: "کشف‌شده",
                details: gate.clue.truth
            });
        }

        const stages = world.MAIN_STORY.stages;
        if (gate.stage >= stages.length) {
            quest.completed = true;
        } else {
            quest.stage = gate.stage + 1;
            quest.objective = stages[quest.stage - 1];
            quest.stageProgress = 0;
            quest.stageStartTurn = Number(memory.turn) || 0;
        }

        result = {
            from: gate.stage,
            to: quest.stage,
            objective: quest.objective,
            completed: Boolean(quest.completed),
            clueTitle: gate.clue.title
        };

        memory.importantEvents.push(
            result.completed
                ? `خط اصلی کامل شد: ${gate.clue.title}`
                : `سرنخ کلیدی پیدا شد: ${gate.clue.title} — ${gate.clue.truth}`
        );
        if (memory.importantEvents.length > 50) {
            memory.importantEvents.splice(0, memory.importantEvents.length - 50);
        }
    }

    savePermanentMemory(memory);
    return result;
}

function updateStoryBible(patch, turn = 0) {
    const memory = loadPermanentMemory();
    const current = normalizeStoryBible(memory.storyBible);
    const incoming = patch && typeof patch === "object" ? patch : {};
    const mergeById = (oldItems, newItems) => {
        const map = new Map(oldItems.filter(x => x.id).map(x => [x.id, x]));
        for (const item of Array.isArray(newItems) ? newItems.slice(0, 20) : []) {
            if (!item || typeof item !== "object") continue;
            const id = String(item.id || "").trim().slice(0, 80);
            if (!id) continue;
            map.set(id, { ...(map.get(id) || {}), ...item, id });
        }
        return Array.from(map.values()).slice(-100);
    };
    // سرنخ‌های خط اصلی (main_clue_*) فقط توسط سرور ثبت می‌شوند
    const aiClues = (Array.isArray(incoming.clues) ? incoming.clues : [])
        .filter(c => c && !/^main_clue_/i.test(String(c.id || "")));
    current.clues = mergeById(current.clues, aiClues);
    current.decisions = mergeById(current.decisions, incoming.decisions);
    current.secrets = mergeById(current.secrets, incoming.secrets);
    if (incoming.flags && typeof incoming.flags === "object" && !Array.isArray(incoming.flags)) {
        for (const [key, value] of Object.entries(incoming.flags).slice(0, 30)) {
            current.flags[String(key).slice(0, 80)] = Boolean(value);
        }
    }
    if (incoming.currentArc) current.currentArc = String(incoming.currentArc).slice(0, 240);
    current.lastVerifiedTurn = Number(turn) || current.lastVerifiedTurn;
    memory.storyBible = normalizeStoryBible(current);
    savePermanentMemory(memory);
    return memory.storyBible;
}

function emptyCacheEntry() {
    return {
        permanent: createDefaultMemory(),
        story: []
    };
}

async function hydrateSession(sessionId) {
    // درخواست واقعی = session دوباره زنده است
    deletedSessions.delete(sessionId);

    if (sessionCache.has(sessionId)) {
        return sessionCache.get(sessionId);
    }

    await initMongo();

    if (mongoDb) {
        try {
            const doc = await mongoDb.collection("sessions").findOne({
                sessionId
            });
            if (doc) {
                const entry = {
                    permanent: mergePermanent(doc.permanent),
                    story: Array.isArray(doc.story) ? doc.story : []
                };
                sessionCache.set(sessionId, entry);
                return entry;
            }
        } catch (err) {
            console.error("MongoDB read:", err.message);
        }
    }

    try {
        const { gameFile, permanentFile } = getFilePaths(sessionId);
        let permanent = createDefaultMemory();
        let story = [];

        if (fs.existsSync(permanentFile)) {
            const raw = fs.readFileSync(permanentFile, "utf8");
            if (raw.trim()) {
                permanent = mergePermanent(JSON.parse(raw));
            }
        } else {
            fs.writeFileSync(
                permanentFile,
                JSON.stringify(permanent, null, 2)
            );
        }

        if (fs.existsSync(gameFile)) {
            const raw = fs.readFileSync(gameFile, "utf8");
            if (raw.trim()) {
                const parsed = JSON.parse(raw);
                story = Array.isArray(parsed) ? parsed : [];
            }
        } else {
            fs.writeFileSync(gameFile, JSON.stringify([], null, 2));
        }

        const entry = { permanent, story };
        sessionCache.set(sessionId, entry);
        return entry;
    } catch (err) {
        console.error("File session read:", err.message);
        const entry = emptyCacheEntry();
        sessionCache.set(sessionId, entry);
        return entry;
    }
}

async function persistSession(sessionId) {
    if (deletedSessions.has(sessionId)) {
        return;
    }
    const entry = sessionCache.get(sessionId);
    if (!entry) {
        return;
    }

    await initMongo();

    if (mongoDb) {
        try {
            await mongoDb.collection("sessions").updateOne(
                { sessionId },
                {
                    $set: {
                        sessionId,
                        permanent: entry.permanent,
                        story: entry.story,
                        updatedAt: new Date()
                    }
                },
                { upsert: true }
            );
            return;
        } catch (err) {
            console.error("MongoDB write:", err.message);
        }
    }

    try {
        const { gameFile, permanentFile } = getFilePaths(sessionId);
        fs.writeFileSync(
            permanentFile,
            JSON.stringify(entry.permanent, null, 2)
        );
        fs.writeFileSync(
            gameFile,
            JSON.stringify(entry.story, null, 2)
        );
    } catch (err) {
        console.error("File session write:", err.message);
    }
}

function getEntry() {
    const sessionId = currentSessionId();
    if (!sessionCache.has(sessionId)) {
        sessionCache.set(sessionId, emptyCacheEntry());
    }
    return sessionCache.get(sessionId);
}

/*
 * نوشتن‌ها برای هر session پشت‌سر‌هم انجام می‌شود (ترتیب حفظ می‌شود)،
 * تا وقتی session پاک می‌شود هیچ نوشتن دیرهنگامی آن را دوباره نسازد.
 */
const persistQueue = new Map();
const deletedSessions = new Set();

function queuePersist(sessionId) {
    const previous = persistQueue.get(sessionId) || Promise.resolve();
    const next = previous
        .then(() => persistSession(sessionId))
        .catch(() => {});
    persistQueue.set(sessionId, next);
    next.then(() => {
        if (persistQueue.get(sessionId) === next) {
            persistQueue.delete(sessionId);
        }
    });
    return next;
}

function schedulePersist() {
    const sessionId = currentSessionId();
    queuePersist(sessionId);
}

/**
 * حذف کامل داده‌ی یک session: رم، MongoDB و فایل‌ها.
 * اگر حذف از دیتابیس شکست بخورد خطا پرتاب می‌شود (تا بازیکن بداند).
 */
async function deleteSession(sessionId) {
    if (
        !sessionId ||
        typeof sessionId !== "string" ||
        !/^[a-zA-Z0-9_-]{8,64}$/.test(sessionId)
    ) {
        throw new Error("شناسه جلسه نامعتبر است.");
    }

    // از این لحظه هیچ نوشتن جدیدی برای این session انجام نمی‌شود
    deletedSessions.add(sessionId);
    if (deletedSessions.size > 500) {
        deletedSessions.delete(deletedSessions.values().next().value);
    }

    // منتظر نوشتن‌های در حال اجرا می‌مانیم تا بعد از حذف ظاهر نشوند
    await (persistQueue.get(sessionId) || Promise.resolve());

    sessionCache.delete(sessionId);

    await initMongo();

    if (mongoDb) {
        await mongoDb.collection("sessions").deleteOne({ sessionId });
    }

    try {
        const dir = path.join(SESSIONS_DIR, sessionId);
        if (
            path.dirname(dir) === SESSIONS_DIR &&
            fs.existsSync(dir)
        ) {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    } catch (err) {
        console.error("File session delete:", err.message);
    }

    return true;
}

function loadMemory() {
    return getEntry().story;
}

function saveMemory(memory) {
    const entry = getEntry();
    entry.story = Array.isArray(memory) ? memory : [];
    schedulePersist();
}

function addMessage(role, content) {
    const memory = loadMemory();
    memory.push({
        role,
        content,
        time: new Date().toISOString()
    });
    if (memory.length > 120) {
        memory.splice(0, memory.length - 120);
    }
    saveMemory(memory);
}

function getMemory() {
    return loadMemory();
}

function clearMemory() {
    saveMemory([]);
}

function loadPermanentMemory() {
    return getEntry().permanent;
}

function savePermanentMemory(memory) {
    const entry = getEntry();
    entry.permanent = memory;
    schedulePersist();
}

function updatePlayer(updates) {
    const memory = loadPermanentMemory();
    memory.player = { ...memory.player, ...updates };
    savePermanentMemory(memory);
    return memory.player;
}

function addItem(item) {
    const memory = loadPermanentMemory();
    const existing = memory.inventory.find(x => x.name === item.name);
    if (existing && item.quantity) {
        existing.quantity += item.quantity;
    } else {
        memory.inventory.push({
            ...item,
            quantity: Math.max(1, Number(item.quantity) || 1)
        });
    }
    savePermanentMemory(memory);
    return memory.inventory;
}

function removeItem(itemName, quantity) {
    const memory = loadPermanentMemory();
    const index = memory.inventory.findIndex(item => item.name === itemName);
    if (index === -1) {
        return memory.inventory;
    }
    const item = memory.inventory[index];
    const amount = Math.max(1, Number(quantity) || 1);
    if (item.quantity && item.quantity > amount) {
        item.quantity -= amount;
    } else {
        memory.inventory.splice(index, 1);
    }
    savePermanentMemory(memory);
    return memory.inventory;
}

function equipWeapon(name, attack) {
    const memory = loadPermanentMemory();
    memory.equipment.weapon = { name, attack: Number(attack) || 0 };
    savePermanentMemory(memory);
    return memory.equipment;
}

function equipArmor(name, defense) {
    const memory = loadPermanentMemory();
    memory.equipment.armor = { name, defense: Number(defense) || 0 };
    savePermanentMemory(memory);
    return memory.equipment;
}

function setLocation(location, note = "") {
    const memory = loadPermanentMemory();
    memory.location = location;
    memory.map = worldMap.visit(
        worldMap.mergeMap(memory.map, location, memory.turn),
        location,
        Number(memory.turn) || 0,
        note
    );
    // نام ثبت‌شده‌ی مکان (اگر قبلاً با املای دیگری ثبت شده بود همان را نگه می‌داریم)
    const current = memory.map.locations[memory.map.current];
    if (current) {
        memory.location = current.name;
    }

    // پیشروی خط اصلی فقط با سرنخ‌ها انجام می‌شود (syncStoryQuest)، نه با صرفِ رفتن به یک مکان.
    syncStoryQuest(memory);

    savePermanentMemory(memory);
    return memory.location;
}

function describeCurrentLocation(note) {
    const memory = loadPermanentMemory();
    memory.map = worldMap.describeCurrent(
        worldMap.mergeMap(memory.map, memory.location, memory.turn),
        note
    );
    savePermanentMemory(memory);
    return memory.map;
}

function addQuest(quest) {
    const memory = loadPermanentMemory();
    const exists = memory.quests.some(existing => existing.name === quest.name);
    if (!exists) {
        memory.quests.push(quest);
    }
    savePermanentMemory(memory);
    return memory.quests;
}

function removeQuest(name) {
    const memory = loadPermanentMemory();
    memory.quests = memory.quests.filter(quest => quest.name !== name);
    savePermanentMemory(memory);
    return memory.quests;
}

function addImportantEvent(event) {
    const memory = loadPermanentMemory();
    memory.importantEvents.push(event);
    if (memory.importantEvents.length > 50) {
        memory.importantEvents.splice(0, memory.importantEvents.length - 50);
    }
    savePermanentMemory(memory);
    return memory.importantEvents;
}

function advanceTurn() {
    const memory = loadPermanentMemory();
    memory.turn = (Number(memory.turn) || 0) + 1;
    savePermanentMemory(memory);
    return memory.turn;
}

function markRandomEvent(turn) {
    const memory = loadPermanentMemory();
    memory.lastEventTurn = Number(turn) || 0;
    savePermanentMemory(memory);
}

function upsertNpc(npc, turn) {
    const memory = loadPermanentMemory();
    if (!Array.isArray(memory.npcs)) {
        memory.npcs = [];
    }
    const existing = memory.npcs.find(n => n.name === npc.name);
    const patch = {};
    for (const key of ["role", "attitude", "note"]) {
        if (npc[key]) {
            patch[key] = npc[key];
        }
    }
    if (existing) {
        Object.assign(existing, patch);
        existing.location = memory.location;
        existing.lastSeenTurn = turn;
    } else {
        memory.npcs.push({
            name: npc.name,
            ...patch,
            location: memory.location,
            lastSeenTurn: turn
        });
    }
    // حداکثر ۴۰ NPC؛ قدیمی‌ترین‌ها حذف می‌شوند
    if (memory.npcs.length > 40) {
        memory.npcs.sort((a, b) => (b.lastSeenTurn || 0) - (a.lastSeenTurn || 0));
        memory.npcs.length = 40;
    }
    savePermanentMemory(memory);
    return memory.npcs;
}

// تغییر شهرت: هر نوبت حداکثر ±۱۰ و کل مقدار بین -۱۰۰ تا ۱۰۰
function changeReputation(faction, delta) {
    const memory = loadPermanentMemory();
    if (!memory.reputation || typeof memory.reputation !== "object") {
        memory.reputation = {};
    }
    const name = String(faction || "").trim().slice(0, 40);
    const d = Math.max(-10, Math.min(10, Math.round(Number(delta) || 0)));
    if (!name || d === 0) {
        return memory.reputation;
    }
    const current = Number(memory.reputation[name]) || 0;
    memory.reputation[name] = Math.max(-100, Math.min(100, current + d));
    if (Object.keys(memory.reputation).length > 30) {
        const first = Object.keys(memory.reputation)[0];
        if (first !== name) {
            delete memory.reputation[first];
        }
    }
    savePermanentMemory(memory);
    return memory.reputation;
}

function setSummary(text, turn) {
    const memory = loadPermanentMemory();
    memory.summary = String(text || "").slice(0, 1200);
    memory.summaryAt = new Date().toISOString();
    memory.summaryTurn = Number(turn) || 0;
    savePermanentMemory(memory);
}

function getActiveSessionId() {
    return currentSessionId();
}

function createEmptyCombat() {
    return {
        active: false,
        enemy: {
            name: null,
            type: null,
            hp: 0,
            maxHp: 0,
            attack: 0,
            defense: 0,
            level: 1,
            xp: 0,
            gold: 0
        },
        turn: null,
        defending: false,
        combo: { chain: [], name: null }
    };
}

function startCombat(enemy) {
    const memory = loadPermanentMemory();
    memory.combat = {
        active: true,
        enemy: {
            name: enemy.name,
            type: enemy.type || "normal",
            hp: Number(enemy.hp) || 1,
            maxHp: Number(enemy.hp) || 1,
            attack: Number(enemy.attack) || 1,
            defense: Number(enemy.defense) || 0,
            level: Number(enemy.level) || 1,
            xp: Number(enemy.xp) || 0,
            gold: Number(enemy.gold) || 0
        },
        turn: "player",
        defending: false,
        combo: { chain: [], name: null }
    };
    savePermanentMemory(memory);
    return memory.combat;
}

function setCombatCombo(chain, name) {
    const memory = loadPermanentMemory();
    if (!memory.combat) {
        return null;
    }
    memory.combat.combo = {
        chain: Array.isArray(chain) ? chain : [],
        name: name || null
    };
    savePermanentMemory(memory);
    return memory.combat.combo;
}

function resetCombatCombo() {
    return setCombatCombo([], null);
}

function getCombat() {
    return loadPermanentMemory().combat;
}

function updateEnemyHp(damage) {
    const memory = loadPermanentMemory();
    if (!memory.combat || !memory.combat.active || !memory.combat.enemy) {
        return 0;
    }
    const amount = Math.max(0, Number(damage) || 0);
    memory.combat.enemy.hp = Math.max(0, memory.combat.enemy.hp - amount);
    savePermanentMemory(memory);
    return memory.combat.enemy.hp;
}

function damagePlayer(damage) {
    const memory = loadPermanentMemory();
    const amount = Math.max(0, Number(damage) || 0);
    memory.player.hp = Math.max(0, memory.player.hp - amount);
    savePermanentMemory(memory);
    return memory.player.hp;
}

function healPlayer(amount) {
    const memory = loadPermanentMemory();
    const heal = Math.max(0, Number(amount) || 0);
    memory.player.hp = Math.min(memory.player.maxHp, memory.player.hp + heal);
    savePermanentMemory(memory);
    return memory.player.hp;
}

function restoreMana(amount) {
    const memory = loadPermanentMemory();
    const delta = Number(amount) || 0;
    const maxMana = Number(memory.player.maxMana) || 0;
    memory.player.mana = Math.max(
        0,
        Math.min(maxMana, Number(memory.player.mana || 0) + delta)
    );
    savePermanentMemory(memory);
    return memory.player.mana;
}

function setCombatTurn(turn) {
    const memory = loadPermanentMemory();
    memory.combat.turn = turn;
    savePermanentMemory(memory);
    return memory.combat;
}

function setDefending(value) {
    const memory = loadPermanentMemory();
    memory.combat.defending = Boolean(value);
    savePermanentMemory(memory);
    return memory.combat;
}

function endCombat() {
    const memory = loadPermanentMemory();
    memory.combat = createEmptyCombat();
    savePermanentMemory(memory);
    return memory.combat;
}

function resetGame() {
    const memory = createDefaultMemory();
    savePermanentMemory(memory);
    clearMemory();
    return memory;
}

module.exports = {
    runWithSession,
    initMongo,
    hydrateSession,
    persistSession,
    createDefaultMemory,
    loadMemory,
    saveMemory,
    addMessage,
    getMemory,
    clearMemory,
    loadPermanentMemory,
    savePermanentMemory,
    updatePlayer,
    addItem,
    removeItem,
    equipWeapon,
    equipArmor,
    setLocation,
    describeCurrentLocation,
    deleteSession,
    addQuest,
    removeQuest,
    addImportantEvent,
    advanceTurn,
    markRandomEvent,
    upsertNpc,
    changeReputation,
    updateStoryBible,
    progressStoryQuest,
    syncStoryQuest,
    getClueGate,
    setSummary,
    getActiveSessionId,
    createEmptyCombat,
    startCombat,
    getCombat,
    updateEnemyHp,
    damagePlayer,
    healPlayer,
    restoreMana,
    setCombatTurn,
    setDefending,
    setCombatCombo,
    resetCombatCombo,
    endCombat,
    resetGame
};
