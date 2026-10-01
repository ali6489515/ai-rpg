
// ==================================================
// SAFE DOM HELPERS
// ==================================================

function getElement(id) {
    return document.getElementById(id);
}

console.log("CLIENT.JS LOADED!");


// ==================================================
// SESSION (هر بازیکن وضعیت جداگانه دارد)
// ==================================================

const SESSION_KEY = "rpg_session_id";


function generateSessionId() {
    // اولویت با شناسه کاربر تلگرام
    try {
        const tgUser =
            window.Telegram &&
            window.Telegram.WebApp &&
            window.Telegram.WebApp.initDataUnsafe &&
            window.Telegram.WebApp.initDataUnsafe.user;

        if (tgUser && tgUser.id) {
            return "tg" + String(tgUser.id);
        }
    } catch {
        // ignore
    }

    if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID().replace(/-/g, "");
    }

    return (
        "s" +
        Date.now().toString(36) +
        Math.random().toString(36).slice(2, 12)
    );
}


function getSessionId() {
    // در مینی‌اپ تلگرام همیشه از user id استفاده کن
    try {
        const tgUser =
            window.Telegram &&
            window.Telegram.WebApp &&
            window.Telegram.WebApp.initDataUnsafe &&
            window.Telegram.WebApp.initDataUnsafe.user;

        if (tgUser && tgUser.id) {
            const id = "tg" + String(tgUser.id);
            localStorage.setItem(SESSION_KEY, id);
            return id;
        }
    } catch {
        // ignore
    }

    let id = localStorage.getItem(SESSION_KEY);

    if (!id || id.length < 8) {
        id = generateSessionId();
        localStorage.setItem(SESSION_KEY, id);
    }

    return id;
}


function newSession() {
    // در تلگرام session به کاربر قفل است؛ فقط حافظه بازی ریست می‌شود
    try {
        const tgUser =
            window.Telegram &&
            window.Telegram.WebApp &&
            window.Telegram.WebApp.initDataUnsafe &&
            window.Telegram.WebApp.initDataUnsafe.user;

        if (tgUser && tgUser.id) {
            const id = "tg" + String(tgUser.id);
            localStorage.setItem(SESSION_KEY, id);
            return id;
        }
    } catch {
        // ignore
    }

    const id = generateSessionId();
    localStorage.setItem(SESSION_KEY, id);
    return id;
}


function initTelegramWebApp() {
    try {
        const tg = window.Telegram && window.Telegram.WebApp;
        if (!tg) {
            return;
        }

        tg.ready();
        tg.expand();

        if (tg.setHeaderColor) {
            tg.setHeaderColor("#1a1a2e");
        }
        if (tg.setBackgroundColor) {
            tg.setBackgroundColor("#0f0f1a");
        }
    } catch (err) {
        console.warn("Telegram WebApp init:", err);
    }
}


function setText(element, value) {

    if (!element) {
        return;
    }

    element.textContent = value ?? "";
}


function showElement(element) {

    if (!element) {
        return;
    }

    element.classList.remove("hidden");
}


function hideElement(element) {

    if (!element) {
        return;
    }

    element.classList.add("hidden");
}


function setDisabled(element, value) {

    if (!element) {
        return;
    }

    element.disabled = value;
}


// ==================================================
// DOM
// ==================================================

const characterCreation =
    getElement("characterCreation");

const characterForm =
    getElement("characterForm");

const characterName =
    getElement("characterName");

const characterClass =
    getElement("characterClass");

const createCharacterButton =
    getElement("createCharacterButton");


const messageSection =
    getElement("messageSection");

const messageForm =
    getElement("messageForm");

const messageInput =
    getElement("messageInput");


const gameLog =
    getElement("gameLog");


const combatPanel =
    getElement("combatPanel");

const combatTurn =
    getElement("combatTurn");

const enemyName =
    getElement("enemyName");

const enemyLevel =
    getElement("enemyLevel");

const enemyHp =
    getElement("enemyHp");

const enemyHpBar =
    getElement("enemyHpBar");

const attackButton =
    getElement("attackButton");

const skillButton =
    getElement("skillButton");

const defendButton =
    getElement("defendButton");

const potionButton =
    getElement("potionButton");

const runButton =
    getElement("runButton");

const combatResult =
    getElement("combatResult");

const skillSelectPanel =
    getElement("skillSelectPanel");

const skillSelectList =
    getElement("skillSelectList");

const skillSelectClose =
    getElement("skillSelectClose");


const playerName =
    getElement("playerName");

const playerClass =
    getElement("playerClass");

const playerLevel =
    getElement("playerLevel");

const playerXp =
    getElement("playerXp");

const xpBar =
    getElement("xpBar");

const playerHp =
    getElement("playerHp");

const playerHpBar =
    getElement("playerHpBar");

const playerMana =
    getElement("playerMana");

const playerManaBar =
    getElement("playerManaBar");

const playerAttack =
    getElement("playerAttack");

const playerDefense =
    getElement("playerDefense");

const playerCritical =
    getElement("playerCritical");

const playerGold =
    getElement("playerGold");

const playerLocation =
    getElement("playerLocation");


const stripName =
    getElement("stripName");

const stripClass =
    getElement("stripClass");

const stripLevel =
    getElement("stripLevel");

const stripGold =
    getElement("stripGold");

const stripHp =
    getElement("stripHp");

const stripHpBar =
    getElement("stripHpBar");

const stripMana =
    getElement("stripMana");

const stripManaBar =
    getElement("stripManaBar");

const stripXp =
    getElement("stripXp");

const stripXpBar =
    getElement("stripXpBar");

const shopTabButton =
    getElement("shopTabButton");


const inventoryList =
    getElement("inventoryList");

const equipmentList =
    getElement("equipmentList");

const questList =
    getElement("questList");

const mapSvg =
    getElement("mapSvg");

const mapViewport =
    getElement("mapViewport");

const mapDetail =
    getElement("mapDetail");

const mapEmpty =
    getElement("mapEmpty");


const restButton =
    getElement("restButton");

const resetButton =
    getElement("resetButton");


const shopButtons =
    document.querySelectorAll("[data-shop]");


// ==================================================
// REQUEST
// ==================================================

async function request(url, options = {}) {

    let response;

    const sessionId = getSessionId();

    const headers = {
        "Content-Type": "application/json",
        "X-Session-Id": sessionId,
        ...(options.headers || {})
    };

    try {

        response =
            await fetch(
                url,
                {
                    ...options,
                    headers
                }
            );

    } catch (error) {

        throw new Error(
            "ارتباط با سرور برقرار نشد. لطفاً کمی بعد دوباره تلاش کن."
        );
    }


    let data = null;


    try {

        data =
            await response.json();

    } catch {

        data = null;
    }


    if (!response.ok) {

        throw new Error(
            data?.error ||
            `خطای سرور: ${response.status}`
        );
    }


    return data;
}


