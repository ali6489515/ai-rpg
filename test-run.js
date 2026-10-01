"use strict";

const { call, inSession, gm, gameplay, content } = require("./test-harness");

const SID = "testsession_economy_01";
let passed = 0;
let failed = 0;

function ok(cond, label, extra = "") {
    if (cond) { passed++; console.log(`  ✔ ${label}`); }
    else { failed++; console.log(`  ✘ ${label} ${extra}`); }
}

const L = content.LOC;

async function setup(patch) {
    await inSession(SID, () => {
        gm.resetGame();
        const m = gm.loadPermanentMemory();
        patch && patch(m);
        gm.savePermanentMemory(m);
    });
}

async function main() {

    console.log("\n[1] location-info در دهکده");
    await setup();
    let r = await call(SID, "GET", "/location-info");
    ok(r.body.info.npcs.length === 3, "۳ NPC در دهکده", JSON.stringify(r.body.info.npcs.map(n => n.name)));
    ok(r.body.info.shop && r.body.info.shop.items.length === 4, "فروشگاه دهکده ۴ کالا دارد");
    ok(r.body.info.rest.kind === "inn" && r.body.info.rest.cost === 17, "استراحت مسافرخانه سطح ۱ = ۱۷ طلا", String(r.body.info.rest.cost));
    ok(r.body.info.upgrades && r.body.info.upgrades.weapon.cost === 80, "ارتقای سلاح اول = ۸۰ طلا");

    console.log("\n[2] خرید و ارتقا");
    r = await call(SID, "POST", "/shop/buy", { item: "healthPotion" });
    ok(r.status === 200, "خرید معجون");
    let gold = (await call(SID, "GET", "/location-info"), await inSession(SID, () => gm.loadPermanentMemory().player.gold));
    ok(gold === 75, "طلا بعد از معجون = ۷۵", String(gold));
    r = await call(SID, "POST", "/shop/buy", { item: "ironSword" });
    ok(r.status === 400, "شمشیر ۱۵۰ با ۷۵ طلا رد می‌شود");
    r = await call(SID, "POST", "/shop/buy", { item: "knightSword" });
    ok(r.status === 400, "کالای بازار در دهکده فروخته نمی‌شود");
    await setup(m => { m.player.gold = 2000; });
    r = await call(SID, "POST", "/shop/buy", { item: "ironSword" });
    ok(r.status === 200, "خرید شمشیر آهنی با ۲۰۰۰ طلا");
    r = await call(SID, "POST", "/shop/buy", { item: "ironSword" });
    ok(r.status === 400, "خرید دوباره‌ی همان شمشیر رد می‌شود (بهتر نیست)");
    for (let i = 0; i < 5; i++) {
        r = await call(SID, "POST", "/shop/upgrade", { slot: "weapon" });
        ok(r.status === 200, `ارتقای سلاح ${i + 1}`, JSON.stringify(r.body));
    }
    r = await call(SID, "POST", "/shop/upgrade", { slot: "weapon" });
    ok(r.status === 400, "ارتقای ششم رد می‌شود (حداکثر ۵)");
    const eq = await inSession(SID, () => gm.loadPermanentMemory().equipment.weapon);
    ok(eq.attack === 8 + 10 && eq.tier === 5, "حمله‌ی سلاح = ۸ + ۱۰ و tier=5", JSON.stringify(eq));
    const spentGold = await inSession(SID, () => gm.loadPermanentMemory().player.gold);
    ok(spentGold === 2000 - 150 - (80 + 160 + 280 + 450 + 700), "کل هزینه‌ی ارتقا درست کسر شد", String(spentGold));

    console.log("\n[3] قفل سطح در بازار");
    await setup(m => { m.player.gold = 5000; m.location = L.market; });
    r = await call(SID, "POST", "/shop/buy", { item: "knightSword" });
    ok(r.status === 400 && /سطح/.test(r.body.error), "شمشیر شوالیه برای سطح ۱ قفل است", r.body.error);
    await setup(m => { m.player.gold = 5000; m.player.level = 4; m.location = L.market; });
    r = await call(SID, "POST", "/shop/buy", { item: "knightSword" });
    ok(r.status === 200, "با سطح ۴ خرید می‌شود");
    r = await call(SID, "POST", "/shop/upgrade", { slot: "weapon" });
    ok(r.status === 400, "ارتقا در بازار ممکن نیست (فقط دهکده)");

    console.log("\n[4] استراحت پولی");
    await setup(m => { m.player.hp = 10; m.player.mana = 0; m.player.gold = 0; });
    r = await call(SID, "POST", "/rest");
    ok(r.status === 400, "بدون طلا استراحت نمی‌شود", JSON.stringify(r.body));
    await setup(m => { m.player.hp = 10; m.player.mana = 0; m.player.gold = 100; });
    r = await call(SID, "POST", "/rest");
    let p = await inSession(SID, () => gm.loadPermanentMemory().player);
    ok(r.status === 200 && p.hp === 100 && p.mana === 50 && p.gold === 83, "مسافرخانه: کامل و ۱۷ طلا", JSON.stringify(p));
    await setup(m => { m.player.hp = 10; m.player.mana = 0; m.player.gold = 100; m.location = L.forest; });
    r = await call(SID, "POST", "/rest");
    p = await inSession(SID, () => gm.loadPermanentMemory().player);
    ok(r.status === 200 && p.hp === 60 && p.mana === 25 && p.gold === 93, "اردو: نصف جان/مانا و ۷ طلا", JSON.stringify(p));

    console.log("\n[5] برخورد: مکان امن و نرخ‌ها");
    await setup();
    let encVillage = 0;
    for (let i = 0; i < 300; i++) {
        const m = await inSession(SID, () => gm.loadPermanentMemory());
        if (gameplay.rollEncounter(m)) encVillage++;
    }
    ok(encVillage === 0, "در دهکده هرگز برخورد نیست");

    await setup(m => { m.location = L.forest; m.turn = 50; });
    let normal = 0, mini = 0;
    for (let i = 0; i < 2000; i++) {
        const m = await inSession(SID, () => gm.loadPermanentMemory());
        const e = gameplay.rollEncounter(m);
        if (e && e.enemy.type === "normal") normal++;
        if (e && e.enemy.type === "mini_boss") mini++;
    }
    ok(mini === 0, "مینی‌باس قبل از ۳ نوبت حضور ظاهر نمی‌شود");
    ok(normal > 450 && normal < 750, `نرخ مبارزه‌ی معمولی حدود ۳۰٪ (${(normal / 20).toFixed(1)}٪)`);

    await setup(m => { m.location = L.forest; m.turn = 50; m.progress.turnsAt[L.forest] = 3; });
    normal = 0; mini = 0;
    for (let i = 0; i < 2000; i++) {
        const m = await inSession(SID, () => gm.loadPermanentMemory());
        const e = gameplay.rollEncounter(m);
        if (e && e.enemy.type === "normal") normal++;
        if (e && e.enemy.type === "mini_boss") mini++;
    }
    ok(mini > 700 && mini < 1100, `بعد از ۳ نوبت مینی‌باس حدود ۴۵٪ (${(mini / 20).toFixed(1)}٪)`);

    await setup(m => { m.location = L.forest; m.turn = 50; m.progress.turnsAt[L.forest] = 9; m.progress.defeatedBosses.mini_forest = 10; });
    mini = 0;
    for (let i = 0; i < 500; i++) {
        const m = await inSession(SID, () => gm.loadPermanentMemory());
        const e = gameplay.rollEncounter(m);
        if (e && e.enemy.type === "mini_boss") mini++;
    }
    ok(mini === 0, "مینی‌باس شکست‌خورده دیگر ظاهر نمی‌شود");

    await setup(m => { m.location = L.forest; m.turn = 11; m.progress.lastCombatTurn = 10; });
    let cool = 0;
    for (let i = 0; i < 300; i++) {
        const m = await inSession(SID, () => gm.loadPermanentMemory());
        if (gameplay.rollEncounter(m)) cool++;
    }
    ok(cool === 0, "بلافاصله بعد از مبارزه، آرامش (cooldown) برقرار است");

    console.log("\n[6] باس‌ها");
    await setup(m => { m.location = L.cave; m.turn = 30; });
    let early = 0;
    for (let i = 0; i < 300; i++) {
        const x = gameplay.rollEncounter(await inSession(SID, () => gm.loadPermanentMemory()));
        if (x && x.enemy.type === "boss") early++;
    }
    ok(early === 0, "باس غار قبل از سرنخ ۵ ظاهر نمی‌شود");
    await setup(m => {
        m.location = L.cave; m.turn = 30;
        m.storyBible.clues.push({ id: "main_clue_5", title: "x", status: "کشف‌شده" });
    });
    let e = gameplay.rollEncounter(await inSession(SID, () => gm.loadPermanentMemory()));
    ok(e && e.enemy.type === "boss" && e.enemy.id === "boss_cave", "بعد از سرنخ ۵ باس غار ظاهر می‌شود", JSON.stringify(e && e.enemy.name));
    e = gameplay.rollEncounter(await inSession(SID, () => gm.loadPermanentMemory()), { traveling: true });
    ok(!e || e.enemy.type !== "boss", "در نوبت ورود (سفر) باس ظاهر نمی‌شود");

    console.log("\n[7] آخرین سرنخ ← باس نهایی ← تکمیل خط اصلی");
    await setup(m => {
        m.location = L.lake; m.turn = 40;
        const q = m.quests.find(x => x.storyQuest);
        q.stage = 7;
    });
    const res7 = await inSession(SID, () => {
        const mem = gm.loadPermanentMemory();
        const gate = gm.getClueGate(mem, "ژرفای دریاچه را بررسی می‌کنم و کاوش می‌کنم");
        gm.progressStoryQuest(gate, { clueIds: [], narration: "" });           // minTurns=3 → هنوز نه
        gm.progressStoryQuest(gm.getClueGate(gm.loadPermanentMemory(), "کاوش"), { clueIds: [], narration: "" });
        const gate3 = gm.getClueGate(gm.loadPermanentMemory(), "ژرفای دریاچه را بررسی می‌کنم");
        const result = gm.progressStoryQuest(gate3, { clueIds: ["main_clue_7"], narration: "" });
        const afterQuest = gm.loadPermanentMemory().quests.find(x => x.storyQuest);
        return {
            result,
            completed: afterQuest.completed,
            pending: afterQuest.finalBossPending,
            gateAfter: gm.getClueGate(gm.loadPermanentMemory(), "بررسی می‌کنم")
        };
    });
    ok(res7.result && res7.result.finalPending === true && res7.result.completed === false, "سرنخ ۷ فقط حالت «در انتظار باس» می‌گذارد", JSON.stringify(res7.result));
    ok(res7.completed !== true && res7.pending === true, "خط اصلی هنوز کامل نشده");
    ok(res7.gateAfter === null, "گیت سرنخ بعد از آن بسته است (تکرار نمی‌شود)");
    e = gameplay.rollEncounter(await inSession(SID, () => gm.loadPermanentMemory()));
    ok(e && e.enemy.id === "boss_lake" && e.enemy.finalBoss, "باس نهایی دریاچه ظاهر می‌شود");

    console.log("\n[8] مبارزه‌ی واقعی با باس (هندلرهای /attack و /potion)");
    await setup(m => {
        m.location = L.lake; m.turn = 40; m.player.level = 8; m.player.hp = 3000; m.player.maxHp = 3000;
        m.player.attack = 40; m.player.defense = 14; m.player.criticalChance = 0; m.player.gold = 100;
        m.quests.find(x => x.storyQuest).stage = 7;
        m.quests.find(x => x.storyQuest).finalBossPending = true;
        m.equipment.weapon = { name: "تست", attack: 20, tier: 0 };
    });
    await inSession(SID, () => {
        const enc = gameplay.rollEncounter(gm.loadPermanentMemory());
        gm.startCombat(enc.enemy);
    });
    let rounds = 0, lastBody = null, enraged = false;
    while (rounds < 200) {
        rounds++;
        r = await call(SID, "POST", "/attack", {});
        lastBody = r.body;
        if (r.body.enemyResult && /خشمگین/.test(r.body.enemyResult.message || "")) enraged = true;
        if (r.body.result === "enemy-defeated" || (r.body.enemyResult && r.body.enemyResult.defeated)) break;
    }
    ok(lastBody.result === "enemy-defeated", `باس نهایی در ${rounds} دور شکست خورد`, JSON.stringify(lastBody).slice(0, 200));
    ok(enraged, "باس در جان کم خشمگین شد");
    const after = await inSession(SID, () => gm.loadPermanentMemory());
    const q7 = after.quests.find(x => x.storyQuest);
    ok(q7.completed === true, "خط اصلی بعد از شکست باس نهایی کامل شد");
    ok(after.progress.defeatedBosses.boss_lake > 0, "باس در progress ثبت شد");
    ok(lastBody.rewards && lastBody.rewards.gold >= 300, `پاداش طلای باس ≥ ۳۰۰ (${lastBody.rewards && lastBody.rewards.gold})`);
    ok(lastBody.rewards && lastBody.rewards.lootMessage, "جایزه‌ی تجهیزات اعلام شد", String(lastBody.rewards && lastBody.rewards.lootMessage));
    ok(after.equipment.armor.name === "پوسته‌ی ژرفا", "زره‌ی باس تجهیز شد", after.equipment.armor.name);
    e = gameplay.rollEncounter(after);
    ok(!e || e.enemy.type !== "boss", "باس شکست‌خورده دوباره ظاهر نمی‌شود");

    console.log("\n[9] شکست و جریمه");
    await setup(m => {
        m.location = L.cave; m.turn = 40; m.player.gold = 200; m.player.hp = 1; m.player.maxHp = 100;
        m.player.defense = 0;
    });
    await inSession(SID, () => {
        gm.startCombat({ name: "قوی", level: 5, hp: 999, attack: 80, defense: 0, type: "normal" });
    });
    r = await call(SID, "POST", "/defend", {});
    p = await inSession(SID, () => gm.loadPermanentMemory());
    ok(r.body && r.body.enemyResult && r.body.enemyResult.defeated === true, "بازیکن شکست خورد", JSON.stringify(r.body).slice(0, 160));
    ok(p.player.gold === 150, `۲۵٪ طلا از دست رفت (۲۰۰→${p.player.gold})`);
    ok(p.player.hp === 30, `با ۳۰٪ جان بیدار شد (${p.player.hp})`);
    ok(p.location === L.village, `به دهکده برگشت (${p.location})`);
    ok(p.combat.active === false, "مبارزه پایان یافت");

    console.log("\n[10] عوارض و پرامپت");
    await setup(m => { m.location = L.tower; m.player.gold = 10; });
    const toll = gameplay.tollFor(L.pass);
    ok(toll === 25, "عوارض گردنه ۲۵ طلا");
    const prompt = require("./memory/storyEngine").buildSystemPrompt(
        await inSession(SID, () => { const m = gm.loadPermanentMemory(); m.location = L.cave; return m; }),
        { textPool: "", dice: { roll: 5, bonus: 0, total: 5, tier: "t" }, event: null, gate: null, travel: null }
    );
    ok(prompt.includes("بابک غارنشین") && prompt.includes("جسدِ متحرک"), "پرامپت NPC و دشمنان غار را دارد");

    // پاک‌سازی
    await inSession(SID, () => gm.deleteSession(SID));

    console.log(`\nنتیجه: ${passed} موفق، ${failed} ناموفق`);
    process.exit(failed ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });
