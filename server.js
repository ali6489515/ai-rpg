
require("dotenv").config();

const express = require("express");
const OpenAI = require("openai");

const {
    runWithSession,
    initMongo,
    hydrateSession,
    resetGame,
    loadMemory,
    saveMemory,
    addMessage,
    getMemory,

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
    createDefaultMemory,

    addQuest,
    removeQuest,

    addImportantEvent,
    advanceTurn,
    markRandomEvent,
    upsertNpc,
    changeReputation,
    updateStoryBible,
    progressStoryQuest,
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
    endCombat
} = require("./memory/gameMemory");

const engine = require("./memory/storyEngine");

const timing = require("./memory/timingBar");
const world = require("./memory/world");


const app = express();

const PORT = process.env.PORT || 3000;


app.use(express.json());

app.use(express.static(__dirname));


/* =========================
   SESSION MIDDLEWARE
   هر درخواست بازی باید هدر X-Session-Id داشته باشد
========================= */

app.use((req, res, next) => {

    // فایل‌های استاتیک نیازی به session ندارند
    if (
        req.method === "GET" &&
        !req.path.startsWith("/game-state") &&
        !req.path.startsWith("/story-memory") &&
        !req.path.startsWith("/combat-state") &&
        !req.path.startsWith("/skills")
    ) {
        return next();
    }

    // مسیرهای API که session لازم دارند
    const apiPaths = [
        "/create-character",
        "/message",
        "/game-state",
        "/story-memory",
        "/combat-state",
        "/attack",
        "/defend",
        "/skills",
        "/skill",
        "/timing",
        "/potion",
        "/run",
        "/rest",
        "/shop/buy",
        "/reset-game"
    ];

    const needsSession = apiPaths.some(
        p => req.path === p || req.path.startsWith(p + "/")
    );

    if (!needsSession) {
        return next();
    }

    const sessionId =
        req.headers["x-session-id"] ||
        req.body?.sessionId;

    if (
        !sessionId ||
        typeof sessionId !== "string" ||
        !/^[a-zA-Z0-9_-]{8,64}$/.test(sessionId)
    ) {
        return res.status(400).json({
            error:
                "شناسه جلسه نامعتبر است. صفحه را رفرش کنید."
        });
    }

    // اجرای بقیه هندلر داخل context این session + بارگذاری از دیتابیس
    runWithSession(sessionId, async () => {
        try {
            await hydrateSession(sessionId);
            next();
        } catch (err) {
            console.error(err);
            res.status(500).json({
                error: "بارگذاری وضعیت بازی ممکن نشد. لطفاً دوباره تلاش کن."
            });
        }
    });
});





/* =========================
   ROUTEWAY AI
========================= */

const client = new OpenAI({

    apiKey:
        process.env.ROUTEWAY_API_KEY,

    baseURL:
        "https://api.routeway.ai/v1"

});


// مدل از .env خوانده می‌شود (AI_MODEL). پیش‌فرض: DeepSeek V4 Flash رایگان Routeway
const AI_MODEL =
    process.env.AI_MODEL ||
    "gemma-4-26b-a4b-it-meromero:free";


/* =========================
   HELPERS
========================= */

function clamp(value, min, max) {

    return Math.max(
        min,
        Math.min(max, value)
    );
}