// ==================================================
// STREAM MESSAGE (NDJSON)
// ==================================================
// سرور خطوط JSON می‌فرستد:
// {type:"delta",text} ... {type:"final",...} یا {type:"error",error}

async function streamMessage(message, onDelta) {

    let response;

    try {

        response =
            await fetch(
                "/message",
                {
                    method: "POST",

                    headers: {
                        "Content-Type": "application/json",
                        "X-Session-Id": getSessionId()
                    },

                    body:
                        JSON.stringify({
                            message
                        })
                }
            );

    } catch (error) {

        throw new Error(
            "ارتباط با سرور برقرار نشد. لطفاً کمی بعد دوباره تلاش کن."
        );
    }


    // خطاهای قبل از شروع استریم (مثلاً ۴۰۰) JSON معمولی هستند
    if (!response.ok) {

        let data = null;

        try {
            data = await response.json();
        } catch {
            data = null;
        }

        throw new Error(
            data?.error ||
            `خطای سرور: ${response.status}`
        );
    }


    const reader =
        response.body.getReader();

    const decoder =
        new TextDecoder();

    let buffer = "";

    let final = null;


    const handleLine = line => {

        if (!line.trim()) {
            return;
        }

        let event;

        try {
            event = JSON.parse(line);
        } catch {
            return;
        }

        if (event.type === "delta") {

            onDelta(event.text || "");

        } else if (event.type === "final") {

            final = event;

        } else if (event.type === "error") {

            throw new Error(
                event.error || "خطا در ارتباط با AI."
            );
        }
    };


    while (true) {

        const { done, value } =
            await reader.read();

        if (done) {
            break;
        }

        buffer +=
            decoder.decode(
                value,
                { stream: true }
            );

        let newline;

        while (
            (newline = buffer.indexOf("\n")) !== -1
        ) {

            handleLine(
                buffer.slice(0, newline)
            );

            buffer =
                buffer.slice(newline + 1);
        }
    }

    handleLine(buffer);


    if (!final) {

        throw new Error(
            "پاسخ سرور ناقص بود. دوباره تلاش کن."
        );
    }

    return final;
}


// ==================================================
// NORMALIZE STATE
// ==================================================
// سرور بعضی جاها memory برمی‌گرداند
// و بعضی جاها state.
// این تابع هر دو حالت را به یک شکل تبدیل می‌کند.

function normalizeState(data) {

    if (!data) {
        return null;
    }


    if (data.memory) {

        return {
            ...data.memory,

            combat:
                data.combat ||
                data.memory.combat ||
                null
        };
    }


    if (data.state) {

        return {
            ...data.state,

            combat:
                data.combat ||
                data.state.combat ||
                null
        };
    }


    return data;
}


// ==================================================
// GAME LOG
// ==================================================

function addLogMessage(type, text) {

    if (!gameLog) {
        return;
    }


    const message =
        document.createElement("div");


    if (type === "user") {

        message.className =
            "message user-message";

        message.textContent = text;

    } else if (type === "ai") {

        message.className =
            "message ai-message";

        message.textContent = text;

    } else {

        message.className =
            "system-message";

        message.textContent =
            text;
    }


    gameLog.appendChild(message);


    gameLog.scrollTop =
        gameLog.scrollHeight;

    return message;
}


// ==================================================
// PLAYER UI
// ==================================================

function setBarWidth(bar, value, max) {

    if (!bar) {
        return;
    }

    const percent =
        max > 0
            ? (value / max) * 100
            : 0;

    bar.style.width =
        `${Math.min(100, Math.max(0, percent))}%`;
}


function updatePlayerUI(state) {

    if (
        !state ||
        !state.player
    ) {
        return;
    }


    const player =
        state.player;


    setText(
        playerName,
        player.name || "-"
    );


    setText(
        playerClass,
        player.class || "-"
    );


    setText(
        playerLevel,
        player.level ?? 1
    );


    const xpNeeded =
        player.xpNeeded ??
        player.nextXp ??
        100;


    const xpText =
        `${player.xp ?? 0} / ${xpNeeded}`;


    const hpText =
        `${player.hp ?? 0} / ${player.maxHp ?? 0}`;


    const manaText =
        `${player.mana ?? 0} / ${player.maxMana ?? 0}`;


    setText(playerXp, xpText);

    setBarWidth(
        xpBar,
        player.xp ?? 0,
        xpNeeded
    );


    setText(playerHp, hpText);

    setBarWidth(
        playerHpBar,
        player.hp ?? 0,
        player.maxHp ?? 0
    );


    setText(playerMana, manaText);

    setBarWidth(
        playerManaBar,
        player.mana ?? 0,
        player.maxMana ?? 0
    );


    /* Status strip (همیشه در دید) */

    setText(
        stripName,
        player.name || "-"
    );

    setText(
        stripClass,
        player.class || "-"
    );

    setText(
        stripLevel,
        player.level ?? 1
    );

    setText(
        stripGold,
        player.gold ?? 0
    );

    setText(stripHp, hpText);

    setBarWidth(
        stripHpBar,
        player.hp ?? 0,
        player.maxHp ?? 0
    );

    setText(stripMana, manaText);

    setBarWidth(
        stripManaBar,
        player.mana ?? 0,
        player.maxMana ?? 0
    );

    setText(stripXp, xpText);

    setBarWidth(
        stripXpBar,
        player.xp ?? 0,
        xpNeeded
    );


    const weaponBonus =
        Number(
            state.equipment?.weapon?.attack || 0
        );


    const armorBonus =
        Number(
            state.equipment?.armor?.defense || 0
        );


    const totalAttack =
        Number(player.attack ?? 0) +
        weaponBonus;


    const totalDefense =
        Number(player.defense ?? 0) +
        armorBonus;


    setText(
        playerAttack,
        weaponBonus > 0
            ? `${totalAttack} (${player.attack}+${weaponBonus})`
            : totalAttack
    );


    setText(
        playerDefense,
        armorBonus > 0
            ? `${totalDefense} (${player.defense}+${armorBonus})`
            : totalDefense
    );


    setText(
        playerCritical,
        `${player.criticalChance ?? 0}%`
    );


    setText(
        playerGold,
        player.gold ?? 0
    );


    setText(
        playerLocation,
        player.location ||
        state.location ||
        "نامشخص"
    );
}


// ==================================================
// INVENTORY
// ==================================================

function updateInventory(inventory) {

    if (!inventoryList) {
        return;
    }


    inventoryList.innerHTML = "";


    if (
        !Array.isArray(inventory) ||
        inventory.length === 0
    ) {

        const empty =
            document.createElement("div");


        empty.className =
            "empty-message";


        empty.textContent =
            "Inventory خالی است.";


        inventoryList.appendChild(empty);

        return;
    }


    inventory.forEach(item => {

        if (!item) {
            return;
        }


        const div =
            document.createElement("div");


        div.className =
            "inventory-item";


        const name =
            document.createElement("span");


        name.textContent =
            item.name || "Unknown";


        const quantity =
            document.createElement("strong");


        quantity.textContent =
            `x${item.quantity ?? 0}`;


        div.appendChild(name);

        div.appendChild(quantity);


        inventoryList.appendChild(div);

    });
}


// ==================================================
// EQUIPMENT
// ==================================================

function updateEquipment(equipment) {

    if (!equipmentList) {
        return;
    }


    equipmentList.innerHTML = "";


    const weapon =
        equipment?.weapon;


    const armor =
        equipment?.armor;


    const weaponDiv =
        document.createElement("div");


    weaponDiv.className =
        "equipment-item";


    const weaponName =
        document.createElement("span");


    weaponName.textContent =
        `⚔️ ${weapon?.name || "-"}`;


    const weaponAttack =
        document.createElement("strong");


    weaponAttack.textContent =
        `+${weapon?.attack ?? 0}`;


    weaponDiv.appendChild(weaponName);

    weaponDiv.appendChild(weaponAttack);


    equipmentList.appendChild(weaponDiv);


    const armorDiv =
        document.createElement("div");


    armorDiv.className =
        "equipment-item";


    const armorName =
        document.createElement("span");


    armorName.textContent =
        `🛡️ ${armor?.name || "-"}`;


    const armorDefense =
        document.createElement("strong");


    armorDefense.textContent =
        `+${armor?.defense ?? 0}`;


    armorDiv.appendChild(armorName);

    armorDiv.appendChild(armorDefense);


    equipmentList.appendChild(armorDiv);
}


// ==================================================
// QUESTS
// ==================================================

function updateQuests(quests, turn) {

    if (!questList) {
        return;
    }


    questList.innerHTML = "";


    if (
        !Array.isArray(quests) ||
        quests.length === 0
    ) {

        const empty =
            document.createElement("div");


        empty.className =
            "empty-message";


        empty.textContent =
            "مأموریتی وجود ندارد.";


        questList.appendChild(empty);

        return;
    }


    quests.forEach(quest => {

        if (!quest) {
            return;
        }


        const div =
            document.createElement("div");


        div.className =
            "quest-item";


        const title =
            document.createElement("strong");


        title.textContent =
            `${quest.completed ? "✅" : "📜"} ${quest.name || "مأموریت"}`;


        const description =
            document.createElement("p");


        description.textContent =
            quest.description || "";


        div.appendChild(title);

        div.appendChild(description);


        if (quest.objective) {

            const objective =
                document.createElement("p");

            objective.textContent =
                `🎯 هدف: ${quest.objective}`;

            div.appendChild(objective);
        }


        if (
            !quest.completed &&
            Number.isFinite(quest.deadlineTurn) &&
            Number.isFinite(turn)
        ) {

            const left =
                quest.deadlineTurn - turn;

            const deadline =
                document.createElement("p");

            deadline.textContent =
                left > 0
                    ? `⏳ مهلت: ${left} نوبت`
                    : "⚠️ مهلت تمام شده";

            div.appendChild(deadline);
        }


        questList.appendChild(div);

    });
}


// ==================================================
// FULL UI
// ==================================================

let lastInventory = [];


function updateGameUI(data) {

    const state =
        normalizeState(data);


    if (!state) {
        return;
    }


    if (Array.isArray(state.inventory)) {
        lastInventory = state.inventory;
    }


    updatePlayerUI(state);

    updateInventory(
        state.inventory
    );

    updateEquipment(
        state.equipment
    );

    updateQuests(
        state.quests,
        Number(state.turn)
    );

    renderMap(state);
}


// ==================================================
// MAP (نقشه‌ی مکان‌های کشف‌شده)
// ==================================================

const MAP_UNIT = 88;      // پیکسل برای هر واحد مختصات
const MAP_PAD_X = 74;
const MAP_PAD_Y = 52;
const SVG_NS = "http://www.w3.org/2000/svg";

let mapSelectedId = null;
let lastMapState = null;


function mapNormalize(name) {

    // باید با world.locationKey در سرور یکی باشد
    return String(name || "")
        .replace(/\u06C0/g, "\u0647")
        .replace(/[\u064B-\u065F\u0640\u200d\u200e\u200f]/g, "")
        .replace(/[يى]/g, "ی")
        .replace(/ك/g, "ک")
        .replace(/\u0647[\s\u200c]+\u06CC(?=[\s\u200c]|$)/g, "\u0647")
        .replace(/[\s\u200c]+/g, "")
        .toLowerCase();
}


function svgEl(tag, attrs = {}) {

    const node =
        document.createElementNS(SVG_NS, tag);

    Object.entries(attrs).forEach(
        ([k, v]) => node.setAttribute(k, v)
    );

    return node;
}


function shortLabel(name) {

    const text = String(name || "");

    return text.length > 14
        ? `${text.slice(0, 13)}…`
        : text;
}


function renderMap(state) {

    if (!mapSvg || !state) {
        return;
    }

    lastMapState = state;

    const map = state.map;

    const locations =
        map && map.locations
            ? Object.values(map.locations)
            : [];

    mapSvg.innerHTML = "";

    if (locations.length === 0) {

        showElement(mapEmpty);

        hideElement(mapDetail);

        return;
    }

    hideElement(mapEmpty);


    const xs = locations.map(l => Number(l.x) || 0);
    const ys = locations.map(l => Number(l.y) || 0);

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const width =
        Math.max(
            300,
            (maxX - minX) * MAP_UNIT + MAP_PAD_X * 2
        );

    const height =
        Math.max(
            220,
            (maxY - minY) * MAP_UNIT + MAP_PAD_Y * 2
        );

    const offsetX =
        (width - (maxX - minX) * MAP_UNIT) / 2;

    const offsetY =
        (height - (maxY - minY) * MAP_UNIT) / 2;

    const pos = id => {

        const loc = map.locations[id];

        return {
            x: offsetX + ((Number(loc.x) || 0) - minX) * MAP_UNIT,
            y: offsetY + ((Number(loc.y) || 0) - minY) * MAP_UNIT
        };
    };

    mapSvg.setAttribute("width", width);
    mapSvg.setAttribute("height", height);
    mapSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);


    // مسیرها
    (map.edges || []).forEach(([a, b]) => {

        if (!map.locations[a] || !map.locations[b]) {
            return;
        }

        const p1 = pos(a);
        const p2 = pos(b);

        mapSvg.appendChild(
            svgEl("line", {
                x1: p1.x,
                y1: p1.y,
                x2: p2.x,
                y2: p2.y,
                class: "map-edge"
            })
        );
    });


    // مکان‌ها
    locations.forEach(loc => {

        const p = pos(loc.id);

        const isCurrent = loc.id === map.current;

        const group = svgEl("g", {
            class:
                "map-node" +
                (isCurrent ? " map-node-current" : "") +
                (loc.discovered === false ? " map-node-locked" : "") +
                (loc.id === mapSelectedId ? " map-node-selected" : ""),
            tabindex: "0",
            role: "button",
            "data-id": loc.id
        });

        if (isCurrent) {

            group.appendChild(
                svgEl("circle", {
                    cx: p.x,
                    cy: p.y,
                    r: 26,
                    class: "map-pulse"
                })
            );
        }

        group.appendChild(
            svgEl("circle", {
                cx: p.x,
                cy: p.y,
                r: isCurrent ? 17 : 13,
                class: "map-dot"
            })
        );

        const label = svgEl("text", {
            x: p.x,
            y: p.y + (isCurrent ? 38 : 34),
            "text-anchor": "middle",
            class: "map-label"
        });

        label.textContent = shortLabel(loc.name);

        const title = svgEl("title");

        title.textContent = loc.name;

        group.appendChild(title);

        group.appendChild(label);

        const select = () => {

            mapSelectedId = loc.id;

            renderMap(lastMapState);

            showMapDetail(loc.id);
        };

        group.addEventListener("click", select);

        group.addEventListener("keydown", event => {

            if (
                event.key === "Enter" ||
                event.key === " "
            ) {

                event.preventDefault();

                select();
            }
        });

        mapSvg.appendChild(group);
    });


    // نقشه را روی مکان فعلی وسط می‌آوریم
    if (mapViewport && map.locations[map.current]) {

        const c = pos(map.current);

        mapViewport.scrollLeft =
            Math.max(0, c.x - mapViewport.clientWidth / 2);

        mapViewport.scrollTop =
            Math.max(0, c.y - mapViewport.clientHeight / 2);
    }


    if (
        mapSelectedId &&
        map.locations[mapSelectedId]
    ) {

        showMapDetail(mapSelectedId);

    } else {

        mapSelectedId = null;

        hideElement(mapDetail);
    }
}


