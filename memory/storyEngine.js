"use strict";

/*
 * منطق خالص (بدون وابستگی به session یا شبکه) برای ساخت پرامپت فشرده،
 * تاس، رویداد تصادفی، شهرت، NPC و پارس خروجی استریم.
 */

const worldMap = require("./worldMap");
const world = require("./world");
const gameplay = require("./gameplay");

const STATE_SEPARATOR = "###STATE###";
const MAX_KNOWN_PLACES = 20;

const SUMMARY_EVERY_TURNS = 6;
const RECENT_MESSAGES = 8;
const RECENT_EVENTS = 8;
const MAX_RELEVANT_NPCS = 6;
const EVENT_COOLDOWN_TURNS = 4;
const EVENT_CHANCE = 0.18;

const RANDOM_EVENTS = [
    "یک کاروان تاجران سرگردان از راه می‌رسد و کالاهای عجیبی برای فروش دارد.",
    "طوفان یا بارانی ناگهانی شروع می‌شود و مسیر را دشوار می‌کند.",
    "یک غریبه‌ی مرموز به بازیکن نزدیک می‌شود و شایعه‌ای نگران‌کننده می‌گوید.",
    "بازیکن چیزی می‌یابد که کسی گم کرده است (نامه، کیسه‌ی پول یا نشانی عجیب).",
    "صدایی از دور شنیده می‌شود که نشانه‌ی خطر یا رازی نزدیک است.",
    "یکی از NPCهای آشنا برای کمک یا هشدار به سراغ بازیکن می‌آید.",
    "یک خیانت کوچک آشکار می‌شود؛ کسی که بازیکن به او اعتماد داشته پنهانکاری کرده است.",
    "بازیکن مسیر میان‌بُر یا راه پنهانی می‌یابد که ریسک و پاداش دارد.",
    "جشن یا مراسمی محلی در جریان است و مردم سرگرم آن هستند.",
    "نگهبانان یا مأموران محلی بازیکن را برای بازرسی یا پرسش متوقف می‌کنند."
];

function rollDie(sides = 20, rng = Math.random) {
    return Math.floor(rng() * sides) + 1;
}

function rollCheck(level, rng = Math.random) {
    const roll = rollDie(20, rng);
    const bonus = Math.min(5, Math.floor((Number(level) || 1) / 3));
    const total = roll + bonus;

    let tier;
    if (roll === 1) {
        tier = "شکست فاجعه‌بار";
    } else if (roll === 20) {
        tier = "موفقیت درخشان";
    } else if (total <= 6) {
        tier = "شکست";
    } else if (total <= 11) {
        tier = "موفقیت ناقص با هزینه یا عارضه";
    } else if (total <= 17) {
        tier = "موفقیت";
    } else {
        tier = "موفقیت کامل";
    }

    return { roll, bonus, total, tier };
}

function repLabel(value) {
    const v = Number(value) || 0;
    if (v <= -60) return "دشمن";
    if (v <= -25) return "بدنام";
    if (v <= -5) return "بی‌اعتماد";
    if (v < 5) return "خنثی";
    if (v < 25) return "آشنا";
    if (v < 60) return "معتبر";
    return "قهرمان";
}

function pickRandomEvent(memory, rng = Math.random) {
    const turn = Number(memory.turn) || 0;
    const last = Number.isFinite(Number(memory.lastEventTurn))
        ? Number(memory.lastEventTurn)
        : -99;

    // چند نوبت اول بازی بدون رویداد تصادفی
    if (turn < 2) return null;
    if (turn - last < EVENT_COOLDOWN_TURNS) return null;
    if (rng() >= EVENT_CHANCE) return null;

    return RANDOM_EVENTS[Math.floor(rng() * RANDOM_EVENTS.length)];
}

function eventToText(e) {
    if (typeof e === "string") return e;
    try {
        return JSON.stringify(e);
    } catch {
        return "";
    }
}

function relevantNpcs(memory, textPool) {
    const npcs = Array.isArray(memory.npcs) ? memory.npcs : [];
    const pool = String(textPool || "");

    const hits = npcs.filter(
        n =>
            n &&
            n.name &&
            (pool.includes(n.name) ||
                (n.location && n.location === memory.location))
    );

    // تازه‌ترین‌ها اول
    hits.sort((a, b) => (b.lastSeenTurn || 0) - (a.lastSeenTurn || 0));
    return hits.slice(0, MAX_RELEVANT_NPCS);
}