function cleanAIResponse(text) {

    if (!text) {
        return "";
    }

    let result =
        String(text).trim();


    // حذف markdown code block
    result =
        result
            .replace(/^```json\s*/i, "")
            .replace(/^```\s*/i, "")
            .replace(/\s*```$/i, "")
            .trim();


    return result;
}


/**
 * بعد از پایان مبارزه، ادامه داستان را از AI می‌گیرد
 * outcome: "victory" | "escape"
 */
async function narrateAfterCombat(outcome, extra = {}) {

    try {

        const memory = loadPermanentMemory();
        const player = memory.player || {};
        const location = memory.location || "ناشناخته";
        const enemyName = extra.enemyName || "دشمن";

        const outcomeText =
            outcome === "escape"
                ? `بازیکن با موفقیت از مبارزه با «${enemyName}» فرار کرد.`
                : `بازیکن در مبارزه «${enemyName}» را شکست داد.` +
                  (extra.rewards
                      ? ` پاداش: ${extra.rewards.xp || 0} تجربه و ${extra.rewards.gold || 0} طلا.`
                      : "");

        const prompt = `
تو راوی یک بازی نقش‌آفرینی فارسی هستی.
مبارزه تمام شده است. فقط ادامه داستان را روایت کن.

${outcomeText}

وضعیت بازیکن:
نام: ${player.name || "قهرمان"}
کلاس: ${player.class || "-"}
مکان: ${location}
سطح: ${player.level || 1}
جان: ${player.hp}/${player.maxHp}

قوانین:
- فقط به فارسی بنویس.
- فضای بعد از مبارزه را توصیف کن و داستان را کمی جلو ببر.
- در متن از چند ایموجی مناسب صحنه استفاده کن (کم و بجا).
- در صورت تمایل یک جمله‌ی کوتاه شک‌آمیز در پرانتز به‌عنوان راوی مخالف اضافه کن.
- در پایان دقیقاً دو انتخاب منطقی بده، سپس بگو می‌تواند کار دیگری هم انجام دهد.
- فرمت پایان:
🎯 انتخاب‌های پیش رو:
۱) ...
۲) ...
یا کار دیگری انجام بده.
- هیچ JSON یا markdown ننویس.
- حداکثر ۸ جمله.
`;

        const completion =
            await client.chat.completions.create({
                model: AI_MODEL,
                messages: [
                    { role: "system", content: prompt },
                    {
                        role: "user",
                        content: "ادامه داستان را بعد از مبارزه بنویس."
                    }
                ],
                temperature: 0.85
            });

        const text = cleanAIResponse(
            completion?.choices?.[0]?.message?.content || ""
        );

        if (text) {
            addMessage("assistant", text);
        }

        return text;

    } catch (err) {
        console.error("narrateAfterCombat:", err.message);
        return "";
    }
}


function parseAIJson(text) {

    const cleaned =
        cleanAIResponse(text);


    try {

        return JSON.parse(cleaned);

    } catch (error) {

        console.log(
            "JSON مستقیم پردازش نشد."
        );


        // تلاش برای پیدا کردن اولین JSON
        const firstBrace =
            cleaned.indexOf("{");

        const lastBrace =
            cleaned.lastIndexOf("}");


        if (
            firstBrace !== -1 &&
            lastBrace !== -1 &&
            lastBrace > firstBrace
        ) {

            const possibleJson =
                cleaned.slice(
                    firstBrace,
                    lastBrace + 1
                );


            try {

                return JSON.parse(
                    possibleJson
                );

            } catch (secondError) {

                return null;
            }
        }


        return null;
    }
}


function isValidNumber(value) {

    return (
        typeof value === "number" &&
        Number.isFinite(value)
    );
}


/* =========================
   MEMORY CHANGES
========================= */

function applyMemoryChanges(memoryChanges, turn = 0) {

    if (!memoryChanges) {
        return;
    }

    if (memoryChanges.storyBible && typeof memoryChanges.storyBible === "object") {
        updateStoryBible(memoryChanges.storyBible, turn);
    }


    /* PLAYER */

    if (
        memoryChanges.player &&
        typeof memoryChanges.player === "object"
    ) {

        const currentPlayer =
            loadPermanentMemory().player || {};

        const patch =
            { ...memoryChanges.player };

        // AI فقط می‌تواند جان و مانا را کم کند؛ بازیابی فقط با استراحت یا معجون است
        for (const key of ["hp", "mana"]) {

            if (!(key in patch)) {
                continue;
            }

            const value =
                Number(patch[key]);

            if (
                !Number.isFinite(value) ||
                value > Number(currentPlayer[key])
            ) {

                delete patch[key];

            } else {

                patch[key] =
                    Math.max(
                        key === "hp" ? 1 : 0,
                        Math.floor(value)
                    );
            }
        }

        updatePlayer(
            patch
        );
    }


    /* ITEMS */

    if (
        Array.isArray(
            memoryChanges.addItems
        )
    ) {

        for (
            const item
            of memoryChanges.addItems
        ) {

            if (
                item &&
                typeof item === "object"
            ) {

                addItem(item);
            }
        }
    }


    if (
        Array.isArray(
            memoryChanges.removeItems
        )
    ) {

        for (
            const item
            of memoryChanges.removeItems
        ) {

            if (typeof item === "string") {

                removeItem(item);

            } else if (
                item &&
                typeof item === "object"
            ) {

                removeItem(
                    item.name,
                    item.quantity
                );
            }
        }
    }


    /* LOCATION */

    if (
        typeof memoryChanges.location ===
        "string" &&
        memoryChanges.location.trim()
    ) {

        const requestedLocation = memoryChanges.location.trim();
        const currentMemory = loadPermanentMemory();
        const currentLocation = currentMemory.location;
        const targetWorldLocation = world.getLocation(requestedLocation);

        // مکان‌های اصلی جهان فقط از مسیرهای تعریف‌شده قابل دسترسی‌اند.
        // این کنترل سمت سرور جلوی تلپورت ناخواسته‌ی AI یا دستکاری state را می‌گیرد.
        if (
            targetWorldLocation &&
            currentLocation &&
            targetWorldLocation.name !== currentLocation &&
            !world.areAdjacent(currentLocation, targetWorldLocation.name)
        ) {
            console.warn(`Blocked non-adjacent travel: ${currentLocation} -> ${targetWorldLocation.name}`);
        } else {
            setLocation(
                targetWorldLocation ? targetWorldLocation.name : requestedLocation,
                memoryChanges.locationNote
            );
        }

    } else if (
        typeof memoryChanges.locationNote ===
        "string" &&
        memoryChanges.locationNote.trim()
    ) {

        // بدون جابه‌جایی: فقط توصیف مکان فعلی (اگر هنوز ندارد)
        describeCurrentLocation(
            memoryChanges.locationNote
        );
    }


    /* QUESTS */

    if (
        Array.isArray(
            memoryChanges.addQuests
        )
    ) {

        for (
            const quest
            of memoryChanges.addQuests
        ) {

            const normalized =
                engine.normalizeQuest(quest, turn);

            if (normalized) {

                addQuest(normalized);
            }
        }
    }


    if (
        Array.isArray(
            memoryChanges.removeQuests
        )
    ) {

        for (
            const quest
            of memoryChanges.removeQuests
        ) {

            if (typeof quest === "string") {

                removeQuest(quest);

            } else if (
                quest &&
                typeof quest === "object"
            ) {

                removeQuest(
                    quest.name
                );
            }
        }
    }


    /* IMPORTANT EVENT */

    if (
        memoryChanges.importantEvent
    ) {

        if (
            typeof memoryChanges.importantEvent ===
            "string"
        ) {

            addImportantEvent(
                memoryChanges.importantEvent
            );

        } else {

            addImportantEvent(
                memoryChanges.importantEvent
            );
        }
    }


    /* NPCs */

    if (
        Array.isArray(
            memoryChanges.npcUpdates
        )
    ) {

        for (
            const raw
            of memoryChanges.npcUpdates.slice(0, 8)
        ) {

            const npc =
                engine.normalizeNpc(raw);

            if (npc) {

                upsertNpc(npc, turn);
            }
        }
    }


    /* REPUTATION (کد مقدار را محدود می‌کند) */

    if (
        memoryChanges.reputation &&
        typeof memoryChanges.reputation === "object" &&
        !Array.isArray(memoryChanges.reputation)
    ) {

        for (
            const [faction, delta]
            of Object.entries(
                memoryChanges.reputation
            ).slice(0, 5)
        ) {

            changeReputation(
                faction,
                delta
            );
        }
    }
}


/* =========================
   دو انتخاب (جبران فراموشی مدل)
========================= */

async function generateChoices(narration) {

    try {

        const completion =
            await Promise.race([

                client.chat.completions.create({
                    model: AI_MODEL,
                    messages:
                        engine.buildChoicesMessages(
                            narration
                        ),
                    temperature: 0.7
                }),

                new Promise((_, reject) =>
                    setTimeout(
                        () => reject(new Error("timeout")),
                        15000
                    )
                )
            ]);

        return engine.cleanChoices(
            completion?.choices?.[0]?.message?.content || ""
        );

    } catch (err) {

        console.error(
            "generateChoices:",
            err.message
        );

        return "";
    }
}


/* =========================
   ROLLING SUMMARY (پس‌زمینه)
========================= */

const summaryInFlight = new Set();

async function maybeUpdateSummary() {

    let sessionId;

    try {

        sessionId = getActiveSessionId();

        if (summaryInFlight.has(sessionId)) {
            return;
        }

        const memory = loadPermanentMemory();

        const turn = Number(memory.turn) || 0;

        if (
            turn - (Number(memory.summaryTurn) || 0) <
            engine.SUMMARY_EVERY_TURNS
        ) {
            return;
        }

        const since = memory.summaryAt
            ? Date.parse(memory.summaryAt)
            : 0;

        const fresh =
            getMemory()
                .filter(m => Date.parse(m.time || 0) > since)
                .slice(-24);

        if (fresh.length === 0) {
            return;
        }

        summaryInFlight.add(sessionId);

        const completion =
            await client.chat.completions.create({
                model: AI_MODEL,
                messages: engine.buildSummaryMessages(
                    memory.summary,
                    fresh
                ),
                temperature: 0.3
            });

        const text = cleanAIResponse(
            completion?.choices?.[0]?.message?.content || ""
        );

        if (text) {

            setSummary(text, turn);
        }

    } catch (err) {

        console.error(
            "Summary update failed:",
            err.message
        );

    } finally {

        if (sessionId) {
            summaryInFlight.delete(sessionId);
        }
    }
}


/* =========================
   ENEMY VALIDATION
========================= */

function validateEnemy(enemy, playerLevel = 1) {

    // مدل‌های کوچک گاهی فقط اسم دشمن را می‌دهند
    if (typeof enemy === "string") {
        enemy = { name: enemy };
    }

    if (
        !enemy ||
        typeof enemy !== "object"
    ) {

        return null;
    }


    const name =
        String(
            enemy.name || ""
        ).trim().slice(0, 60);

    if (!name) {

        return null;
    }


    const base =
        Math.max(
            1,
            Math.floor(Number(playerLevel) || 1)
        );

    // مقدار نامعتبر یا ناقص = مقدار پیش‌فرض بر اساس سطح بازیکن
    const pick = (value, min, fallback) => {

        const n = Number(value);

        return (
            isValidNumber(n) &&
            n >= min
        )
            ? Math.floor(n)
            : fallback;
    };

    const level =
        pick(enemy.level, 1, base);

    const hp =
        pick(enemy.hp, 1, 30 + 25 * level);

    const attack =
        pick(enemy.attack, 0, 6 + 3 * level);

    const defense =
        pick(enemy.defense, 0, 2 + level);


    return {
        name,
        level,
        hp,
        maxHp: hp,
        attack,
        defense,
        description:
            String(
                enemy.description || ""
            ).trim().slice(0, 200)
    };
}


/* =========================
   COMBAT REWARDS
========================= */

function giveCombatRewards(enemy) {

    const xp =
        Math.max(
            10,
            enemy.level * 25
        );


    const gold =
        Math.max(
            5,
            enemy.level * 10
        );


    const memory =
        loadPermanentMemory();


    const player =
        memory.player || {};


    let newXp =
        Number(player.xp || 0) +
        xp;


    let level =
        Number(player.level || 1);


    let maxHp =
        Number(player.maxHp || 100);


    let hp =
        Number(player.hp ?? maxHp);


    let maxMana =
        Number(player.maxMana || 50);


    let mana =
        Number(player.mana ?? maxMana);


    let attack =
        Number(player.attack || 10);


    let defense =
        Number(player.defense || 5);


    let xpNeeded =
        Number(
            player.xpNeeded || 100
        );


    let levelUps = 0;


    while (newXp >= xpNeeded) {

        newXp -= xpNeeded;

        level++;

        levelUps++;

        maxHp += 20;

        maxMana += 10;

        attack += 3;

        defense += 1;

        xpNeeded =
            Math.floor(
                xpNeeded * 1.35
            );
    }


    // جان و مانا خودکار بازیابی نمی‌شود؛ بازیکن باید از دکمه‌ی استراحت استفاده کند
    hp = Math.min(hp, maxHp);

    mana = Math.min(mana, maxMana);


    updatePlayer({

        xp: newXp,

        level,

        xpNeeded,

        maxHp,

        hp,

        maxMana,

        mana,

        attack,

        defense,

        gold:
            Number(player.gold || 0) +
            gold

    });


    return {

        xp,

        gold,

        levelUps

    };
}


/* =========================
   ENEMY TURN
========================= */

function enemyTurn() {

    const combat =
        getCombat();


    if (
        !combat ||
        !combat.active ||
        !combat.enemy
    ) {

        return null;
    }


    const memory =
        loadPermanentMemory();


    const player =
        memory.player || {};


    const equipment =
        memory.equipment || {};


    const enemy =
        combat.enemy;


    const playerDefense =
        Number(player.defense || 0) +
        Number(
            equipment.armor?.defense || 0
        );


    let baseDamage =
        Math.max(
            1,
            enemy.attack -
            playerDefense
        );


    const randomVariation =
        Math.floor(
            Math.random() * 5
        );


    let damage =
        Math.max(
            1,
            baseDamage +
            randomVariation
        );


    const wasDefending =
        Boolean(combat.defending);


    if (wasDefending) {

        damage =
            Math.max(
                1,
                Math.floor(damage / 2)
            );
    }


    const newHp =
        damagePlayer(damage);


    setCombatTurn("player");

    setDefending(false);


    if (newHp <= 0) {

        endCombat();


        return {

            defeated: true,

            damage,

            message:
                `دشمن ${damage} آسیب زد. تو شکست خوردی!`

        };
    }


    return {

        defeated: false,

        damage,

        message:
            wasDefending
                ? `با دفاع، فقط ${damage} آسیب دیدی.`
                : `دشمن ${damage} آسیب زد.`

    };
}


/* =========================
   CREATE CHARACTER
========================= */

app.post(
    "/create-character",
    async (req, res) => {

        try {

            const name =
                String(
                    req.body?.name || ""
                ).trim();


            const characterClass =
                String(
                    req.body?.class || ""
                ).trim();


            if (!name) {

                return res.status(400).json({

                    error:
                        "نام کاراکتر وارد نشده است."

                });
            }


            const classes = {

                warrior: {

                    class: "جنگجو",

                    hp: 140,
                    maxHp: 140,

                    mana: 40,
                    maxMana: 40,

                    attack: 20,

                    defense: 10,

                    criticalChance: 8

                },


                mage: {

                    class: "جادوگر",

                    hp: 90,
                    maxHp: 90,

                    mana: 100,
                    maxMana: 100,

                    attack: 13,

                    defense: 4,

                    criticalChance: 12

                },


                rogue: {

                    class: "قاتل",

                    hp: 110,
                    maxHp: 110,

                    mana: 60,
                    maxMana: 60,

                    attack: 17,

                    defense: 6,

                    criticalChance: 20

                }

            };


            const selectedClass =
                classes[characterClass];


            if (!selectedClass) {

                return res.status(400).json({

                    error:
                        "کلاس کاراکتر نامعتبر است."

                });
            }


            resetGame();


            updatePlayer({

                name,

                class:
                    selectedClass.class,

                hp:
                    selectedClass.hp,

                maxHp:
                    selectedClass.maxHp,

                mana:
                    selectedClass.mana,

                maxMana:
                    selectedClass.maxMana,

                attack:
                    selectedClass.attack,

                defense:
                    selectedClass.defense,

                criticalChance:
                    selectedClass.criticalChance,

                level: 1,

                xp: 0,

                xpNeeded: 100,

                gold: 100

            });


            const startLocation =
                "دهکده‌ی آغازین";


            setLocation(
                startLocation
            );


            addMessage(
                "system",
                `ماجراجویی ${name} آغاز شد.`
            );


            /*
             * پیام افتتاحیه از AI
             * قبل از هر پیام بازیکن
             */

            let introText =
                `در ${startLocation} ایستاده‌ای. هوا آرام است، اما از دور بوی خاکستر می‌آید. چند روز پیش ${world.MAIN_STORY.title} با آتش‌گرفتن مرموز ${"مزرعهٔ سوخته"} آغاز شده است. فعلاً مقصدهای نزدیکت ${"جنگل مه‌گرفته"}، ${"مزرعهٔ سوخته"} و ${"بازار سرخ"} هستند.