function showMapDetail(id) {

    if (
        !mapDetail ||
        !lastMapState ||
        !lastMapState.map ||
        !lastMapState.map.locations[id]
    ) {
        return;
    }

    const state = lastMapState;

    const loc = state.map.locations[id];

    const isCurrent = id === state.map.current;
    const adjacent = (state.map.edges || []).some(([a, b]) =>
        (a === state.map.current && b === id) ||
        (b === state.map.current && a === id)
    );

    const npcs =
        (state.npcs || []).filter(
            n =>
                n &&
                n.location &&
                mapNormalize(n.location) === mapNormalize(loc.name)
        );

    mapDetail.innerHTML = "";

    const title = document.createElement("h3");

    title.textContent =
        `${isCurrent ? "📍 " : ""}${loc.name}`;

    mapDetail.appendChild(title);


    const description = document.createElement("p");

    description.className = "map-detail-text";

    description.textContent =
        loc.description || "توصیفی ثبت نشده است.";

    mapDetail.appendChild(description);


    const meta = document.createElement("p");

    meta.className = "map-detail-meta";

    meta.textContent = loc.discovered === false
        ? `🔒 هنوز کشف نشده — مسیر مستقیم: ${adjacent ? "دارد" : "ندارد"}`
        : `🚶 تعداد دفعات حضور: ${loc.visits || 1}`;

    mapDetail.appendChild(meta);


    if (npcs.length > 0) {

        const list = document.createElement("p");

        list.className = "map-detail-meta";

        list.textContent =
            "👥 " +
            npcs
                .map(n => n.role ? `${n.name} (${n.role})` : n.name)
                .join("، ");

        mapDetail.appendChild(list);
    }


    if (isCurrent) {

        const here = document.createElement("p");

        here.className = "map-detail-meta";

        here.textContent = "اینجا هستی.";

        mapDetail.appendChild(here);

    } else if (adjacent) {

        const go = document.createElement("button");

        go.type = "button";

        go.className = "map-go-button";

        go.textContent = "🚶 برو به اینجا";

        go.addEventListener("click", () => travelTo(loc.name));

        mapDetail.appendChild(go);
    } else {
        const hint = document.createElement("p");
        hint.className = "map-detail-meta";
        hint.textContent = "🧭 برای رسیدن به این مکان باید از مسیرهای بین راه عبور کنی.";
        mapDetail.appendChild(hint);
    }

    showElement(mapDetail);
}


function travelTo(name) {

    // در مبارزه یا قبل از ساخت شخصیت ورودی پیام دیده نمی‌شود
    if (
        !messageSection ||
        messageSection.classList.contains("hidden") ||
        !messageInput ||
        !messageForm
    ) {

        alert("در حال حاضر نمی‌توانی سفر کنی.");

        return;
    }

    messageInput.value =
        `به ${name} می‌روم.`;

    setMobileView("story");

    if (typeof messageForm.requestSubmit === "function") {

        messageForm.requestSubmit();

    } else {

        messageForm.dispatchEvent(
            new Event(
                "submit",
                { cancelable: true, bubbles: true }
            )
        );
    }
}


// ==================================================
// COMBAT UI
// ==================================================

function showCombat(combat) {

    if (
        !combat ||
        !combat.active ||
        !combat.enemy
    ) {

        hideCombat();

        return;
    }


    showElement(combatPanel);

    hideElement(messageSection);

    setShopAvailable(false);

    hideSkillSelect();


    const enemy =
        combat.enemy;


    setText(
        enemyName,
        enemy.name || "Enemy"
    );


    setText(
        enemyLevel,
        enemy.level || 1
    );


    setText(
        enemyHp,
        `${enemy.hp ?? 0} / ${enemy.maxHp ?? 0}`
    );


    if (enemyHpBar) {

        const percent =
            enemy.maxHp > 0
                ? (
                    enemy.hp /
                    enemy.maxHp
                ) * 100
                : 0;


        enemyHpBar.style.width =
            `${Math.min(
                100,
                Math.max(
                    0,
                    percent
                )
            )}%`;
    }


    const playerTurn =
        combat.turn === "player";


    setText(
        combatTurn,
        playerTurn
            ? "نوبت شما"
            : "نوبت دشمن"
    );


    setDisabled(
        attackButton,
        !playerTurn
    );


    setDisabled(
        skillButton,
        !playerTurn
    );


    setDisabled(
        defendButton,
        !playerTurn
    );


    setDisabled(
        potionButton,
        !playerTurn
    );


    setDisabled(
        runButton,
        !playerTurn
    );
}


function setShopAvailable(available) {

    if (shopTabButton) {

        shopTabButton.disabled =
            !available;
    }


    const mobileShopTab =
        getElement("mobileShopTab");


    if (mobileShopTab) {

        mobileShopTab.disabled =
            !available;
    }


    const shopPanel =
        getElement("shopPanel");


    if (shopPanel) {

        shopPanel.classList.toggle(
            "shop-disabled",
            !available
        );
    }


    // اگر در تب فروشگاه بودیم و مبارزه شروع شد → برو وضعیت / داستان
    if (!available) {

        if (
            getElement("tab-shop") &&
            !getElement("tab-shop")
                .classList
                .contains("hidden")
        ) {

            switchSidebarTab("status");
        }


        if (
            document.body.classList.contains(
                "mobile-view-shop"
            )
        ) {

            setMobileView("story");
        }
    }
}