function questLine(q, turn) {
    let line = q.name || "مأموریت";
    if (q.objective) line += ` — هدف: ${q.objective}`;
    if (Number.isFinite(q.deadlineTurn)) {
        const left = q.deadlineTurn - turn;
        line += left > 0
            ? ` (مهلت: ${left} نوبت)`
            : " (⚠️ مهلت تمام شده)";
    }
    return line;
}

/**
 * وضعیت فشرده‌ی بازی برای پرامپت (بدون combat، بدون فاصله‌ی اضافه)
 */
function compactState(memory, textPool = "") {
    const p = memory.player || {};
    const turn = Number(memory.turn) || 0;

    const inv =
        (memory.inventory || [])
            .map(i => `${i.name}×${i.quantity || 1}`)
            .join("، ") || "خالی";

    const quests =
        (memory.quests || [])
            .filter(q => q && !q.completed)
            .map(q => questLine(q, turn))
            .join(" | ") || "ندارد";

    const events =
        (memory.importantEvents || [])
            .slice(-RECENT_EVENTS)
            .map(eventToText)
            .filter(Boolean)
            .join(" | ") || "—";

    const npcs =
        relevantNpcs(memory, textPool)
            .map(n =>
                [n.name, n.role, n.attitude, n.note]
                    .filter(Boolean)
                    .join("|")
            )
            .join(" ; ") || "—";

    const rep =
        Object.entries(memory.reputation || {})
            .filter(([, v]) => Number(v) !== 0)
            .map(([k, v]) => `${k} ${v > 0 ? "+" : ""}${v} (${repLabel(v)})`)
            .join("، ") || "—";

    const w = memory.equipment?.weapon || {};
    const a = memory.equipment?.armor || {};

    // نقشه: مکان‌های شناخته‌شده و مسیرهای اطراف مکان فعلی
    let placesLine = "—";
    let routesLine = "—";

    if (memory.map && memory.map.locations) {
        const all = Object.values(memory.map.locations)
            .sort((x, y) => (y.lastTurn || 0) - (x.lastTurn || 0))
            .slice(0, MAX_KNOWN_PLACES)
            .map(l => l.name);

        if (all.length) placesLine = all.join("، ");

        const near = worldMap
            .neighborsOf(memory.map, memory.map.current)
            .map(l => l.name);

        if (near.length) routesLine = near.join("، ");
    }

    const currentWorld = world.getLocation(memory.location);
    const worldNeighbors = currentWorld ? world.neighbors(currentWorld.name) : [];
    const storyQuest = (memory.quests || []).find(q => q && q.storyQuest && !q.completed);
    const bible = memory.storyBible || {};
    const clues = (bible.clues || []).slice(-12)
        .map(c => `${c.id || "?"}|${c.title || "سرنخ"}|${c.status || "کشف‌شده"}|${c.details || ""}`)
        .join(" ; ") || "—";
    const decisions = (bible.decisions || []).slice(-8)
        .map(d => `${d.id || "?"}|${d.decision || ""}|${d.consequence || ""}`)
        .join(" ; ") || "—";
    const secrets = (bible.secrets || []).slice(-8)
        .map(s => `${s.id || "?"}|${s.title || ""}|${s.revealed ? "آشکار" : "پنهان"}|${s.details || ""}`)
        .join(" ; ") || "—";

    return [
        `=== اسکلت جهان ===`,
        `خط اصلی: ${world.MAIN_STORY.title} — ${world.MAIN_STORY.premise}`,
        `مکان‌های اصلی جهان: ${world.WORLD_LOCATIONS.map(l => l.name).join("، ")}`,
        `مسیرهای مجاز از مکان فعلی: ${worldNeighbors.join("، ") || "—"}`,
        `مرحله‌ی فعلی داستان: ${storyQuest ? storyQuest.objective : "آزاد"}`,
        `نوبت: ${turn + 1}`,
        `بازیکن: ${p.name || "؟"}|${p.class || "؟"}|سطح ${p.level}|HP ${p.hp}/${p.maxHp}|مانا ${p.mana}/${p.maxMana}|حمله ${p.attack}|دفاع ${p.defense}|طلا ${p.gold}`,
        `مکان: ${memory.location || "ناشناخته"}`,
        `مسیرهای شناخته‌شده از اینجا: ${routesLine}`,
        `مکان‌های شناخته‌شده: ${placesLine}`,
        `تجهیزات: ${w.name || "—"}، ${a.name || "—"}`,
        `کیف: ${inv}`,
        `مأموریت‌ها: ${quests}`,
        `NPCهای مرتبط: ${npcs}`,
        `شهرت: ${rep}`,
        `رویدادهای مهم: ${events}`,
        `خلاصه‌ی داستان تا اینجا: ${memory.summary || "—"}`,
        `کتاب مقدس داستان، سرنخ‌های قطعی: ${clues}`,
        `کتاب مقدس داستان، تصمیم‌های قطعی: ${decisions}`,
        `کتاب مقدس داستان، رازها: ${secrets}`,
        `شاخه‌ی فعلی داستان: ${bible.currentArc || "—"}`,
        `پرچم‌های داستان: ${JSON.stringify(bible.flags || {})}`
    ].join("\n");
}

