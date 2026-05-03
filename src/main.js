import { COMMANDS, commandList } from "./command-library.js";
import { LEVELS, getLevel } from "./levels.js";
import { parseCode } from "./parser.js";
import {
    conditionPathClear,
    createState,
    executePrimitive,
    isComplete,
    isPowerOn,
    previewPath,
    starsFor
} from "./engine.js";
import { GameRenderer } from "./renderer.js";
import {
    loadProgress,
    loadSettings,
    recordWin,
    resetProgress,
    saveProgress,
    saveSettings
} from "./storage.js";

const $ = (id) => document.getElementById(id);
const query = new URLSearchParams(window.location.search);
const embedMode = query.get("embed") === "1";

const els = {
    canvas: $("gameCanvas"),
    host: $("sceneHost"),
    levelBtns: $("levelBtns"),
    floorLabel: $("floorLabel"),
    levelName: $("levelName"),
    levelSize: $("levelSize"),
    powerStat: $("powerStat"),
    guardStat: $("guardStat"),
    missionText: $("missionText"),
    chipStat: $("chipStat"),
    actionStat: $("actionStat"),
    starStat: $("starStat"),
    budgetStat: $("budgetStat"),
    npcLine: $("npcLine"),
    operatorLine: $("operatorLine"),
    newMethodLabel: $("newMethodLabel"),
    commandTray: $("commandTray"),
    referenceList: $("referenceList"),
    codeArea: $("codeArea"),
    lineNums: $("lineNums"),
    console: $("console"),
    btnRun: $("btnRun"),
    btnReset: $("btnReset"),
    btnCamera: $("btnCamera"),
    btnReference: $("btnReference"),
    btnSettings: $("btnSettings"),
    btnResetProgress: $("btnResetProgress"),
    toast: $("toast"),
    settingsModal: $("settingsModal"),
    referenceModal: $("referenceModal"),
    speedRange: $("speedRange"),
    cameraMode: $("cameraMode"),
    qualityMode: $("qualityMode"),
    showPath: $("showPath"),
    freeRun: $("freeRun"),
    soundOn: $("soundOn")
};

const settings = loadSettings();
const progress = loadProgress(LEVELS.length);
if (query.get("unlock") === "all") {
    progress.unlocked = LEVELS.length;
}
const requestedLevel = Number(query.get("level") || 0);
let levelIndex = Number.isInteger(requestedLevel) && requestedLevel > 0
    ? Math.min(LEVELS.length - 1, Math.max(0, requestedLevel - 1))
    : Math.min(progress.lastLevel || 0, progress.unlocked - 1);
levelIndex = Math.min(levelIndex, Math.max(0, progress.unlocked - 1));
let level = getLevel(levelIndex);
let state = createState(level);
let running = false;
let audioCtx = null;

const renderer = new GameRenderer({ canvas: els.canvas, host: els.host, settings });

bindUI();
applySettingsToUI();
loadLevel(levelIndex);
postEmbedEvent("ready", { level: levelIndex + 1, levelCount: LEVELS.length });