function setMobileView(view) {

    const views = [
        "story",
        "status",
        "bag",
        "map",
        "shop"
    ];


    if (!views.includes(view)) {

        view = "story";
    }


    // فروشگاه در مبارزه بسته است
    if (
        view === "shop" &&
        getElement("mobileShopTab")?.disabled
    ) {

        return;
    }


    views.forEach(v => {

        document.body.classList.toggle(
            `mobile-view-${v}`,
            v === view
        );
    });


    document.querySelectorAll(
        ".mobile-nav-btn"
    ).forEach(btn => {

        btn.classList.toggle(
            "active",
            btn.dataset.mobileView === view
        );
    });


    // همگام‌سازی تب داخلی سایدبار
    if (view === "status") {

        switchSidebarTab("status");

    } else if (view === "bag") {

        switchSidebarTab("bag");

    } else if (view === "map") {

        switchSidebarTab("map");

    } else if (view === "shop") {

        switchSidebarTab("shop");
    }


    window.scrollTo(0, 0);
}


function switchSidebarTab(tabId) {

    const tabs =
        document.querySelectorAll(
            ".sidebar-tab"
        );


    const panels =
        document.querySelectorAll(
            ".tab-panel"
        );


    tabs.forEach(tab => {

        tab.classList.toggle(
            "active",
            tab.dataset.tab === tabId
        );
    });


    panels.forEach(panel => {

        const isTarget =
            panel.id ===
            `tab-${tabId}`;


        panel.classList.toggle(
            "hidden",
            !isTarget
        );

        panel.classList.toggle(
            "active",
            isTarget
        );
    });
}


function hideCombat() {

    hideElement(combatPanel);

    // قبل از ساخت شخصیت، ورودی و دکمه‌ی ارسال نباید نمایش داده شود
    if (
        characterCreation &&
        !characterCreation.classList.contains("hidden")
    ) {

        hideElement(messageSection);

    } else {

        showElement(messageSection);
    }

    setText(
        combatResult,
        ""
    );

    hideSkillSelect();

    setShopAvailable(true);
}


// ==================================================
// COMBAT RESPONSE
// ==================================================

function handleCombatResponse(data) {

    if (!data) {
        return;
    }


    const state =
        normalizeState(data);


    if (state) {

        updateGameUI(state);
    }


    const combat =
        data.combat ||
        state?.combat;


    if (
        combat &&
        combat.active
    ) {

        showCombat(combat);

    } else {

        hideCombat();
    }


    let text = "";


    if (data.message) {

        text +=
            data.message;
    }


    if (data.enemyResult) {

        if (text) {
            text += "\n";
        }


        text +=
            data.enemyResult.message ||
            (data.enemyResult.damage
                ? `دشمن ${data.enemyResult.damage} آسیب زد.`
                : "");
    }


    const rewards =
        data.rewards ||
        data.reward;


    if (rewards) {

        if (text) {
            text += "\n";
        }


        text +=
            `⭐ تجربه: ${rewards.xp ?? 0}`;


        if (rewards.gold) {

            text +=
                ` | 💰 طلا: ${rewards.gold}`;
        }


        if (
            Number(rewards.levelUps) > 0
        ) {

            text +=
                `\n🎉 ارتقای سطح! (+${rewards.levelUps} سطح)`;
        }

        // جان و مانا خودکار پر نمی‌شود؛ بازیکن را راهنمایی می‌کنیم
        const after =
            state?.player ||
            data.memory?.player;

        if (
            after &&
            (
                Number(after.hp) < Number(after.maxHp) ||
                Number(after.mana) < Number(after.maxMana)
            )
        ) {

            text +=
                "\n💡 جان و مانایت خودکار پر نمی‌شود؛ از دکمه‌ی «🛏️ استراحت و بازیابی» در تب وضعیت استفاده کن.";
        }
    }


    if (data.escaped === true) {

        if (!text) {
            text =
                data.message ||
                "از مبارزه فرار کردی.";
        }
    }


    if (text) {

        setText(
            combatResult,
            text
        );

        addLogMessage(
            "system",
            text
        );
    }


    if (data.storyAfterCombat) {

        // مثل بقیه پیام‌های داستانی AI
        addLogMessage(
            "ai",
            data.storyAfterCombat
        );
    }


    if (
        data.enemyResult?.defeated
    ) {

        addLogMessage(
            "system",
            "💀 شخصیتت شکست خورد. می‌توانی بازی را از نو شروع کنی."
        );
    }
}


// ==================================================
// CHARACTER CREATION
// ==================================================

let selectedClassKey = "warrior";

function setupClassCards() {
    const cards = document.querySelectorAll(".class-card");
    if (!cards.length) {
        return;
    }

    cards.forEach(card => {
        card.addEventListener("click", () => {
            cards.forEach(c => c.classList.remove("selected"));
            card.classList.add("selected");
            selectedClassKey = card.dataset.class || "warrior";

            const hidden = document.getElementById("characterClass");
            if (hidden) {
                hidden.value = selectedClassKey;
            }
        });
    });
}

setupClassCards();

if (characterForm) {

    characterForm.addEventListener(
        "submit",
        async function(event) {

            event.preventDefault();


            const name =
                characterName?.value
                    ?.trim() || "";


            const selectedClass =
                selectedClassKey ||
                characterClass?.value ||
                "warrior";


            if (!name) {

                alert(
                    "لطفاً نام شخصیت را وارد کن."
                );

                return;
            }


            setDisabled(
                createCharacterButton,
                true
            );


            if (createCharacterButton) {

                createCharacterButton.textContent =
                    "در حال ساخت...";
            }


            try {

                const data =
                    await request(
                        "/create-character",
                        {
                            method: "POST",

                            body:
                                JSON.stringify({
                                    name,

                                    class:
                                        selectedClass
                                })
                        }
                    );


                /*
                 * سرور memory برمی‌گرداند،
                 * نه state
                 */

                const state =
                    normalizeState(data);


                hideElement(
                    characterCreation
                );


                showElement(
                    messageSection
                );


                updateGameUI(state);


                if (gameLog) {

                    gameLog.innerHTML = "";
                }


                addLogMessage(
                    "system",
                    `🎉 ${name} وارد دنیای بازی شد!`
                );


                // پیام افتتاحیه AI (توضیح مکان و شروع داستان)
                if (data?.response) {

                    addLogMessage(
                        "ai",
                        data.response
                    );

                } else {

                    addLogMessage(
                        "ai",
                        "🌄 در دهکده‌ی آغازین ایستاده‌ای. ماجراجویی تو از اینجا آغاز می‌شود..."
                    );
                }


                if (characterName) {

                    characterName.value =
                        "";
                }


                messageInput?.focus();

            } catch (error) {

                console.error(
                    "CREATE CHARACTER ERROR:",
                    error
                );


                alert(
                    error.message
                );

            } finally {

                setDisabled(
                    createCharacterButton,
                    false
                );


                if (createCharacterButton) {

                    createCharacterButton.textContent =
                        "شروع ماجراجویی";
                }
            }
        }
    );
}