/*
 * بخش ثابت پرامپت — همیشه اول می‌آید تا prefix caching کار کند.
 * هیچ داده‌ی متغیری نباید در این بخش باشد.
 */
const STATIC_RULES = `تو Game Master یک بازی RPG فارسی هستی.

وظیفه تو:
- داستان، دنیا، مکان‌ها، NPCها، مأموریت‌ها و اتفاقات را مدیریت کن و به فارسی بنویس.
- تصمیم‌های بازیکن را در داستان اعمال کن.
- وضعیت بازیکن را فقط وقتی لازم است تغییر بده.
- به NPCها شخصیت و حافظه بده: با توجه به «NPCهای مرتبط» و «شهرت» رفتار کنند.
- به خلاصه‌ی داستان و رویدادهای مهم وفادار بمان و با آن‌ها تناقض ایجاد نکن.
- کتاب مقدس داستان منبع حقیقت ساختاریافته است؛ سرنخ‌ها، رازها و تصمیم‌های ثبت‌شده را حذف یا بازنویسی نکن.
- اگر بازیکن سرنخ مهمی پیدا کرد، تصمیم مهمی گرفت یا راز تازه‌ای آشکار شد، آن را با شناسه‌ی ثابت در storyBible ثبت کن.
- پیشروی مأموریت اصلی فقط دست سرور است. هر نوبت در بخش «وضعیت سرنخ اصلی این نوبت» به تو گفته می‌شود چه مقدار از حقیقت را می‌توانی فاش کنی؛ دقیقاً از همان پیروی کن.
- اگر گفته شد «مجاز به آشکار کردن»، حقیقت داده‌شده را بدون تغییر محتوا و به شکلی طبیعی در روایت فاش کن و id آن را در storyBible.clues بنویس.
- اگر گفته شد «فقط نیمه‌سرنخ» یا «سرنخ اصلی اینجا نیست»، حقیقت را فاش نکن، معنای نشانه را حدس نزن و جواب قطعی نده؛ فقط فضا، تردید، نیمه‌سرنخ یا اشاره به مکان درست بده.
- خودت مأموریت اصلی را در addQuests نساز و objective آن را تغییر نده. سرنخ‌های اصلی را به‌جای دیگری نسبت نده و حقیقتی متناقض با آن‌ها نساز.

قانون ایموجی در روایت:
- در متن داستان هرجا حس صحنه را بهتر می‌کند، از ایموجی مناسب و کم‌حجم استفاده کن (مثلاً مکان، خطر، احساسات، اشیاء).
- زیاده‌روی نکن؛ در هر پاسخ فقط چند ایموجی کافی است، نه در هر کلمه.

قانون راوی مخالف:
- گاهی (نه در هر پاسخ) یک جمله‌ی کوتاه با لحن شک‌آمیز، کنایه‌آمیز یا مخالفِ روایت اصلی در پرانتز اضافه کن؛ انگار صدای دومی روایت را زیر سؤال می‌برد.
- حداکثر یک بار در هر پاسخ؛ اجباری نیست. اگر صحنه جدی یا شروع مبارزه است می‌توانی ننویسی.
- مثال فرم: (البته اگر حرفش راست باشد…) یا (یا شاید فقط بخت با او یار بوده.)
- این جمله بخشی از متن روایت است، نه JSON و نه توضیح متا.

قانون تاس:
- هر نوبت یک نتیجه‌ی تاس به تو داده می‌شود. فقط اگر اقدام بازیکن پرریسک یا نامطمئن است (مبارزه‌ی غیررسمی، دزدی، پرش، متقاعدسازی سخت و...) نتیجه را دقیقاً مطابق همان روایت کن و riskyAction را true بگذار.
- اگر اقدام ساده است (حرف زدن، راه رفتن، خرید، نگاه کردن) تاس را نادیده بگیر و riskyAction را false بگذار.
- هرگز نتیجه‌ی تاس را خلاف مقدارش روایت نکن.

قانون رویداد تصادفی:
- اگر در بخش وضعیت «رویداد تصادفی این نوبت» آمده، آن را به شکلی طبیعی در روایت بگنجان.

قانون انتخاب‌ها:
- **مهم: انتخاب‌ها را مطلقاً نساز. سرور خود انتخاب‌های منطقی را بر اساس مأموریت فعلی تولید می‌کند.**
- فقط روایت را بنویس. انتخاب‌های کلیدی توسط سرور مدیریت می‌شوند.

قانون مبارزه (بسیار مهم):
- مبارزه را سرور اجرا می‌کند. اگر در داستان درگیری شروع شود ولی combat.start را true نکنی، بازیکن هرگز وارد مبارزه نمی‌شود و بازی گیر می‌کند.
- combat.start را حتماً true کن وقتی هر کدام از این‌ها رخ داد:
  ۱) بازیکن به موجود یا شخصی حمله می‌کند (مثل «حمله می‌کنم»، «شمشیر می‌کشم و می‌زنمش»).
  ۲) موجود یا شخصی به بازیکن حمله می‌کند یا آماده‌ی حمله‌ی فوری است (گرگ می‌پرد، راهزن شمشیر می‌کشد).
  ۳) بازیکن آگاهانه به مواجهه‌ای وارد می‌شود که دشمن خصمانه و در دسترس است و درگیری اجتناب‌ناپذیر است.
- اگر هنوز فقط صدا، ردپا یا خطر دوردست هست و دشمنی حاضر نیست، combat.start را false بگذار.
- دشمن باید name (فارسی)، level، hp، attack، defense و description داشته باشد. راهنمای قدرت دشمن نسبت به سطح بازیکن: hp حدود ۳۰ + ۲۵×سطح، attack حدود ۶ + ۳×سطح، defense حدود ۲ + سطح.
- محاسبات مبارزه را سرور انجام می‌دهد؛ تو نتیجه را حساب نکن.
- مبارزه‌ی تصادفی، مینی‌باس‌ها و باس‌ها را سرور خودش وارد صحنه می‌کند. خودت مینی‌باس یا باس نساز و دشمن قدرتمند ویژه‌ای را بدون درخواست سرور وارد مبارزه نکن؛ فقط وقتی بازیکن مستقیماً به موجودی حمله کرد یا موجودی صراحتاً به او حمله کرد combat.start را true بگذار.

قانون NPCهای ثابت:
- در بخش وضعیت، «NPCهای ثابت این مکان» با حقایق قطعی‌شان آمده است. اگر بازیکن با آن‌ها صحبت کرد، با همان شخصیت و فقط با همان حقایق جواب بده. رازی که در حقایق نیامده از زبانشان نساز و حقایق را تغییر نده.
- خدمات (خرید، ارتقا، استراحت) را سرور از طریق دکمه‌های بازی انجام می‌دهد. خودت طلا کم یا زیاد نکن و اگر بازیکن خواست خرید کند، بگو از بخش فروشگاه یا دکمه‌ی استراحت استفاده کند.

قانون جان و مانا:
- جان و مانای بازیکن نه بعد از مبارزه و نه در داستان خودکار بازیابی می‌شود؛ فقط خود بازیکن با دکمه‌ی استراحت یا معجون بازیابی می‌کند.
- هرگز hp یا mana را در player افزایش نده. اگر بازیکن در داستان آسیب دید یا خسته شد می‌توانی مقدارشان را کم کنی.
- اگر بازیکن در داستان بخوابد یا استراحت کند، فقط روایت کن؛ بازیابی واقعی با دکمه‌ی استراحت انجام می‌شود. خستگی و زخم‌های او را در روایت حفظ کن.

قانون مأموریت‌ها:
- مأموریت اصلی خط داستان را همیشه روایت کن. پاسخ‌ها باید مرتبط و پیشرفت‌دهنده برای اهداف فعلی باشد.
- اگر بازیکن کاری بکند که بی‌ربط است (مثل جست‌وجو در مکان‌های دیگر درحالی‌که هنوز سرنخ اول رو پیدا نکرده)، تشویق کن که به مأموریت فعلی برگردد یا آن کار بدون نتیجه باشد.
- هر مأموریت جدید: name, description, objective (هدف مشخص) و deadlineInTurns (تعداد نوبت مهلت، یا null اگر مهلت ندارد).
- اگر مهلت مأموریتی تمام شده، عواقبش را روایت کن و آن را در removeQuests بگذار.

قانون دنیای ثابت و مسیرها:
- این بازی یک اسکلت داستانی محدود دارد؛ مکان‌های اصلی را از فهرست «مکان‌های اصلی جهان» بگیر و برای آن‌ها نام جایگزین نساز.
- برای سفر عادی، بازیکن فقط می‌تواند از مکان فعلی به یکی از «مسیرهای مجاز از مکان فعلی» برود. اگر بازیکن مقصد دوری را درخواست کرد، توضیح بده که باید از مسیرهای بین راه عبور کند و location را به مقصد دور تغییر نده.
- می‌توانی داخل هر مکان جزئیات، NPC، اتاق، مسیر فرعی و اتفاقات کوچک بسازی، اما مکان اصلی جدیدی به جهان اضافه نکن.
- خط اصلی «راز خاکستر و آب خاموش» باید به‌تدریج جلو برود، اما بازیکن برای رسیدن به سرنخ‌ها می‌تواند از مسیرهای مختلف و با انتخاب خودش استفاده کند.

قانون مکان و نقشه:
- تا بازیکن واقعاً به جای دیگری نرفته، location را تغییر نده.
- اگر به مکانی رفت که در «مکان‌های شناخته‌شده» هست، دقیقاً همان نام را در location بنویس (املای دیگر ننویس).
- برای مکان کاملاً جدید یک نام کوتاه و یکتا (حداکثر ۳ کلمه) بده و در locationNote یک جمله‌ی کوتاه برای توصیفش بنویس. برای مکان قبلاً دیده‌شده locationNote را null بگذار.

قانون NPC و شهرت:
- npcUpdates: برای هر NPC مهمی که وارد صحنه شد یا رابطه‌اش تغییر کرد: name, role, attitude, note (یک جمله‌ی کوتاه).
- reputation: تغییر شهرت با گروه‌ها به‌صورت عدد کوچک (مثلاً {"نگهبانان": 3, "دزدان": -5}). فقط وقتی کاری انجام شد که واقعاً روی آن گروه اثر دارد.

فرمت خروجی (بسیار مهم):
۱) اول فقط متن روایت (بدون JSON، بدون markdown).
۲) بعد در یک خط جدا دقیقاً این جداکننده: ${STATE_SEPARATOR}
۳) بعد فقط یک JSON معتبر با این ساختار، بدون code block، و بعد از آن هیچ چیز ننویس:

{
  "memory": {
    "player": {},
    "addItems": [],
    "removeItems": [],
    "location": null,
    "locationNote": null,
    "addQuests": [],
    "removeQuests": [],
    "importantEvent": null,
    "npcUpdates": [],
    "reputation": {},
    "storyBible": {
      "clues": [{"id": "clue_unique_id", "title": "عنوان", "status": "کشف‌شده|تأییدنشده|حل‌شده", "details": "حقیقت کوتاه"}],
      "decisions": [{"id": "decision_unique_id", "decision": "تصمیم بازیکن", "consequence": "پیامد قطعی"}],
      "secrets": [{"id": "secret_unique_id", "title": "راز", "details": "آنچه فعلاً قطعی است", "revealed": false}],
      "flags": {"flag_name": true},
      "currentArc": "مرحله‌ی فعلی داستان"
    }
  },
  "combat": { "start": false, "enemy": null },
  "riskyAction": false
}

اگر دشمن هست:
"combat": { "start": true, "enemy": { "name": "نام", "level": 1, "hp": 50, "attack": 10, "defense": 5, "description": "توضیح کوتاه" } }`;