function bindUI() {
    document.querySelectorAll(".operator-avatar img").forEach((img) => {
        img.addEventListener("error", () => {
            img.style.display = "none";
        });
    });
    els.btnRun.addEventListener("click", runCode);
    els.btnReset.addEventListener("click", resetLevelState);
    els.btnCamera.addEventListener("click", () => {
        const mode = renderer.cycleCamera();
        settings.camera = mode;
        els.cameraMode.value = mode;
        saveSettings(settings);
        showToast(`Camera: ${mode}`);
    });
    els.btnReference.addEventListener("click", () => openModal(els.referenceModal));
    els.btnSettings.addEventListener("click", () => openModal(els.settingsModal));
    els.btnResetProgress.addEventListener("click", () => {
        resetProgress();
        Object.assign(progress, loadProgress(LEVELS.length));
        loadLevel(0);
        closeModal(els.settingsModal);
        showToast("Progress reset.");
    });
    document.querySelectorAll("[data-close]").forEach((btn) => {
        btn.addEventListener("click", () => closeModal($(btn.dataset.close)));
    });
    [els.settingsModal, els.referenceModal].forEach((modal) => {
        modal.addEventListener("click", (event) => {
            if (event.target === modal) closeModal(modal);
        });
    });

    els.codeArea.addEventListener("input", () => {
        updateLineNums();
        updatePreview();
    });
    els.codeArea.addEventListener("scroll", () => {
        els.lineNums.scrollTop = els.codeArea.scrollTop;
    });
    els.codeArea.addEventListener("keydown", (event) => {
        if (event.key === "Tab") {
            event.preventDefault();
            insertAtCursor("  ");
        }
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            event.preventDefault();
            runCode();
        }
    });

    els.speedRange.addEventListener("input", () => {
        settings.speed = Number(els.speedRange.value);
        saveSettings(settings);
        renderer.updateSettings(settings);
    });
    els.cameraMode.addEventListener("change", () => {
        settings.camera = els.cameraMode.value;
        saveSettings(settings);
        renderer.updateSettings(settings);
        renderer.applyCamera(true);
    });
    els.qualityMode.addEventListener("change", () => {
        settings.quality = els.qualityMode.value;
        saveSettings(settings);
        renderer.updateSettings(settings);
    });
    els.showPath.addEventListener("change", () => {
        settings.showPath = els.showPath.checked;
        saveSettings(settings);
        updatePreview();
    });
    els.freeRun.addEventListener("change", () => {
        settings.freeRun = els.freeRun.checked;
        saveSettings(settings);
        updateFreeRunButtons();
    });
    els.soundOn.addEventListener("change", () => {
        settings.sound = els.soundOn.checked;
        saveSettings(settings);
    });

    document.querySelectorAll("[data-drive]").forEach((btn) => {
        btn.addEventListener("click", () => directCommand(btn.dataset.drive));
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeModal(els.settingsModal);
            closeModal(els.referenceModal);
        }
        if (!settings.freeRun || running || isTyping()) return;
        if (event.key === "ArrowUp" || event.key.toLowerCase() === "w") directCommand("forward");
        if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") directCommand("left");
        if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") directCommand("right");
        if (event.key === " " || event.key.toLowerCase() === "e") directCommand("use");
        if (event.key.toLowerCase() === "q") directCommand("wait");
        if (event.key.toLowerCase() === "f") directCommand("shoot");
    });
}

function applySettingsToUI() {
    els.speedRange.value = settings.speed;
    els.cameraMode.value = settings.camera;
    els.qualityMode.value = settings.quality;
    els.showPath.checked = settings.showPath;
    els.freeRun.checked = settings.freeRun;
    els.soundOn.checked = settings.sound;
    updateFreeRunButtons();
}

function loadLevel(index) {
    levelIndex = index;
    level = getLevel(index);
    state = createState(level);
    running = false;
    progress.lastLevel = index;
    saveProgress(progress);
    els.codeArea.value = level.starter || "";
    renderer.setLevel(level, state);
    updateLevelUI();
    updateLineNums();
    clearHighlight();
    logConsole("Ready. Write your own script for this floor.", "info", true);
    updatePreview();
}

function resetLevelState() {
    if (running) return;
    state = createState(level);
    renderer.setLevel(level, state);
    clearHighlight();
    updateStats();
    updatePreview();
    logConsole("Level reset.", "info", true);
}