// ==================================================
// SEND MESSAGE
// ==================================================

if (messageForm) {

    messageForm.addEventListener(
        "submit",
        async function(event) {

            event.preventDefault();


            const message =
                messageInput?.value
                    ?.trim() || "";


            if (!message) {
                return;
            }


            setDisabled(
                messageInput,
                true
            );


            try {

                addLogMessage(
                    "user",
                    message
                );


                if (messageInput) {

                    messageInput.value =
                        "";
                }


                let bubble = null;

                let streamed = "";


                const data =
                    await streamMessage(
                        message,
                        text => {

                            streamed += text;

                            if (!bubble) {

                                bubble =
                                    addLogMessage(
                                        "ai",
                                        ""
                                    );
                            }

                            bubble.textContent = streamed;

                            gameLog.scrollTop =
                                gameLog.scrollHeight;
                        }
                    );


                if (data?.response) {

                    // متن نهایی (بدون بخش‌های حذف‌شده) جایگزین متن استریم می‌شود
                    if (bubble) {

                        bubble.textContent = data.response;

                    } else {

                        addLogMessage(
                            "ai",
                            data.response
                        );
                    }
                }


                if (data?.dice?.used) {

                    addLogMessage(
                        "system",
                        `🎲 تاس: ${data.dice.roll}` +
                        (data.dice.bonus
                            ? ` (+${data.dice.bonus})`
                            : "") +
                        ` = ${data.dice.total} — ${data.dice.tier}`
                    );
                }


                if (data?.memory) {

                    updateGameUI(
                        data.memory
                    );
                }


                if (
                    data?.combat &&
                    data.combat.active
                ) {

                    showCombat(
                        data.combat
                    );

                } else {

                    hideCombat();
                }

            } catch (error) {

                console.error(
                    "MESSAGE ERROR:",
                    error
                );


                addLogMessage(
                    "system",
                    `❌ ${error.message}`
                );

            } finally {

                if (
                    !combatPanel ||
                    combatPanel.classList.contains(
                        "hidden"
                    )
                ) {

                    setDisabled(
                        messageInput,
                        false
                    );
                }


                messageInput?.focus();
            }
        }
    );
}


// ==================================================
// COMBAT REQUEST
// ==================================================

async function combatRequest(
    endpoint,
    body = {}
) {

    setDisabled(
        attackButton,
        true
    );

    setDisabled(
        skillButton,
        true
    );

    setDisabled(
        defendButton,
        true
    );

    setDisabled(
        potionButton,
        true
    );

    setDisabled(
        runButton,
        true
    );


    try {

        const data =
            await request(
                endpoint,
                {
                    method: "POST",

                    body:
                        JSON.stringify(body)
                }
            );


        handleCombatResponse(
            data
        );

    } catch (error) {

        setText(
            combatResult,
            `❌ ${error.message}`
        );

    } finally {

        try {

            const data =
                await request(
                    "/combat-state"
                );


            const combat =
                data?.combat ||
                data;


            if (
                combat &&
                combat.active
            ) {

                showCombat(
                    combat
                );

            } else {

                hideCombat();
            }

        } catch (error) {

            console.error(
                "COMBAT STATE ERROR:",
                error
            );
        }
    }
}


// ==================================================
// TIMING BAR (نوار زمان‌بندی)
// ==================================================
// سبز = آسیب زیاد ، زرد = متوسط ، قرمز = کم
// کلاینت فقط می‌گوید «چند میلی‌ثانیه بعد از شروع کلیک کردم»؛
// رنگ و ضریب آسیب را سرور خودش حساب می‌کند.

function timingPosition(bar, elapsedMs) {

    const cycle =
        2 * bar.sweepMs;

    const c =
        (((elapsedMs / cycle) + bar.phase) % 1 + 1) % 1;

    return c < 0.5
        ? c * 2
        : 2 - c * 2;
}


function playTimingBar(bar) {

    return new Promise(resolve => {

        const panel =
            document.getElementById("timingPanel");

        const track =
            document.getElementById("timingTrack");

        const marker =
            document.getElementById("timingMarker");

        const stopButton =
            document.getElementById("timingStopButton");


        if (!panel || !track || !marker) {

            resolve(null);

            return;
        }


        track
            .querySelectorAll(".timing-zone")
            .forEach(node => node.remove());


        bar.zones.forEach(zone => {

            const div =
                document.createElement("div");

            div.className =
                `timing-zone timing-${zone.id}`;

            div.style.left =
                `${zone.from * 100}%`;

            div.style.width =
                `${(zone.to - zone.from) * 100}%`;

            track.insertBefore(div, marker);
        });


        showElement(panel);


        const MIN_CLICK_MS = 200;

        const AUTO_STOP_MS = 12000;

        const startedAt =
            performance.now();

        let stopped = false;

        let frameId = 0;


        function finish(rawElapsed) {

            if (stopped) {
                return;
            }

            stopped = true;

            // همان عددی که به سرور می‌رود؛ نشانگر دقیقاً روی همان نقطه می‌ایستد
            const elapsed =
                Math.round(rawElapsed);

            cancelAnimationFrame(frameId);

            marker.style.left =
                `${timingPosition(bar, elapsed) * 100}%`;

            document.removeEventListener(
                "keydown",
                onKey
            );

            track.removeEventListener(
                "click",
                onStop
            );

            if (stopButton) {

                stopButton.removeEventListener(
                    "click",
                    onStop
                );
            }

            // نشانگر لحظه‌ای می‌ایستد تا بازیکن ببیند کجا ایستاد
            setTimeout(() => {

                hideElement(panel);

                resolve({
                    elapsedMs: elapsed
                });

            }, 450);
        }


        function onStop() {

            const elapsed =
                performance.now() - startedAt;

            // کلیک‌های خیلی زود (مثلاً همان کلیکی که نوار را باز کرد) نادیده گرفته می‌شود
            if (elapsed < MIN_CLICK_MS) {
                return;
            }

            finish(elapsed);
        }


        function onKey(event) {

            if (
                event.code === "Space" ||
                event.code === "Enter"
            ) {

                event.preventDefault();

                onStop();
            }
        }


        function frame() {

            if (stopped) {
                return;
            }

            const elapsed =
                performance.now() - startedAt;

            marker.style.left =
                `${timingPosition(bar, elapsed) * 100}%`;

            if (elapsed >= AUTO_STOP_MS) {

                finish(elapsed);

                return;
            }

            frameId =
                requestAnimationFrame(frame);
        }


        document.addEventListener(
            "keydown",
            onKey
        );

        track.addEventListener(
            "click",
            onStop
        );

        if (stopButton) {

            stopButton.addEventListener(
                "click",
                onStop
            );
        }


        frameId =
            requestAnimationFrame(frame);
    });
}