function buildDynamicContext(memory, { textPool, dice, event, gate, travel }) {
    const lines = [
        "=== وضعیت فعلی بازی ===",
        compactState(memory, textPool),
        `تاس این نوبت (d20): ${dice.roll}${dice.bonus ? ` + ${dice.bonus}` : ""} = ${dice.total} → ${dice.tier}`
    ];

    if (gate) {
        const c = gate.clue;
        lines.push(`[توجه AI: این پاسخ مربوط به مأموریت اصلی است. اگر بازیکن تحقیق کند، حقیقت زیر را بر اساس وضعیت فاش کن:]`);
        let rule;
        if (gate.revealable) {
            rule = `مجاز به آشکار کردن. حقیقت ثابت این مرحله: «${c.truth}» — id: ${c.id}`;
        } else if (gate.atLocation) {
            rule = `فقط نیمه‌سرنخ؛ هنوز حقیقت را فاش نکن. نشانه‌های قابل استفاده: ${c.hint}`;
        } else {
            rule = `سرنخ اصلی این مرحله اینجا نیست؛ حقیقت را فاش نکن. اگر طبیعی بود فقط اشاره کن که باید در ${c.locations.join(" یا ")} جست‌وجو کرد.`;
        }
        lines.push(`وضعیت سرنخ اصلی این نوبت: ${rule}`);
    }

    if (travel) {
        lines.push(`سفر این نوبت: بازیکن به «${travel}» می‌رود. رسیدنش را روایت کن و در memory.location دقیقاً «${travel}» را بنویس.`);
    }

    if (event) {
        lines.push(`رویداد تصادفی این نوبت: ${event}`);
    }

    try {
        lines.push(...gameplay.promptLines(memory));
    } catch (err) {
        console.error("gameplay.promptLines:", err.message);
    }

    return lines.join("\n");
}