async function runCode() {
    if (running) return;
    const parsed = parseCode(els.codeArea.value, level.allowed);
    if (parsed.errors.length) {
        parsed.errors.forEach((error) => logConsole(`Line ${error.line + 1}: ${error.message}`, "err"));
        highlightLine(parsed.errors[0].line);
        showToast("Script error.", true);
        playTone("error");
        return;
    }
    state = createState(level);
    renderer.setLevel(level, state);
    running = true;
    els.btnRun.disabled = true;
    logConsole("Executing mission script...", "info", true);

    await runBlock(parsed.commands);

    running = false;
    els.btnRun.disabled = false;
    clearHighlight();
    updateStats();

    if (state.complete) {
        const stars = starsFor(level, state.actions);
        recordWin(progress, levelIndex, state.actions, stars, LEVELS.length);
        buildLevelButtons();
        updateStats();
        logConsole(`Floor complete: ${state.actions} actions, ${starText(stars)}.`, "ok");
        showToast(`Floor complete: ${starText(stars)}`);
        postEmbedEvent("level-complete", { level: levelIndex + 1, actions: state.actions, stars });
        playTone("win");
    } else if (state.failed) {
        logConsole(`Mission failed: ${state.failReason}.`, "err");
        showToast(`Failed: ${state.failReason}`, true);
        playTone("error");
    } else {
        logConsole("Script finished before the gate was solved.", "warn");
        playTone("warn");
    }
}

async function runBlock(commands) {
    for (const command of commands) {
        if (state.failed || state.complete) return;
        if (command.type === "Repeat") {
            highlightLine(command.line);
            for (let i = 0; i < command.count; i++) {
                await runBlock(command.body);
                if (state.failed || state.complete) return;
            }
        } else if (command.type === "IfPowerOn") {
            highlightLine(command.line);
            if (isPowerOn(state, command.power)) await runBlock(command.body);
        } else if (command.type === "IfPathClear") {
            highlightLine(command.line);
            if (conditionPathClear(level, state)) await runBlock(command.body);
        } else if (command.type === "WhilePathClear") {
            highlightLine(command.line);
            let guard = 0;
            while (conditionPathClear(level, state) && !state.failed && !state.complete) {
                guard++;
                if (guard > 120) {
                    state.failed = true;
                    state.failReason = "loop limit";
                    return;
                }
                await runBlock(command.body);
            }
        } else {
            await runPrimitive(command);
        }
    }
}

async function runPrimitive(command) {
    highlightLine(command.line);
    const result = executePrimitive(level, state, command.type);
    await renderer.animateEvents(result.events, state);
    updateStats();
    if (result.ok) {
        if (command.type === "Use") playTone("power");
        else if (command.type === "Wait") playTone("wait");
        else if (command.type === "Shoot") playTone("shoot");
        else playTone("step");
    }
}

async function directCommand(kind) {
    if (!settings.freeRun || running) return;
    const map = {
        forward: "MoveForward",
        left: "TurnLeft",
        right: "TurnRight",
        use: "Use",
        wait: "Wait",
        shoot: "Shoot"
    };
    const type = map[kind];
    if (!type || !level.allowed.includes(type)) return;
    running = true;
    const result = executePrimitive(level, state, type);
    await renderer.animateEvents(result.events, state);
    running = false;
    updateStats();
    if (!result.ok) {
        showToast(`Failed: ${result.reason}`, true);
        logConsole(`Mission failed: ${result.reason}.`, "err");
        playTone("error");
    } else if (isComplete(level, state)) {
        const stars = starsFor(level, state.actions);
        recordWin(progress, levelIndex, state.actions, stars, LEVELS.length);
        buildLevelButtons();
        showToast(`Floor complete: ${starText(stars)}`);
        logConsole(`Floor complete: ${state.actions} actions, ${starText(stars)}.`, "ok");
        postEmbedEvent("level-complete", { level: levelIndex + 1, actions: state.actions, stars });
        playTone("win");
    }
}