🎯 مأموریت آغازین: ${world.MAIN_STORY.stages[0]}

هر راهی را که انتخاب کنی، داستان واکنش نشان می‌دهد؛ اما برای رسیدن به نقاط دورتر باید از مسیرهای جهان عبور کنی.`;


            try {

                const introPrompt = `
تو Game Master یک بازی RPG فارسی هستی.

بازیکن تازه وارد بازی شده است.
نام: ${name}
کلاس: ${selectedClass.class}
مکان: ${startLocation}

یک پیام افتتاحیه کوتاه و جذاب به زبان فارسی بنویس که:
- مکان فعلی بازیکن را توصیف کند
- فضای دهکده آغازین را نشان دهد
- حس شروع ماجراجویی بدهد
- در متن از چند ایموجی مناسب صحنه استفاده کن (کم و بجا)
- در صورت تمایل یک جمله‌ی کوتاه شک‌آمیز در پرانتز به‌عنوان «راوی مخالف» اضافه کن
- در پایان دقیقاً دو انتخاب منطقی به بازیکن بده
- بعد از دو انتخاب بنویس که می‌تواند کار دیگری هم انجام دهد

فرمت پایان پیام:
🎯 انتخاب‌های پیش رو:
۱) ...
۲) ...
یا کار دیگری انجام بده.