function buildSystemPrompt(memory, { textPool, dice, event, gate, travel }) {
    // ثابت اول، متغیر بعد
    return `${STATIC_RULES}\n\n${buildDynamicContext(memory, { textPool, dice, event, gate, travel })}`;
}

/*
 * مدل‌های کوچک وقتی تاریخچه بلند می‌شود قوانین اول پرامپت را فراموش می‌کنند.
 * این یادآوری کوتاه به انتهای آخرین پیام بازیکن اضافه می‌شود (فقط در درخواست، نه در ذخیره).
 */
const FORMAT_REMINDER =
    `[یادآوری سیستم: ۱) اول روایت. ۲) هیچ انتخاب یا گزینه‌ی شماره‌داری ننویس؛ سرور خودش انتخاب‌های مرتبط با مأموریت را اضافه می‌کند. ۳) بعد یک خط ${STATE_SEPARATOR} و سپس JSON. ` +
    `اگر بازیکن به دشمن حمله کرد یا دشمن به او حمله کرد، combat.start را true بگذار. جان و مانا را افزایش نده.]`;

/**
 * پیام‌های چت: فقط role و content، با ترتیب معتبر (بعضی مدل‌ها مثل Gemma
 * نقش‌های متناوب می‌خواهند)
 */
function buildChatMessages(systemPrompt, recentStory, userMessage) {
    const msgs = [];

    for (const m of Array.isArray(recentStory) ? recentStory : []) {
        if (!m || !m.content) continue;
        const role = m.role === "assistant" ? "assistant" : "user";
        const content = String(m.content);

        const last = msgs[msgs.length - 1];
        if (last && last.role === role) {
            last.content += `\n\n${content}`;
        } else {
            msgs.push({ role, content });
        }
    }

    // باید با user شروع شود
    while (msgs.length && msgs[0].role !== "user") {
        msgs.shift();
    }

    const last = msgs[msgs.length - 1];
    if (last && last.role === "user") {
        last.content += `\n\n${userMessage}`;
    } else {
        msgs.push({ role: "user", content: userMessage });
    }

    msgs[msgs.length - 1].content += `\n\n${FORMAT_REMINDER}`;

    return [{ role: "system", content: systemPrompt }, ...msgs];
}