function updateLevelUI() {
    els.floorLabel.textContent = `Floor ${levelIndex + 1} / ${LEVELS.length}`;
    els.levelName.textContent = level.name;
    els.levelSize.textContent = `${level.grid} x ${level.grid}`;
    els.guardStat.textContent = String((level.guards || []).length + (level.enemies || []).length);
    els.missionText.textContent = level.mission;
    els.operatorLine.textContent = level.introduces === "All systems" ? "The final floor combines every method you have unlocked." : "Route the platform, power the systems, and reach the exit gate.";
    els.newMethodLabel.textContent = level.introduces;
    els.budgetStat.textContent = String(level.stars.three);
    buildLevelButtons();
    buildCommandTray();
    buildReferenceList();
    updateStats();
}

function updateStats() {
    els.chipStat.textContent = `${state.collected.size}/${(level.chips || []).length}`;
    els.actionStat.textContent = String(state.actions);
    const totalPower = (level.requiredPower || []).length;
    const activePower = (level.requiredPower || []).filter((circuit) => state.power[circuit]).length;
    const totalCables = (level.cables || []).length;
    const fixedCables = (level.cables || []).filter((cable) => state.repaired.has(cable.id)).length;
    els.powerStat.textContent = totalCables ? `${fixedCables}/${totalCables}` : `${activePower}/${totalPower}`;
    const liveStars = starsFor(level, state.actions);
    const best = progress.levels[levelIndex]?.bestStars || 0;
    els.starStat.textContent = state.complete ? starText(liveStars) : best ? starText(best) : starText(liveStars);
    els.npcLine.textContent = state.failed ? `Failure: ${state.failReason}` : statusLine();
    updateFreeRunButtons();
}

function statusLine() {
    const chipsLeft = (level.chips || []).length - state.collected.size;
    const powerLeft = (level.requiredPower || []).filter((circuit) => !state.power[circuit]);
    const cablesLeft = (level.cables || []).filter((cable) => !state.repaired.has(cable.id)).length;
    if (chipsLeft > 0) return `${chipsLeft} data shard${chipsLeft === 1 ? "" : "s"} remaining.`;
    if (cablesLeft > 0) return `${cablesLeft} cable repair${cablesLeft === 1 ? "" : "s"} remaining.`;
    if (powerLeft.length) return `Power required: ${powerLeft.join(", ")}.`;
    if (state.x !== level.exit.x || state.y !== level.exit.y) return "Gate ready. Reach the exit platform.";
    return "Gate synchronized.";
}

function buildLevelButtons() {
    els.levelBtns.innerHTML = "";
    LEVELS.forEach((item, index) => {
        const btn = document.createElement("button");
        btn.className = "level-btn";
        btn.title = item.name;
        btn.textContent = String(index + 1);
        if (index === levelIndex) btn.classList.add("active");
        if (index >= progress.unlocked) btn.classList.add("locked");
        const stars = progress.levels[index]?.bestStars || 0;
        if (stars) {
            const span = document.createElement("span");
            span.className = "stars";
            span.textContent = starText(stars);
            btn.appendChild(span);
        }
        btn.addEventListener("click", () => {
            if (running || index >= progress.unlocked) return;
            loadLevel(index);
        });
        els.levelBtns.appendChild(btn);
    });
}

function buildCommandTray() {
    els.commandTray.innerHTML = "";
    commandList(level.allowed).forEach((command) => {
        const btn = document.createElement("button");
        btn.className = "cmd-btn";
        btn.textContent = command.label;
        btn.title = command.description;
        btn.addEventListener("click", () => insertAtCursor(command.insert));
        els.commandTray.appendChild(btn);
    });
}

function buildReferenceList() {
    els.referenceList.innerHTML = "";
    Object.values(COMMANDS).forEach((command) => {
        const item = document.createElement("div");
        item.className = "ref-item";
        const locked = level.allowed.includes(command.key) ? "" : " Locked on this floor.";
        item.innerHTML = `<code>${escapeHtml(command.label)}</code><p>${escapeHtml(command.description + locked)}</p>`;
        els.referenceList.appendChild(item);
    });
}