async function timedCombatRequest(
    endpoint,
    startBody,
    body = {}
) {

    setDisabled(attackButton, true);
    setDisabled(skillButton, true);
    setDisabled(defendButton, true);
    setDisabled(potionButton, true);
    setDisabled(runButton, true);


    let shot = {};

    try {

        const bar =
            await request(
                "/timing/start",
                {
                    method: "POST",

                    body:
                        JSON.stringify(startBody)
                }
            );

        if (bar && bar.barId) {

            const result =
                await playTimingBar(bar);

            if (result) {

                shot = {
                    barId: bar.barId,
                    elapsedMs: result.elapsedMs
                };
            }
        }

    } catch (error) {

        // بدون نوار ادامه می‌دهیم؛ خطای واقعی (مثل کمبود مانا)
        // را خود endpoint اصلی دوباره برمی‌گرداند
        console.warn(
            "TIMING START:",
            error.message
        );
    }


    return combatRequest(
        endpoint,
        {
            ...body,
            ...shot
        }
    );
}


// ==================================================
// ATTACK
// ==================================================

if (attackButton) {

    attackButton.addEventListener(
        "click",
        function() {

            timedCombatRequest(
                "/attack",
                { action: "attack" }
            );
        }
    );
}


// ==================================================
// DEFEND
// ==================================================

if (defendButton) {

    defendButton.addEventListener(
        "click",
        function() {

            combatRequest(
                "/defend"
            );
        }
    );
}


// ==================================================
// SKILL SELECT PANEL
// ==================================================

function hideSkillSelect() {

    hideElement(skillSelectPanel);

    if (skillSelectList) {

        skillSelectList.innerHTML = "";
    }
}


function showSkillSelect(skills, combo) {

    if (
        !skillSelectPanel ||
        !skillSelectList
    ) {
        return;
    }


    const headerLabel =
        skillSelectPanel.querySelector(
            ".skill-select-header span"
        );

    if (headerLabel) {
        headerLabel.textContent = "✨ انتخاب مهارت";
    }


    skillSelectList.innerHTML = "";


    if (combo) {

        const comboBar =
            document.createElement(
                "div"
            );


        comboBar.className =
            "combo-info";


        const names =
            Array.isArray(
                combo.sequenceNames
            )
                ? combo.sequenceNames
                : [];


        const step =
            Number(combo.step) || 0;


        const stepsHtml =
            names.map(
                (name, i) => {

                    let cls =
                        "combo-step";

                    if (i < step) {
                        cls +=
                            " done";
                    }

                    if (
                        i === step &&
                        step < names.length
                    ) {
                        cls +=
                            " next";
                    }

                    return `<span class="${cls}">${i + 1}. ${name}</span>`;
                }
            ).join(
                `<span class="combo-arrow">→</span>`
            );


        comboBar.innerHTML =
            `<div class="combo-title">🔥 کمبو: ${combo.name} (${step}/${combo.total})</div>` +
            `<div class="combo-chain">${stepsHtml}</div>`;


        skillSelectList.appendChild(
            comboBar
        );
    }


    skills.forEach(skill => {

        const button =
            document.createElement(
                "button"
            );


        button.type = "button";

        button.className =
            "skill-option";


        if (skill.isNextInCombo) {

            button.classList.add(
                "skill-option-next"
            );
        }


        const comboBadge =
            skill.isNextInCombo
                ? `<span class="skill-combo-badge">مرحله بعد کمبو</span>`
                : (skill.comboStep
                    ? `<span class="skill-combo-badge muted">کمبو ${skill.comboStep}</span>`
                    : "");


        button.innerHTML =
            `<span class="skill-option-name">${skill.name} ${comboBadge}</span>` +
            `<span class="skill-option-meta">💙 ${skill.manaCost} مانا  ·  ×${skill.multiplier}</span>` +
            `<span class="skill-option-desc">${skill.description || ""}</span>`;


        button.addEventListener(
            "click",
            function() {

                hideSkillSelect();

                timedCombatRequest(
                    "/skill",
                    {
                        action: "skill",
                        skill: skill.id
                    },
                    {
                        skill: skill.id
                    }
                );
            }
        );


        skillSelectList.appendChild(
            button
        );
    });


    showElement(skillSelectPanel);
}


if (skillSelectClose) {

    skillSelectClose.addEventListener(
        "click",
        hideSkillSelect
    );
}


// ==================================================
// SKILL
// ==================================================

if (skillButton) {

    skillButton.addEventListener(
        "click",
        async function() {

            try {

                // اگر پنل باز است، ببند
                if (
                    skillSelectPanel &&
                    !skillSelectPanel.classList.contains(
                        "hidden"
                    )
                ) {

                    hideSkillSelect();

                    return;
                }


                const data =
                    await request(
                        "/skills"
                    );


                const skills =
                    Array.isArray(
                        data?.skills
                    )
                        ? data.skills
                        : [];


                if (skills.length === 0) {

                    alert(
                        "مهارتی برای کلاس تو تعریف نشده."
                    );

                    return;
                }


                showSkillSelect(
                    skills,
                    data.combo
                );

            } catch (error) {

                alert(
                    error.message ||
                    "خطا در دریافت مهارت‌ها"
                );
            }
        }
    );
}


// ==================================================
// POTION (انتخاب دکمه‌ای)
// ==================================================

function getAvailablePotions() {

    const inventory =
        Array.isArray(lastInventory)
            ? lastInventory
            : [];

    const potions = [];

    inventory.forEach(item => {

        if (!item || Number(item.quantity || 0) <= 0) {
            return;
        }

        const name =
            String(item.name || "");

        const type =
            String(item.type || "").toLowerCase();

        const isMana =
            type === "mana" ||
            /مانا|mana/i.test(name);

        const isHealth =
            type === "potion" ||
            type === "health" ||
            /درمان|سلامت|health/i.test(name);

        if (!isMana && !isHealth) {
            return;
        }

        potions.push({
            type: isMana ? "mana" : "health",
            name: name || (isMana ? "معجون مانا" : "معجون درمان"),
            quantity: Number(item.quantity) || 1,
            effect: Number(item.effect) || (isMana ? 30 : 40)
        });
    });

    return potions;
}


function showPotionSelect() {

    if (!skillSelectPanel || !skillSelectList) {
        return;
    }

    const potions = getAvailablePotions();

    skillSelectList.innerHTML = "";

    const headerLabel =
        skillSelectPanel.querySelector(
            ".skill-select-header span"
        );

    if (headerLabel) {
        headerLabel.textContent = "🧪 انتخاب معجون";
    }

    if (potions.length === 0) {

        const empty =
            document.createElement("div");

        empty.className = "skill-option muted";
        empty.textContent =
            "معجونی در کوله‌ات نیست.";

        skillSelectList.appendChild(empty);
        showElement(skillSelectPanel);
        return;
    }

    potions.forEach(potion => {

        const button =
            document.createElement("button");

        button.type = "button";
        button.className = "skill-option";

        const effectLabel =
            potion.type === "mana"
                ? `+${potion.effect} مانا`
                : `+${potion.effect} جان`;

        button.innerHTML =
            `<span class="skill-option-name">${potion.name}</span>` +
            `<span class="skill-option-meta">×${potion.quantity}  ·  ${effectLabel}</span>`;

        button.addEventListener(
            "click",
            function() {

                hideSkillSelect();

                combatRequest(
                    "/potion",
                    { type: potion.type }
                );
            }
        );

        skillSelectList.appendChild(button);
    });

    showElement(skillSelectPanel);
}