/* =========================
   STREAM / OUTPUT PARSING
========================= */

function stripCodeFence(text) {
    return String(text || "")
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
}

function tryParseJson(text) {
    const cleaned = stripCodeFence(text);
    try {
        return JSON.parse(cleaned);
    } catch {
        const a = cleaned.indexOf("{");
        const b = cleaned.lastIndexOf("}");
        if (a !== -1 && b > a) {
            try {
                return JSON.parse(cleaned.slice(a, b + 1));
            } catch {
                return null;
            }
        }
        return null;
    }
}

/**
 * خروجی کامل مدل را به {narration, state} تبدیل می‌کند.
 * فرمت جدید:  روایت ###STATE### JSON
 * فرمت قدیمی (fallback): یک JSON با فیلد response
 */
function parseModelOutput(full) {
    const text = String(full || "");
    const idx = text.indexOf(STATE_SEPARATOR);

    if (idx !== -1) {
        return {
            narration: stripCodeFence(text.slice(0, idx)),
            state: tryParseJson(text.slice(idx + STATE_SEPARATOR.length))
        };
    }

    const trimmed = text.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("```")) {
        const legacy = tryParseJson(trimmed);
        if (legacy && typeof legacy === "object" && legacy.response) {
            return {
                narration: String(legacy.response).trim(),
                state: legacy
            };
        }
    }

    // فقط روایت، بدون state
    return { narration: trimmed, state: null };
}