function updatePreview() {
    const parsed = parseCode(els.codeArea.value, level.allowed);
    if (!settings.showPath || parsed.errors.length) {
        renderer.clearPath();
        return;
    }
    const preview = previewPath(level, parsed.commands);
    renderer.previewPath(preview.points);
}

function updateLineNums() {
    const count = els.codeArea.value.split("\n").length;
    els.lineNums.innerHTML = Array.from({ length: count }, (_, i) => `<div class="ln" data-ln="${i}">${i + 1}</div>`).join("");
}

function highlightLine(line) {
    clearHighlight();
    if (line == null || line < 0) return;
    const el = els.lineNums.querySelector(`[data-ln="${line}"]`);
    if (!el) return;
    el.classList.add("active");
    const lineHeight = 20.8;
    const top = line * lineHeight;
    if (top < els.codeArea.scrollTop || top > els.codeArea.scrollTop + els.codeArea.clientHeight - lineHeight) {
        els.codeArea.scrollTop = Math.max(0, top - 40);
        els.lineNums.scrollTop = els.codeArea.scrollTop;
    }
}

function clearHighlight() {
    els.lineNums.querySelectorAll(".active").forEach((el) => el.classList.remove("active"));
}

function insertAtCursor(text) {
    const input = els.codeArea;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    input.value = input.value.slice(0, start) + text + input.value.slice(end);
    input.selectionStart = start + text.length;
    input.selectionEnd = start + text.length;
    input.focus();
    updateLineNums();
    updatePreview();
}

function updateFreeRunButtons() {
    document.querySelectorAll("[data-drive]").forEach((btn) => {
        const map = { forward: "MoveForward", left: "TurnLeft", right: "TurnRight", use: "Use", wait: "Wait", shoot: "Shoot" };
        btn.disabled = !settings.freeRun || !level.allowed.includes(map[btn.dataset.drive]);
    });
}

function logConsole(message, type = "info", clear = false) {
    if (clear) els.console.innerHTML = "";
    const div = document.createElement("div");
    div.className = `cl-${type}`;
    div.textContent = message;
    els.console.appendChild(div);
    els.console.scrollTop = els.console.scrollHeight;
}

function showToast(message, isError = false) {
    els.toast.textContent = message;
    els.toast.className = `toast${isError ? " err" : ""} show`;
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => els.toast.classList.remove("show"), 2200);
}

function playTone(kind) {
    if (!settings.sound) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    if (!audioCtx) audioCtx = new AudioContext();
    const ctx = audioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const freq = { step: 420, wait: 250, shoot: 880, power: 760, error: 150, warn: 220, win: 960 }[kind] || 420;
    osc.type = kind === "error" ? "sawtooth" : "sine";
    osc.frequency.value = freq;
    gain.gain.value = kind === "win" ? .055 : .032;
    gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + (kind === "win" ? .32 : .13));
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (kind === "win" ? .34 : .15));
}

function openModal(modal) {
    modal.classList.add("open");
}

window.addEventListener("message", (event) => {
    const data = event.data || {};
    if (data.source !== "scriptrunner3d-host") return;
    if (data.command === "reset") resetLevelState();
    if (data.command === "run") runCode();
    if (data.command === "loadLevel") {
        const next = Math.max(0, Math.min(LEVELS.length - 1, Number(data.level) - 1));
        if (!running && next < progress.unlocked) loadLevel(next);
    }
});

function postEmbedEvent(event, payload = {}) {
    if (!embedMode || window.parent === window) return;
    window.parent.postMessage({
        source: "scriptrunner3d",
        event,
        payload
    }, "*");
}

function closeModal(modal) {
    modal.classList.remove("open");
}

function isTyping() {
    const active = document.activeElement;
    return active && ["TEXTAREA", "INPUT", "SELECT"].includes(active.tagName);
}

function starText(stars) {
    return `${stars}/3`;
}

function escapeHtml(value) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