if (potionButton) {

    potionButton.addEventListener(
        "click",
        function() {

            showPotionSelect();
        }
    );
}


// ==================================================
// RUN
// ==================================================

if (runButton) {

    runButton.addEventListener(
        "click",
        function() {

            combatRequest(
                "/run"
            );
        }
    );
}


// ==================================================
// SHOP
// ==================================================

if (shopButtons) {

    shopButtons.forEach(
        button => {

            button.addEventListener(
                "click",
                async function() {

                    const item =
                        button.dataset.shop;


                    if (!item) {
                        return;
                    }


                    try {

                        const data =
                            await request(
                                "/shop/buy",
                                {
                                    method: "POST",

                                    body:
                                        JSON.stringify({
                                            item
                                        })
                                }
                            );


                        addLogMessage(
                            "system",
                            data?.message ||
                            "خرید انجام شد."
                        );


                        updateGameUI(
                            data?.memory ||
                            data?.state ||
                            data
                        );

                    } catch (error) {

                        addLogMessage(
                            "system",
                            `❌ ${error.message}`
                        );
                    }
                }
            );
        }
    );
}


// ==================================================
// REST
// ==================================================

if (restButton) {

    restButton.addEventListener(
        "click",
        async function() {

            try {

                const data =
                    await request(
                        "/rest",
                        {
                            method: "POST"
                        }
                    );


                addLogMessage(
                    "system",
                    data?.message ||
                    "استراحت انجام شد."
                );


                updateGameUI(
                    data?.memory ||
                    data?.state ||
                    data
                );

            } catch (error) {

                addLogMessage(
                    "system",
                    `❌ ${error.message}`
                );
            }
        }
    );
}


// ==================================================
// RESET
// ==================================================

if (resetButton) {

    resetButton.addEventListener(
        "click",
        async function() {

            const confirmed =
                confirm(
                    "آیا مطمئنی می‌خواهی بازی را از اول شروع کنی؟"
                );


            if (!confirmed) {
                return;
            }


            try {

                // ۱) اطلاعات session فعلی از دیتابیس پاک می‌شود
                //    (با شناسه‌ی قدیمی؛ اگر شکست بخورد به catch می‌رود و session عوض نمی‌شود)
                const data =
                    await request(
                        "/reset-game",
                        {
                            method: "POST"
                        }
                    );

                // ۲) بعد از موفقیت، session جدید برای شروع کاملاً تمیز
                newSession();


                if (gameLog) {

                    gameLog.innerHTML = "";
                }


                addLogMessage(
                    "system",
                    "🌟 به دنیای RPG خوش آمدید."
                );


                addLogMessage(
                    "system",
                    "ابتدا شخصیت خود را بسازید."
                );


                showElement(
                    characterCreation
                );


                hideCombat();


                hideElement(
                    messageSection
                );


                if (characterName) {

                    characterName.value =
                        "";
                }


                updateGameUI(
                    data?.memory ||
                    data?.state ||
                    data
                );

            } catch (error) {

                alert(
                    error.message
                );
            }
        }
    );
}


// ==================================================
// LOAD GAME
// ==================================================

async function loadGame() {

    try {

        const data =
            await request(
                "/game-state"
            );


        /*
         * /game-state سرور:
         *
         * {
         *     memory: {...},
         *     combat: {...}
         * }
         */

        const state =
            normalizeState(data);


        updateGameUI(state);


        const hasPlayer =
            !!(
                state?.player?.name
            );


        if (hasPlayer) {

            hideElement(
                characterCreation
            );


            // حذف پیام «ابتدا شخصیت خود را بسازید» بعد از ساخت شخصیت
            if (gameLog) {

                gameLog.innerHTML = "";
            }


            if (
                state?.combat?.active
            ) {

                showCombat(
                    state.combat
                );

            } else {

                showElement(
                    messageSection
                );
            }


            /*
             * پیام‌های قبلی داستان را هم می‌گیریم
             */

            try {

                const storyData =
                    await request(
                        "/story-memory"
                    );


                const story =
                    storyData?.memory;


                if (
                    Array.isArray(story) &&
                    gameLog
                ) {

                    story.forEach(
                        message => {

                            if (!message) {
                                return;
                            }


                            // پشتیبانی از فرمت قدیمی خراب (role به صورت object)
                            let role =
                                message.role;

                            let content =
                                message.content;


                            if (
                                role &&
                                typeof role === "object"
                            ) {

                                content =
                                    role.content ||
                                    content;

                                role =
                                    role.role;
                            }


                            // این پیام فقط قبل از ساخت شخصیت معنا دارد
                            if (
                                content &&
                                String(content)
                                    .includes(
                                        "ابتدا شخصیت خود را بسازید"
                                    )
                            ) {
                                return;
                            }


                            if (
                                role ===
                                "user"
                            ) {

                                addLogMessage(
                                    "user",
                                    content
                                );

                            } else if (
                                role ===
                                "assistant"
                            ) {

                                addLogMessage(
                                    "ai",
                                    content
                                );

                            } else {

                                addLogMessage(
                                    "system",
                                    content
                                );
                            }
                        }
                    );
                }

            } catch (error) {

                console.error(
                    "STORY MEMORY ERROR:",
                    error
                );
            }

        } else {

            showElement(
                characterCreation
            );


            hideCombat();


            hideElement(
                messageSection
            );
        }

    } catch (error) {

        console.error(
            "LOAD GAME ERROR:",
            error
        );


        addLogMessage(
            "system",
            "❌ اتصال با سرور برقرار نشد."
        );
    }
}


// ==================================================
// START
// ==================================================

// ==================================================
// SIDEBAR TABS
// ==================================================

document.querySelectorAll(
    ".sidebar-tab"
).forEach(tab => {

    tab.addEventListener(
        "click",
        function() {

            if (tab.disabled) {
                return;
            }

            const tabId =
                tab.dataset.tab;


            if (!tabId) {
                return;
            }


            switchSidebarTab(tabId);
        }
    );
});


// ==================================================
// MOBILE NAV
// ==================================================

document.querySelectorAll(
    ".mobile-nav-btn"
).forEach(btn => {

    btn.addEventListener(
        "click",
        function() {

            if (btn.disabled) {
                return;
            }

            const view =
                btn.dataset.mobileView;


            if (!view) {
                return;
            }


            setMobileView(view);
        }
    );
});


// پیش‌فرض موبایل: صفحه داستان
setMobileView("story");


document.addEventListener(
    "DOMContentLoaded",
    function() {
        initTelegramWebApp();
        loadGame();
    }
);