function longestPrefixSuffix(text, sep) {
    const max = Math.min(text.length, sep.length - 1);
    for (let len = max; len > 0; len--) {
        if (sep.startsWith(text.slice(text.length - len))) {
            return len;
        }
    }
    return 0;
}

/**
 * استریم OpenAI را مصرف می‌کند. فقط متن قبل از جداکننده را به onDelta می‌دهد.
 * اگر خروجی با { یا ``` شروع شود (فرمت JSON قدیمی)، چیزی استریم نمی‌شود
 * تا JSON خام به بازیکن نشان داده نشود.
 */
async function consumeStream(stream, onDelta) {
    let full = "";
    let emitted = 0;
    let jsonMode = false;
    let decided = false;

    for await (const chunk of stream) {
        const piece = chunk?.choices?.[0]?.delta?.content;
        if (!piece) continue;

        full += piece;

        if (!decided) {
            const head = full.trimStart();
            if (head.length === 0) continue;
            decided = true;
            jsonMode = head.startsWith("{") || head.startsWith("```");
        }

        if (jsonMode) continue;

        const idx = full.indexOf(STATE_SEPARATOR);
        const safeEnd =
            idx !== -1
                ? idx
                : full.length - longestPrefixSuffix(full, STATE_SEPARATOR);

        if (safeEnd > emitted) {
            onDelta(full.slice(emitted, safeEnd));
            emitted = safeEnd;
        }
    }

    // اگر جداکنده نیامد، باقی‌مانده‌ی نگه‌داشته‌شده را بفرست
    if (!jsonMode && full.indexOf(STATE_SEPARATOR) === -1 && emitted < full.length) {
        onDelta(full.slice(emitted));
    }

    return full;
}

/*
 * حذف بلوک انتخاب‌های AI از انتهای روایت.
 * نسخه‌ی قبلی هر جای ۵۰۰ کاراکتر آخر که کلمه‌ی «انتخاب» یا «🎯» می‌دید روایت را می‌برید؛
 * این باعث می‌شد پیام «🎯 مأموریت جدید» و حتی جمله‌هایی مثل «قربانی از قبل انتخاب شده» پاک شوند.
 */
function stripChoices(text) {
    let t = String(text || "").trim();

    // ۱) سرتیتر استاندارد انتخاب‌ها
    const header = t.search(/(?:🎯\s*)?انتخاب(?:‌|\s)?های\s*پیش\s*رو\s*:?/);
    if (header !== -1) {
        return t.slice(0, header).trim();
    }

    // ۲) فهرست شماره‌دار در انتهای متن (۱) ... ۲) ...)
    const lines = t.split("\n");
    let end = lines.length;
    while (end > 0 && !lines[end - 1].trim()) end--;
    let i = end - 1;
    // خط «یا کار دیگری انجام بده»
    if (i >= 0 && /کار\s*دیگری/.test(lines[i])) i--;
    let numbered = 0;
    while (i >= 0 && /^\s*[-*•]?\s*[0-9۰-۹]\s*[\)\.\-]\s*\S/.test(lines[i])) {
        numbered++;
        i--;
    }
    if (numbered >= 2) {
        return lines.slice(0, i + 1).join("\n").trim();
    }
    return t;
}

/* =========================
   CHOICES (تضمین دو انتخاب)
========================= */

function hasChoices(text) {
    const t = String(text || "");
    if (t.includes("🎯") || t.includes("انتخاب‌های پیش رو")) return true;
    return /[۱1]\s*[\)\-\.]/.test(t) && /[۲2]\s*[\)\-\.]/.test(t);
}