فقط متن داستان را برگردان.
هیچ JSON، markdown یا توضیح اضافه ننویس.
حداکثر ۱۰ جمله.
`;


                const completion =
                    await client.chat.completions.create({

                        model:
                            AI_MODEL,

                        messages: [

                            {
                                role: "system",

                                content:
                                    introPrompt
                            },

                            {
                                role: "user",

                                content:
                                    "ماجراجویی را شروع کن."
                            }

                        ],

                        temperature: 0.85

                    });


                const rawIntro =
                    completion
                        ?.choices
                        ?.[0]
                        ?.message
                        ?.content;


                if (
                    rawIntro &&
                    String(rawIntro).trim()
                ) {

                    introText =
                        String(rawIntro)
                            .trim()
                            .replace(/^```[\s\S]*?```$/g, "")
                            .trim();
                }

            } catch (aiError) {

                console.error(
                    "Intro AI error:",
                    aiError.message
                );
            }


            addMessage(
                "assistant",
                introText
            );


            const memory =
                loadPermanentMemory();


            return res.json({

                success: true,

                response:
                    introText,

                memory

            });

        } catch (error) {

            console.error(
                "Create character error:",
                error
            );


            return res.status(500).json({

                error:
                    "ساخت کاراکتر با خطا مواجه شد."

            });
        }
    }
);


/* =========================
   MESSAGE TO AI
========================= */

app.post(
    "/message",
    async (req, res) => {

        let streaming = false;

        const send = obj => {
            res.write(JSON.stringify(obj) + "\n");
        };

        try {

            const message =
                String(
                    req.body?.message || ""
                ).trim();


            if (!message) {

                return res.status(400).json({

                    error:
                        "پیام خالی است."

                });
            }


            const combat =
                getCombat();


            if (
                combat &&
                combat.active
            ) {

                return res.status(400).json({

                    error:
                        "در حال مبارزه هستی. ابتدا مبارزه را تمام کن."

                });
            }


            const memory =
                loadPermanentMemory();


            const recentStory =
                getMemory();


            const recent =
                Array.isArray(recentStory)
                    ? recentStory.slice(-engine.RECENT_MESSAGES)
                    : [];


            /*
             * تاس و رویداد تصادفی: سرور تصمیم می‌گیرد، AI فقط روایت می‌کند
             */

            const dice =
                engine.rollCheck(
                    memory.player?.level
                );

            const randomEvent =
                engine.pickRandomEvent(memory);


            const textPool = [
                memory.location,
                message,
                ...recent.slice(-2).map(m => m.content)
            ].join(" ");


            const clueGate =
                getClueGate(memory, message);

            const systemPrompt =
                engine.buildSystemPrompt(
                    memory,
                    {
                        textPool,
                        dice,
                        event: randomEvent,
                        gate: clueGate
                    }
                );


            const chatMessages =
                engine.buildChatMessages(
                    systemPrompt,
                    recent,
                    message
                );


            /*
             * درخواست استریم به Routeway
             */

            const stream =
                await client.chat.completions.create({

                    model:
                        AI_MODEL,

                    messages:
                        chatMessages,

                    temperature: 0.8,

                    stream: true

                });


            res.status(200);

            res.setHeader(
                "Content-Type",
                "application/x-ndjson; charset=utf-8"
            );

            res.setHeader(
                "Cache-Control",
                "no-cache"
            );

            res.setHeader(
                "X-Accel-Buffering",
                "no"
            );

            res.flushHeaders();

            streaming = true;


            const rawResponse =
                await engine.consumeStream(
                    stream,
                    text => send({
                        type: "delta",
                        text
                    })
                );


            console.log(
                "\n=============================="
            );

            console.log(
                "RAW AI RESPONSE:"
            );

            console.log(
                rawResponse
            );

            console.log(
                "==============================\n"
            );


            if (!rawResponse.trim()) {

                send({
                    type: "error",
                    error: "AI هیچ پاسخی برنگرداند."
                });

                return res.end();
            }


            const parsed =
                engine.parseModelOutput(
                    rawResponse
                );


            let responseText =
                String(
                    parsed.narration || ""
                ).trim();


            if (!responseText) {

                send({
                    type: "error",
                    error: "AI متن داستانی برنگرداند."
                });

                return res.end();
            }


            const aiData =
                parsed.state &&
                typeof parsed.state === "object"
                    ? parsed.state
                    : {};


            if (!parsed.state) {

                console.log(
                    "State JSON پردازش نشد؛ فقط روایت ذخیره شد."
                );
            }


            /*
             * شروع نوبت جدید و اعمال Memory
             */

            const turn =
                advanceTurn();


            addMessage(
                "user",
                message
            );


            applyMemoryChanges(
                aiData.memory,
                turn
            );


            if (randomEvent) {

                markRandomEvent(turn);
            }


            /*
             * پیشروی کوئست اصلی: اگر سرنخ کلیدی مرحله پیدا شد، مرحله‌ی بعد باز می‌شود
             */

            const storyProgress =
                progressStoryQuest(clueGate, {
                    clueIds: (aiData.memory?.storyBible?.clues || [])
                        .map(c => String((c && c.id) || "")),
                    narration: responseText
                });

            // اگر بازیکن تحقیق کرد ولی AI سرنخ رو نگاه، هشدار
            if (clueGate && clueGate.atLocation && clueGate.investigating && !storyProgress) {
                const hint = clueGate.clue.hint || clueGate.clue.truth;
                responseText += `\n\n[سرور: بازیکن تحقیق کرد ولی سرنخ اصلی کشف نشد. AI احتمالاً سرنخ را دقیقاً بیان نکرد یا حقیقت متناقض گفت.]`;
            }

            if (storyProgress) {

                const questNote = storyProgress.completed
                    ? `\n\n🏆 خط اصلی «${world.MAIN_STORY.title}» کامل شد!`
                    : `\n\n📜 سرنخ کلیدی پیدا شد: «${storyProgress.clueTitle}»\n🎯 مأموریت جدید: ${storyProgress.objective}`;

                responseText += questNote;

                send({
                    type: "delta",
                    text: questNote
                });
            }


            /*
             * شروع مبارزه
             */

            let combatStarted = false;

            if (
                aiData.combat &&
                aiData.combat.start === true
            ) {

                const enemy =
                    validateEnemy(
                        aiData.combat.enemy,
                        memory.player?.level
                    );


                if (enemy) {

                    startCombat(enemy);

                    combatStarted = true;

                    // در مبارزه دکمه‌ها در UI هستند؛ انتخاب‌ها حذف می‌شوند
                    responseText =
                        engine.stripChoices(
                            responseText
                        ) || responseText;

                } else {

                    console.log(
                        "AI درخواست شروع مبارزه داد اما اطلاعات دشمن نامعتبر بود."
                    );
                }
            }


            // انتخاب‌های مرتبط با کوئست فعلی (سرور تولید می‌کند)
            if (!combatStarted) {
                const storyQuest = memory.quests.find(q => q && q.storyQuest && !q.completed);
                const stage = storyQuest ? Math.min(Math.max(Number(storyQuest.stage) || 1, 1), 7) : 1;
                const serverChoices = world.STAGE_CHOICES && world.STAGE_CHOICES[stage];
                
                // انتخاب‌های AI را حذف کن
                responseText = engine.stripChoices(responseText);
                
                // اگر انتخاب‌های سرور وجود دارد
                if (serverChoices && Array.isArray(serverChoices) && serverChoices.length >= 2) {
                    const choices = `🎯 انتخاب‌های پیش رو:\n۱) ${serverChoices[0]}\n۲) ${serverChoices[1]}\nیا کار دیگری انجام بده.`;
                    responseText += `\n\n${choices}`;
                    send({
                        type: "delta",
                        text: `\n\n${choices}`
                    });
                }
            }


            addMessage(
                "assistant",
                responseText
            );


            send({

                type: "final",

                success: true,

                response:
                    responseText,

                memory:
                    loadPermanentMemory(),

                combat:
                    getCombat(),

                dice: {
                    roll: dice.roll,
                    bonus: dice.bonus,
                    total: dice.total,
                    tier: dice.tier,
                    used: aiData.riskyAction === true
                }

            });


            res.end();


            // به‌روزرسانی خلاصه بعد از ارسال جواب؛ بازیکن منتظرش نمی‌ماند
            maybeUpdateSummary();


        } catch (error) {

            console.error(
                "\nMESSAGE ERROR:"
            );

            console.error(
                error
            );


            if (streaming) {

                try {

                    send({
                        type: "error",
                        error: "خطا در ارتباط با AI.",
                        details: error.message
                    });

                    res.end();

                } catch {
                    // اتصال بسته شده است
                }

                return;
            }


            return res.status(500).json({

                error:
                    "خطا در ارتباط با AI.",

                details:
                    error.message

            });
        }
    }
);


/* =========================
   GAME STATE
========================= */

app.get(
    "/game-state",
    (req, res) => {

        try {

            const memory =
                loadPermanentMemory();


            return res.json({

                memory,

                combat:
                    getCombat()

            });

        } catch (error) {

            console.error(error);

            return res.status(500).json({

                error:
                    "دریافت وضعیت بازی ناموفق بود."

            });
        }
    }
);


/* =========================
   STORY MEMORY
========================= */

app.get(
    "/story-memory",
    (req, res) => {

        try {

            return res.json({

                memory:
                    getMemory()

            });

        } catch (error) {

            console.error(error);

            return res.status(500).json({

                error:
                    "دریافت حافظه داستان ناموفق بود."

            });
        }
    }
);


/* =========================
   COMBAT STATE
========================= */

app.get(
    "/combat-state",
    (req, res) => {

        return res.json({

            combat:
                getCombat()

        });
    }
);


/* =========================
   ATTACK
========================= */

app.post(
    "/attack",
    async (req, res) => {

        try {

            const combat =
                getCombat();


            if (
                !combat ||
                !combat.active ||
                !combat.enemy
            ) {

                return res.status(400).json({

                    error:
                        "مبارزه فعالی وجود ندارد."

                });
            }


            const memory =
                loadPermanentMemory();


            const player =
                memory.player;


            const equipment =
                memory.equipment || {};


            if (
                !player ||
                player.hp <= 0
            ) {

                return res.status(400).json({

                    error:
                        "بازیکن نمی‌تواند حمله کند."

                });
            }


            const playerAttack =
                Number(player.attack || 0) +
                Number(
                    equipment.weapon?.attack || 0
                );


            let damage =
                Math.max(

                    1,

                    playerAttack -
                    Number(
                        combat.enemy.defense || 0
                    ) +
                    Math.floor(
                        Math.random() * 6
                    )

                );


            /*
             * نوار زمان‌بندی: ضریب را سرور از روی elapsedMs حساب می‌کند
             */

            const shot =
                timing.consumeShot(
                    getActiveSessionId(),
                    "attack",
                    req.body?.barId,
                    req.body?.elapsedMs
                );

            const shotText =
                timing.describeShot(shot);

            damage =
                Math.max(
                    1,
                    Math.floor(
                        damage * shot.mult
                    )
                );


            let critical =
                false;


            const criticalChance =
                Number(
                    player.criticalChance || 0
                );


            if (
                Math.random() * 100 <
                criticalChance
            ) {

                damage *= 2;

                critical = true;
            }


            damage =
                Math.floor(damage);


            const enemyHp =
                updateEnemyHp(
                    damage
                );


            if (enemyHp <= 0) {

                const enemyName =
                    combat.enemy?.name || "دشمن";

                const rewards =
                    giveCombatRewards(
                        combat.enemy
                    );


                endCombat();


                addMessage(
                    "system",
                    `دشمن شکست خورد. +${rewards.xp} تجربه و +${rewards.gold} طلا`
                );


                const storyAfterCombat =
                    await narrateAfterCombat(
                        "victory",
                        { enemyName, rewards }
                    );


                return res.json({

                    success: true,

                    result:
                        "enemy-defeated",

                    damage,

                    critical,

                    rewards,

                    message:
                        critical
                            ? `${shotText}ضربه بحرانی! ${damage} آسیب. دشمن شکست خورد!`
                            : `${shotText}حمله کردی و ${damage} آسیب زدی. دشمن شکست خورد!`,

                    timing:
                        timing.publicShot(shot),

                    storyAfterCombat,

                    combat:
                        getCombat(),

                    memory:
                        loadPermanentMemory()

                });
            }


            resetCombatCombo();

            setCombatTurn("enemy");


            const enemyResult =
                enemyTurn();


            return res.json({

                success: true,

                result:
                    "attack",

                damage,

                critical,

                message:
                    critical
                        ? `${shotText}ضربه بحرانی! ${damage} آسیب زدی.`
                        : `${shotText}حمله کردی و ${damage} آسیب زدی.`,

                timing:
                    timing.publicShot(shot),

                enemyDamage:
                    enemyResult
                        ?.damage || 0,

                enemyResult,

                combat:
                    getCombat(),

                memory:
                    loadPermanentMemory()

            });

        } catch (error) {

            console.error(error);

            return res.status(500).json({

                error:
                    "حمله با خطا مواجه شد."

            });
        }
    }
);


/* =========================
   DEFEND
========================= */

app.post(
    "/defend",
    (req, res) => {

        try {

            const combat =
                getCombat();


            if (
                !combat ||
                !combat.active
            ) {

                return res.status(400).json({

                    error:
                        "مبارزه فعالی وجود ندارد."

                });
            }


            resetCombatCombo();

            setDefending(true);

            setCombatTurn("enemy");


            const enemyResult =
                enemyTurn();


            return res.json({

                success: true,

                result:
                    "defend",

                message:
                    "دفاع کردی.",

                enemyDamage:
                    enemyResult
                        ?.damage || 0,

                enemyResult,

                combat:
                    getCombat(),

                memory:
                    loadPermanentMemory()

            });

        } catch (error) {

            console.error(error);

            return res.status(500).json({

                error:
                    "دفاع با خطا مواجه شد."

            });
        }
    }
);


/* =========================
   CLASS SKILLS
========================= */

const CLASS_SKILLS = {

    Warrior: {

        powerStrike: {
            name: "ضربه قدرتمند",
            manaCost: 15,
            multiplier: 1.8,
            description: "ضربه‌ای سنگین با شمشیر"
        },

        shieldBash: {
            name: "ضربه سپر",
            manaCost: 12,
            multiplier: 1.4,
            description: "حمله با سپر؛ آسیب متوسط"
        },

        whirlwind: {
            name: "گردباد",
            manaCost: 25,
            multiplier: 2.2,
            description: "چرخش خشمگین با آسیب بالا"
        }

    },

    Mage: {

        fireball: {
            name: "گلوله آتش",
            manaCost: 25,
            multiplier: 2.3,
            description: "توپ آتشین با آسیب بالا"
        },

        iceBolt: {
            name: "پیکان یخ",
            manaCost: 18,
            multiplier: 1.7,
            description: "پیکان یخ؛ آسیب خوب و مصرف کمتر"
        },

        arcaneBlast: {
            name: "انفجار جادویی",
            manaCost: 35,
            multiplier: 2.8,
            description: "انفجار قوی جادو؛ مصرف مانا بالا"
        }

    },

    Rogue: {

        shadowStrike: {
            name: "ضربه سایه",
            manaCost: 18,
            multiplier: 2.0,
            description: "حمله از سایه با آسیب بالا"
        },

        backstab: {
            name: "خنجر از پشت",
            manaCost: 22,
            multiplier: 2.5,
            description: "خنجر کاری؛ آسیب خیلی بالا"
        },

        poisonBlade: {
            name: "تیغ زهرآگین",
            manaCost: 15,
            multiplier: 1.6,
            description: "تیغ آغشته به زهر؛ مصرف کم"
        }

    }

};


/* زنجیره کمبوی هر کلاس */

const CLASS_COMBOS = {

    Warrior: {

        id: "warrior_fury",

        name: "خشم جنگجو",

        sequence: [
            "powerStrike",
            "shieldBash",
            "whirlwind"
        ],

        // ضریب اضافه روی مهارت در هر مرحله
        stepBonus: [
            1.0,
            1.2,
            1.4
        ],

        // ضریب نهایی وقتی زنجیره کامل شد
        finishBonus: 1.5,

        manaRefundOnFinish: 15

    },

    Mage: {

        id: "mage_cascade",

        name: "آبشار جادو",

        sequence: [
            "iceBolt",
            "fireball",
            "arcaneBlast"
        ],

        stepBonus: [
            1.0,
            1.25,
            1.45
        ],

        finishBonus: 1.6,

        manaRefundOnFinish: 20

    },

    Rogue: {

        id: "rogue_assassination",

        name: "ترور",

        sequence: [
            "poisonBlade",
            "shadowStrike",
            "backstab"
        ],

        stepBonus: [
            1.0,
            1.2,
            1.5
        ],

        finishBonus: 1.7,

        manaRefundOnFinish: 12

    }

};


function normalizeClassKey(playerClass) {

    const raw =
        String(playerClass || "")
            .trim();

    const map = {
        // فارسی (نسخه فعلی)
        "جنگجو": "Warrior",
        "جادوگر": "Mage",
        "قاتل": "Rogue",
        // انگلیسی (سازگاری با saveهای قدیمی)
        "Warrior": "Warrior",
        "Mage": "Mage",
        "Rogue": "Rogue",
        "warrior": "Warrior",
        "mage": "Mage",
        "rogue": "Rogue"
    };

    return map[raw] || raw;
}


function getClassSkills(playerClass) {

    const key =
        normalizeClassKey(playerClass);


    return CLASS_SKILLS[key] || null;
}


function getClassCombo(playerClass) {

    const key =
        normalizeClassKey(playerClass);


    return CLASS_COMBOS[key] || null;
}


function resolveCombo(
    playerClass,
    skillId,
    currentChain
) {

    const comboDef =
        getClassCombo(playerClass);


    if (!comboDef) {

        return {

            chain: [],

            step: 0,

            continued: false,

            finished: false,

            comboMult: 1,

            comboName: null,

            nextSkill: null

        };
    }


    const sequence =
        comboDef.sequence;


    const chain =
        Array.isArray(currentChain)
            ? currentChain
            : [];


    let newChain = [];

    let continued = false;


    const expectedIndex =
        chain.length;


    if (
        expectedIndex < sequence.length &&
        skillId === sequence[expectedIndex]
    ) {

        newChain = [
            ...chain,
            skillId
        ];

        continued = true;

    } else if (
        skillId === sequence[0]
    ) {

        newChain = [skillId];

        continued = true;

    } else {

        newChain = [];

        continued = false;
    }


    const step =
        newChain.length;


    let comboMult = 1;


    if (
        step > 0 &&
        comboDef.stepBonus[
            step - 1
        ]
    ) {

        comboMult =
            comboDef.stepBonus[
                step - 1
            ];
    }


    const finished =
        step > 0 &&
        step === sequence.length;


    if (finished) {

        comboMult =
            comboMult *
            (comboDef.finishBonus || 1);
    }


    const nextSkill =
        !finished &&
        step < sequence.length
            ? sequence[step]
            : null;


    return {

        chain:
            finished
                ? []
                : newChain,

        step,

        continued,

        finished,

        comboMult,

        comboName:
            comboDef.name,

        nextSkill,

        manaRefund:
            finished
                ? (comboDef.manaRefundOnFinish || 0)
                : 0,

        sequence

    };
}


/* لیست مهارت‌های کلاس برای کلاینت */

app.get(
    "/skills",
    (req, res) => {

        try {

            const memory =
                loadPermanentMemory();


            const playerClass =
                memory.player?.class;


            const skills =
                getClassSkills(playerClass);


            const comboDef =
                getClassCombo(playerClass);


            const combat =
                getCombat();


            const currentCombo =
                combat?.combo || {
                    chain: [],
                    name: null
                };


            if (!skills) {

                return res.json({

                    class: playerClass || null,

                    skills: [],

                    combo: null

                });
            }


            const list =
                Object.entries(skills)
                    .map(([id, skill]) => {

                        const seqIndex =
                            comboDef
                                ? comboDef.sequence.indexOf(id)
                                : -1;


                        const nextNeeded =
                            comboDef &&
                            currentCombo.chain
                                .length <
                                comboDef.sequence.length
                                ? comboDef.sequence[
                                    currentCombo.chain.length
                                ]
                                : null;


                        return {

                            id,

                            name:
                                skill.name,

                            manaCost:
                                skill.manaCost,

                            multiplier:
                                skill.multiplier,

                            description:
                                skill.description,

                            comboStep:
                                seqIndex >= 0
                                    ? seqIndex + 1
                                    : null,

                            isNextInCombo:
                                nextNeeded === id

                        };
                    });


            let comboInfo = null;


            if (comboDef) {

                const skillNames =
                    comboDef.sequence.map(
                        id =>
                            skills[id]?.name || id
                    );


                comboInfo = {

                    name:
                        comboDef.name,

                    sequence:
                        comboDef.sequence,

                    sequenceNames:
                        skillNames,

                    currentChain:
                        currentCombo.chain || [],

                    step:
                        (currentCombo.chain || [])
                            .length,

                    total:
                        comboDef.sequence.length,

                    nextSkill:
                        (currentCombo.chain || [])
                            .length <
                        comboDef.sequence.length
                            ? comboDef.sequence[
                                (currentCombo.chain || [])
                                    .length
                            ]
                            : null

                };
            }


            return res.json({

                class: playerClass,

                skills: list,

                combo: comboInfo

            });

        } catch (error) {

            console.error(error);

            return res.status(500).json({

                error:
                    "دریافت مهارت‌ها ناموفق بود."

            });
        }
    }
);


/* =========================
   SKILL
========================= */

app.post(
    "/skill",
    async (req, res) => {

        try {

            const combat =
                getCombat();


            if (
                !combat ||
                !combat.active ||
                !combat.enemy
            ) {

                return res.status(400).json({

                    error:
                        "مبارزه فعالی وجود ندارد."

                });
            }


            const skillId =
                String(
                    req.body?.skill || ""
                ).trim();


            const memory =
                loadPermanentMemory();


            const player =
                memory.player;


            const equipment =
                memory.equipment || {};


            const classSkills =
                getClassSkills(
                    player?.class
                );


            if (!classSkills) {

                return res.status(400).json({

                    error:
                        "کلاس بازیکن مهارت معتبری ندارد."

                });
            }


            const skill =
                classSkills[skillId];


            if (!skill) {

                const available =
                    Object.values(classSkills)
                        .map(item => item.name)
                        .join("، ");


                return res.status(400).json({

                    error:
                        `مهارت نامعتبر است. مهارت‌های کلاس ${player.class}: ${available}`

                });
            }


            const manaCost =
                skill.manaCost;


            const multiplier =
                skill.multiplier;


            if (
                Number(player.mana || 0) <
                manaCost
            ) {

                return res.status(400).json({

                    error:
                        `مانای کافی نداری. نیاز: ${manaCost}`

                });
            }


            /*
             * محاسبه کمبو
             */

            const currentChain =
                combat.combo?.chain || [];


            const comboResult =
                resolveCombo(
                    player.class,
                    skillId,
                    currentChain
                );


            restoreMana(-manaCost);


            if (
                comboResult.finished &&
                comboResult.manaRefund > 0
            ) {

                restoreMana(
                    comboResult.manaRefund
                );
            }


            setCombatCombo(
                comboResult.chain,
                comboResult.comboName
            );


            const playerAttack =
                Number(player.attack || 0) +
                Number(
                    equipment.weapon?.attack || 0
                );


            const shot =
                timing.consumeShot(
                    getActiveSessionId(),
                    `skill:${skillId}`,
                    req.body?.barId,
                    req.body?.elapsedMs
                );

            const shotText =
                timing.describeShot(shot);

            const damage =
                Math.max(

                    1,

                    Math.floor(

                        (
                            playerAttack *
                            multiplier *
                            comboResult.comboMult

                            -

                            Number(
                                combat.enemy.defense || 0
                            )
                        ) *
                        shot.mult

                    )

                );


            let message =
                `${shotText}${skill.name}: ${damage} آسیب. (-${manaCost} مانا)`;


            if (comboResult.finished) {

                message =
                    `${shotText}🔥 کمبوی ${comboResult.comboName} کامل شد! ` +
                    `${skill.name}: ${damage} آسیب` +
                    (comboResult.manaRefund
                        ? ` | +${comboResult.manaRefund} مانا بازگشت`
                        : "");

            } else if (
                comboResult.continued &&
                comboResult.step > 0
            ) {

                message +=
                    ` | کمبو ${comboResult.step}/` +
                    `${comboResult.sequence.length}` +
                    ` (${comboResult.comboName})`;
            }


            const enemyHp =
                updateEnemyHp(
                    damage
                );


            if (enemyHp <= 0) {

                const enemyName =
                    combat.enemy?.name || "دشمن";

                const rewards =
                    giveCombatRewards(
                        combat.enemy
                    );


                endCombat();


                addMessage(
                    "system",
                    `دشمن شکست خورد. +${rewards.xp} تجربه و +${rewards.gold} طلا`
                );


                const storyAfterCombat =
                    await narrateAfterCombat(
                        "victory",
                        { enemyName, rewards }
                    );


                return res.json({

                    success: true,

                    result:
                        "enemy-defeated",

                    damage,

                    skill:
                        skill.name,

                    timing:
                        timing.publicShot(shot),

                    manaCost,

                    combo: {
                        step:
                            comboResult.step,

                        finished:
                            comboResult.finished,

                        name:
                            comboResult.comboName,

                        mult:
                            comboResult.comboMult
                    },

                    storyAfterCombat,

                    rewards,

                    message:
                        message +
                        " دشمن شکست خورد!",

                    combat:
                        getCombat(),

                    memory:
                        loadPermanentMemory()

                });
            }


            setCombatTurn("enemy");


            const enemyResult =
                enemyTurn();


            return res.json({

                success: true,

                result:
                    "skill",

                damage,

                skill:
                    skill.name,

                timing:
                    timing.publicShot(shot),

                manaCost,

                combo: {
                    step:
                        comboResult.step,

                    finished:
                        comboResult.finished,

                    name:
                        comboResult.comboName,

                    mult:
                        comboResult.comboMult,

                    nextSkill:
                        comboResult.nextSkill,

                    chain:
                        comboResult.chain
                },

                message,

                enemyDamage:
                    enemyResult
                        ?.damage || 0,

                enemyResult,

                combat:
                    getCombat(),

                memory:
                    loadPermanentMemory()

            });

        } catch (error) {

            console.error(error);

            return res.status(500).json({

                error:
                    "استفاده از مهارت با خطا مواجه شد."

            });
        }
    }
);


/* =========================
   TIMING BAR
   نوار زمان‌بندی را می‌سازد؛ نتیجه‌اش در /attack یا /skill حساب می‌شود
========================= */

app.post(
    "/timing/start",
    (req, res) => {

        try {

            const combat =
                getCombat();

            if (
                !combat ||
                !combat.active ||
                !combat.enemy
            ) {

                return res.status(400).json({

                    error:
                        "مبارزه فعالی وجود ندارد."

                });
            }


            const memory =
                loadPermanentMemory();

            const player =
                memory.player;


            if (
                !player ||
                player.hp <= 0
            ) {

                return res.status(400).json({

                    error:
                        "بازیکن نمی‌تواند حمله کند."

                });
            }


            const kind =
                String(
                    req.body?.action || "attack"
                );


            let action =
                "attack";

            let sweepMs =
                timing.ATTACK_SWEEP_MS;


            if (kind === "skill") {

                const skillId =
                    String(
                        req.body?.skill || ""
                    ).trim();

                const classSkills =
                    getClassSkills(
                        player.class
                    );

                const skill =
                    classSkills?.[skillId];

                if (!skill) {

                    return res.status(400).json({

                        error:
                            "مهارت نامعتبر است."

                    });
                }

                if (
                    Number(player.mana || 0) <
                    skill.manaCost
                ) {

                    return res.status(400).json({

                        error:
                            `مانای کافی نداری. نیاز: ${skill.manaCost}`

                    });
                }

                action =
                    `skill:${skillId}`;

                sweepMs =
                    timing.sweepForSkill(
                        skill.multiplier
                    );

            } else if (kind !== "attack") {

                return res.status(400).json({

                    error:
                        "نوع حمله نامعتبر است."

                });
            }


            const bar =
                timing.createBar(
                    getActiveSessionId(),
                    action,
                    sweepMs
                );


            return res.json({

                success: true,

                ...bar

            });

        } catch (error) {

            console.error(error);

            return res.status(500).json({

                error:
                    "ساخت نوار با خطا مواجه شد."

            });
        }
    }
);


/* =========================
   POTION
========================= */

app.post(
    "/potion",
    (req, res) => {

        try {

            const combat =
                getCombat();


            if (
                !combat ||
                !combat.active
            ) {

                return res.status(400).json({

                    error:
                        "مبارزه فعالی وجود ندارد."

                });
            }


            const typeRaw =
                String(
                    req.body?.type ||
                    "health"
                ).toLowerCase().trim();


            const isMana =
                typeRaw === "mana" ||
                typeRaw === "مانا";


            const memory =
                loadPermanentMemory();


            const player =
                memory.player;


            const inventory =
                Array.isArray(
                    memory.inventory
                )
                    ? memory.inventory
                    : [];


            const defaultAmount =
                isMana ? 30 : 40;


            // سازگاری با نام فارسی و انگلیسی
            const itemIndex =
                inventory.findIndex(
                    item => {

                        if (
                            !item ||
                            Number(item.quantity || 0) <= 0
                        ) {
                            return false;
                        }

                        const name =
                            String(item.name || "");

                        const itemType =
                            String(item.type || "")
                                .toLowerCase();

                        if (isMana) {
                            return (
                                itemType === "mana" ||
                                /مانا|mana/i.test(name)
                            );
                        }

                        return (
                            itemType === "potion" ||
                            itemType === "health" ||
                            /درمان|سلامت|health/i.test(name)
                        );
                    }
                );


            if (itemIndex === -1) {

                return res.status(400).json({

                    error:
                        "این معجون را نداری."

                });
            }


            const foundItem =
                inventory[itemIndex];


            const amount =
                Number(
                    foundItem.effect
                ) || defaultAmount;


            removeItem(
                foundItem.name,
                1
            );


            if (isMana) {

                restoreMana(amount);

            } else {

                healPlayer(amount);
            }


            resetCombatCombo();

            setCombatTurn("enemy");


            const enemyResult =
                enemyTurn();


            return res.json({

                success: true,

                result:
                    "potion",

                message:
                    isMana
                        ? `معجون مانا استفاده شد (+${amount} مانا).`
                        : `معجون درمان استفاده شد (+${amount} جان).`,

                enemyDamage:
                    enemyResult
                        ?.damage || 0,

                enemyResult,

                combat:
                    getCombat(),

                memory:
                    loadPermanentMemory()

            });

        } catch (error) {

            console.error(error);

            return res.status(500).json({

                error:
                    "استفاده از معجون با خطا مواجه شد."

            });
        }
    }
);


/* =========================
   RUN
========================= */

app.post(
    "/run",
    async (req, res) => {

        try {

            const combat =
                getCombat();


            if (
                !combat ||
                !combat.active
            ) {

                return res.status(400).json({

                    error:
                        "مبارزه فعالی وجود ندارد."

                });
            }


            const enemyName =
                combat.enemy?.name || "دشمن";


            const success =
                Math.random() <
                0.65;


            if (success) {

                endCombat();


                addMessage(
                    "system",
                    "با موفقیت از مبارزه فرار کردی."
                );


                const storyAfterCombat =
                    await narrateAfterCombat(
                        "escape",
                        { enemyName }
                    );


                return res.json({

                    success: true,

                    escaped: true,

                    message:
                        "با موفقیت از مبارزه فرار کردی.",

                    storyAfterCombat,

                    combat:
                        getCombat(),

                    memory:
                        loadPermanentMemory()

                });
            }


            resetCombatCombo();


            const enemyResult =
                enemyTurn();


            return res.json({

                success: true,

                escaped: false,

                message:
                    "نتوانستی فرار کنی!",

                enemyDamage:
                    enemyResult
                        ?.damage || 0,

                enemyResult,

                combat:
                    getCombat(),

                memory:
                    loadPermanentMemory()

            });

        } catch (error) {

            console.error(error);

            return res.status(500).json({

                error:
                    "فرار از مبارزه با خطا مواجه شد."

            });
        }
    }
);


/* =========================
   REST
========================= */

app.post(
    "/rest",
    (req, res) => {

        try {

            const combat =
                getCombat();


            if (
                combat &&
                combat.active
            ) {

                return res.status(400).json({

                    error:
                        "در زمان مبارزه نمی‌توانی استراحت کنی."

                });
            }


            const memory =
                loadPermanentMemory();


            const player =
                memory.player;


            if (
                Number(player.hp) >= Number(player.maxHp) &&
                Number(player.mana) >= Number(player.maxMana)
            ) {

                return res.status(400).json({

                    error:
                        "جان و مانایت کامل است؛ نیازی به استراحت نیست."

                });
            }


            healPlayer(
                Number(
                    player.maxHp || 0
                )
            );


            restoreMana(
                Number(
                    player.maxMana || 0
                )
            );


            addMessage(
                "system",
                "استراحت کردی و سلامتی و مانایت بازیابی شد."
            );


            return res.json({

                success: true,

                message:
                    "استراحت کردی و سلامتی و مانایت بازیابی شد.",

                memory:
                    loadPermanentMemory()

            });

        } catch (error) {

            console.error(error);

            return res.status(500).json({

                error:
                    "استراحت با خطا مواجه شد."

            });
        }
    }
);


/* =========================
   SHOP
========================= */

app.post(
    "/shop/buy",
    (req, res) => {

        try {

            const item =
                String(
                    req.body?.item ||
                    ""
                );


            const shop = {

                healthPotion: {

                    name:
                        "معجون درمان",

                    price: 25,

                    type:
                        "potion",

                    effect:
                        40

                },


                manaPotion: {

                    name:
                        "معجون مانا",

                    price: 25,

                    type:
                        "mana",

                    effect:
                        30

                },


                ironSword: {

                    name:
                        "Iron Sword",

                    price: 150,

                    type:
                        "weapon",

                    attack:
                        8

                },


                steelArmor: {

                    name:
                        "Steel Armor",

                    price: 150,

                    type:
                        "armor",

                    defense:
                        6

                }

            };


            const selected =
                shop[item];


            if (!selected) {

                return res.status(400).json({

                    error:
                        "آیتم نامعتبر است."

                });
            }


            const memory =
                loadPermanentMemory();


            const player =
                memory.player;


            const gold =
                Number(
                    player.gold || 0
                );


            if (
                gold <
                selected.price
            ) {

                return res.status(400).json({

                    error:
                        "طلای کافی نداری."

                });
            }


            updatePlayer({

                gold:
                    gold -
                    selected.price

            });


            let message =
                `${selected.name} خریداری شد.`;


            if (
                selected.type ===
                "weapon"
            ) {

                equipWeapon(
                    selected.name,
                    selected.attack
                );


                message =
                    `${selected.name} خریداری و تجهیز شد (+${selected.attack} Attack).`;

            } else if (
                selected.type ===
                "armor"
            ) {

                equipArmor(
                    selected.name,
                    selected.defense
                );


                message =
                    `${selected.name} خریداری و تجهیز شد (+${selected.defense} Defense).`;

            } else {

                addItem({

                    name:
                        selected.name,

                    type:
                        selected.type,

                    effect:
                        selected.effect,

                    quantity:
                        1

                });
            }


            return res.json({

                success: true,

                message,

                memory:
                    loadPermanentMemory()

            });

        } catch (error) {

            console.error(error);

            return res.status(500).json({

                error:
                    "خرید ناموفق بود."

            });
        }
    }
);


/* =========================
   RESET GAME
========================= */

app.post(
    "/reset-game",
    async (req, res) => {

        try {

            // داده‌ی این session کاملاً از رم، دیتابیس و فایل‌ها پاک می‌شود.
            // کلاینت بعد از موفقیت، session جدید می‌سازد.
            await deleteSession(
                getActiveSessionId()
            );


            const fresh =
                createDefaultMemory();


            return res.json({

                success: true,

                memory:
                    fresh,

                combat:
                    fresh.combat

            });

        } catch (error) {

            console.error(error);

            return res.status(500).json({

                error:
                    "پاک کردن اطلاعات قبلی از دیتابیس ناموفق بود. دوباره تلاش کن."

            });
        }
    }
);


/* =========================
   START SERVER
========================= */

initMongo()
    .catch(() => {})
    .finally(() => {

        
/* =========================
   CHOICE -> ACTION CONVERSION
========================= */

app.post(
    "/choice/:num",
    async (req, res) => {
        try {
            const num = parseInt(String(req.params.num || "").trim());
            if (!num || num < 1 || num > 2) {
                return res.status(400).json({ error: "انتخاب ۱ یا ۲ را بده." });
            }

            const memory = loadPermanentMemory();
            const recentStory = getMemory();
            const recent = Array.isArray(recentStory) ? recentStory.slice(-2) : [];
            
            let choicesText = "";
            for (let i = recent.length - 1; i >= 0; i--) {
                if (recent[i] && recent[i].role === "assistant") {
                    choicesText = String(recent[i].content || "");
                    break;
                }
            }

            const lines = choicesText.split("\n");
            let selectedChoice = "";
            for (const line of lines) {
                const match = line.match(new RegExp(`^\s*${num}\s*[\)\-\.]\s*(.+)`));
                if (match) {
                    selectedChoice = match[1].trim();
                    break;
                }
            }

            if (!selectedChoice) {
                return res.status(400).json({ error: `گزینه‌ی ${num} پیدا نشد.` });
            }

            // انتخاب رو انگار پیام بازیکن فرستاده است
            req.body.message = selectedChoice;

            // /message endpoint رو بخوان
            const { Router } = require("express");
            const origUrl = req.url;
            req.url = "/message";
            req.method = "POST";
            
            // به بقیه router‌های message برسان
            const originalEnd = res.end.bind(res);
            let wrote = false;

            res.write = function(chunk) {
                wrote = true;
                return originalEnd.call(res, chunk);
            };

            res.end = function(chunk) {
                if (!wrote) return originalEnd.call(res, chunk);
            };

            // درخواست /message رو شبیه‌سازی کن - اما بهتر: مستقیماً فانکشن message رو بخوان
            // این کار پیچیده است، بهتر است کاربر مستقیماً /message بزند
            
            return res.status(400).json({ error: "لطفاً انتخاب رو بنویس (copy/paste)." });

        } catch (error) {
            console.error("/choice error:", error);
            return res.status(500).json({ error: "خرابی." });
        }
    }
);

app.listen(
            PORT,
            "0.0.0.0",
            () => {

                console.log(
                    `🎮 افسانهٔ سایه‌ها روی پورت ${PORT} آماده است`
                );

            }
        );

    });