function buildChoicesMessages(narration, quests = [], location = "") {
    const active = (Array.isArray(quests) ? quests : [])
        .filter(q => q && !q.completed)
        .slice(0, 4)
        .map(q => `- ${q.name}: ${q.objective || q.description || ""}`)
        .join("\n");
    return [
        {
            role: "system",
            content:
                "تو دستیار یک بازی RPG فارسی هستی. روایت زیر تازه نوشته شده. " +
                "دقیقاً دو انتخاب کوتاه (هرکدام حداکثر ۱۰ کلمه) و متفاوت برای ادامه‌ی بازیکن بنویس. " +
                (active
                    ? "هر دو انتخاب باید مستقیماً بازیکن را به انجام یکی از مأموریت‌های فعال زیر نزدیک‌تر کنند (رفتن به مکان لازم، پرسیدن از شخص مرتبط، بررسی سرنخ، تحویل آیتم و...). انتخاب بی‌ربط به مأموریت ننویس.\n" +
                      `مأموریت‌های فعال:\n${active}\n`
                    : "انتخاب‌ها باید با اتفاقات همین روایت جور باشند.\n") +
                (location ? `مکان فعلی بازیکن: ${location}\n` : "") +
                "فقط با این قالب و هیچ متن دیگری:\n" +
                "🎯 انتخاب‌های پیش رو:\n۱) ...\n۲) ...\nیا کار دیگری انجام بده."
        },
        { role: "user", content: String(narration || "").slice(-700) }
    ];
}

/* خروجی مدل را به قالب ثابت تبدیل می‌کند؛ اگر دو گزینه نداشت رشته‌ی خالی */
function cleanChoices(text) {
    const t = String(text || "");
    const m1 = t.match(/[۱1]\s*[\)\-\.]\s*(.+)/);
    const m2 = t.match(/[۲2]\s*[\)\-\.]\s*(.+)/);
    if (!m1 || !m2) return "";
    const a = m1[1].trim().slice(0, 120);
    const b = m2[1].trim().slice(0, 120);
    if (!a || !b) return "";
    return `🎯 انتخاب‌های پیش رو:\n۱) ${a}\n۲) ${b}\nیا کار دیگری انجام بده.`;
}

/* =========================
   SANITIZERS
========================= */

function normalizeQuest(q, turn) {
    if (!q || typeof q !== "object" || !q.name) return null;

    const out = {
        name: String(q.name).slice(0, 80),
        description: String(q.description || "").slice(0, 300),
        objective: String(q.objective || "").slice(0, 200),
        createdTurn: turn
    };

    const d = Number(q.deadlineInTurns);
    if (Number.isFinite(d) && d > 0) {
        out.deadlineTurn = turn + Math.min(Math.floor(d), 200);
    }

    if (typeof q.completed === "boolean") {
        out.completed = q.completed;
    }

    return out;
}

function normalizeNpc(n) {
    if (!n || typeof n !== "object" || !n.name) return null;
    return {
        name: String(n.name).slice(0, 40),
        role: n.role ? String(n.role).slice(0, 40) : undefined,
        attitude: n.attitude ? String(n.attitude).slice(0, 30) : undefined,
        note: n.note ? String(n.note).slice(0, 140) : undefined
    };
}

/* =========================
   SUMMARY PROMPT
========================= */

function buildSummaryMessages(prevSummary, messages) {
    const transcript = messages
        .map(m => `${m.role === "assistant" ? "راوی" : "بازیکن"}: ${m.content}`)
        .join("\n");

    return [
        {
            role: "system",
            content:
                "تو خلاصه‌نویس حافظه‌ی یک بازی RPG فارسی هستی. خلاصه‌ی قبلی و ماجراهای جدید را در یک خلاصه‌ی واحد ۱۰۰ تا ۱۵۰ کلمه‌ای ادغام کن. فقط حقایق مهم را نگه دار: نام شخصیت‌ها و رابطه‌شان با بازیکن، قول‌ها و بدهی‌ها، تصمیم‌های مهم، رازها و هدف فعلی. اگر چیزی قطعی نیست آن را قطعی ننویس. توصیف ادبی ننویس. فقط متن خلاصه را برگردان."
        },
        {
            role: "user",
            content: `خلاصه‌ی قبلی:\n${prevSummary || "—"}\n\nماجراهای جدید:\n${transcript}`
        }
    ];
}

module.exports = {
    STATE_SEPARATOR,
    SUMMARY_EVERY_TURNS,
    RECENT_MESSAGES,
    rollCheck,
    pickRandomEvent,
    repLabel,
    compactState,
    buildSystemPrompt,
    buildChatMessages,
    parseModelOutput,
    hasChoices,
    buildChoicesMessages,
    cleanChoices,
    FORMAT_REMINDER,
    consumeStream,
    stripChoices,
    normalizeQuest,
    normalizeNpc,
    buildSummaryMessages
};
