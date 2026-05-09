import { COMMANDS } from "./command-library.js";

const STORAGE_KEY = "scriptRunner3dAdminDraftV1";
const ALL_COMMANDS = Object.keys(COMMANDS);

const COLORS = {
    A: 0x17d6c3,
    B: 0x64e06b,
    C: 0x5ca9ff,
    D: 0xffc857,
    red: 0xff6b6b
};

const TOOL_DEFS = [
    { key: "start", icon: "fa-play", label: "Start" },
    { key: "exit", icon: "fa-flag-checkered", label: "Finish" },
    { key: "chip", icon: "fa-diamond", label: "Data" },
    { key: "obstacle", icon: "fa-cube", label: "Wall" },
    { key: "switch", icon: "fa-bolt", label: "Switch" },
    { key: "door", icon: "fa-door-closed", label: "Door" },
    { key: "bridge", icon: "fa-grip-lines", label: "Bridge" },
    { key: "cable", icon: "fa-plug-circle-bolt", label: "Cable" },
    { key: "laser", icon: "fa-burst", label: "Trap" },
    { key: "hiddenTrap", icon: "fa-eye-slash", label: "Hidden" },
    { key: "guard", icon: "fa-shield-halved", label: "Guard" },
    { key: "patrol", icon: "fa-route", label: "Patrol" },
    { key: "target", icon: "fa-bullseye", label: "Target" },
    { key: "hunter", icon: "fa-crosshairs", label: "Hunter" },
    { key: "erase", icon: "fa-eraser", label: "Erase" }
];

const ARRAY_KEYS = ["chips", "obstacles", "switches", "doors", "cables", "lasers", "hiddenTraps", "guards", "enemies"];

export class AdminConsole {
    constructor({ modal, onPlay, onToast }) {
        this.modal = modal;
        this.onPlay = onPlay;
        this.onToast = onToast;
        this.tool = "start";
        this.selected = null;
        this.draft = this.loadDraft() || createDraft();
        this.els = {
            name: document.getElementById("adminLevelName"),
            mission: document.getElementById("adminMission"),
            gridSize: document.getElementById("adminGridSize"),
            starThree: document.getElementById("adminStarThree"),
            starTwo: document.getElementById("adminStarTwo"),
            starOne: document.getElementById("adminStarOne"),
            startDir: document.getElementById("adminStartDir"),
            circuit: document.getElementById("adminCircuit"),
            palette: document.getElementById("adminPalette"),
            grid: document.getElementById("adminGrid"),
            inspector: document.getElementById("adminInspector"),
            json: document.getElementById("adminJson"),
            btnNew: document.getElementById("adminBtnNew"),
            btnLoadCurrent: document.getElementById("adminBtnLoadCurrent"),
            btnPlay: document.getElementById("adminBtnPlay"),
            btnSave: document.getElementById("adminBtnSave"),
            btnExport: document.getElementById("adminBtnExport"),
            btnImport: document.getElementById("adminBtnImport"),
            activeTool: document.getElementById("adminActiveTool")
        };
        this.currentLevelProvider = null;
        this.bind();
        this.syncForm();
        this.render();
    }

    open(currentLevelProvider) {
        this.currentLevelProvider = currentLevelProvider;
        this.syncForm();
        this.render();
    }

    bind() {
        this.renderPalette();
        ["input", "change"].forEach((eventName) => {
            this.els.name.addEventListener(eventName, () => this.updateMeta());
            this.els.mission.addEventListener(eventName, () => this.updateMeta());
            this.els.gridSize.addEventListener(eventName, () => this.resizeGrid());
            this.els.starThree.addEventListener(eventName, () => this.updateMeta());
            this.els.starTwo.addEventListener(eventName, () => this.updateMeta());
            this.els.starOne.addEventListener(eventName, () => this.updateMeta());
        });
        this.els.startDir.addEventListener("change", () => {
            this.draft.start.dir = Number(this.els.startDir.value);
            this.render();
        });
        this.els.circuit.addEventListener("input", () => {
            this.els.circuit.value = cleanCircuit(this.els.circuit.value);
        });
        this.els.grid.addEventListener("dragover", (event) => event.preventDefault());
        this.els.grid.addEventListener("drop", (event) => {
            event.preventDefault();
            const cell = event.target.closest("[data-x]");
            const tool = event.dataTransfer.getData("text/plain") || this.tool;
            if (!cell) return;
            this.setTool(tool);
            this.applyTool(Number(cell.dataset.x), Number(cell.dataset.y));
        });
        this.els.btnNew.addEventListener("click", () => {
            this.draft = createDraft();
            this.selected = null;
            this.syncForm();
            this.render();
            this.toast("New draft ready.");
        });
        this.els.btnLoadCurrent.addEventListener("click", () => {
            const current = this.currentLevelProvider?.();
            if (!current) return;
            this.draft = levelToDraft(current);
            this.selected = null;
            this.syncForm();
            this.render();
            this.toast("Current floor loaded into admin.");
        });
        this.els.btnPlay.addEventListener("click", () => {
            const level = this.makeLevel();
            this.saveDraft();
            this.onPlay(level);
            this.modal.classList.remove("open");
        });
        this.els.btnSave.addEventListener("click", () => {
            this.saveDraft();
            this.toast("Admin draft saved.");
        });
        this.els.btnExport.addEventListener("click", () => {
            this.els.json.value = JSON.stringify(this.makeLevel(), null, 2);
            this.els.json.focus();
            this.els.json.select();
        });
        this.els.btnImport.addEventListener("click", () => {
            try {
                const imported = JSON.parse(this.els.json.value);
                this.draft = levelToDraft(imported);
                this.selected = null;
                this.syncForm();
                this.render();
                this.toast("Level JSON imported.");
            } catch {
                this.toast("Import failed: invalid JSON.", true);
            }
        });
    }

    renderPalette() {
        this.els.palette.innerHTML = "";
        TOOL_DEFS.forEach((tool) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "admin-tool";
            btn.draggable = true;
            btn.dataset.tool = tool.key;
            btn.innerHTML = `<i class="fa-solid ${tool.icon}"></i><span>${tool.label}</span>`;
            btn.addEventListener("click", () => this.setTool(tool.key));
            btn.addEventListener("dragstart", (event) => {
                event.dataTransfer.setData("text/plain", tool.key);
            });
            this.els.palette.appendChild(btn);
        });
    }

    setTool(tool) {
        this.tool = tool;
        this.els.palette.querySelectorAll(".admin-tool").forEach((btn) => {
            btn.classList.toggle("active", btn.dataset.tool === tool);
        });
        const def = TOOL_DEFS.find((item) => item.key === tool);
        this.els.activeTool.textContent = def ? def.label : tool;
        this.renderInspector();
    }

    syncForm() {
        this.els.name.value = this.draft.name;
        this.els.mission.value = this.draft.mission;
        this.els.gridSize.value = this.draft.grid;
        this.els.starThree.value = this.draft.stars.three;
        this.els.starTwo.value = this.draft.stars.two;
        this.els.starOne.value = this.draft.stars.one;
        this.els.startDir.value = this.draft.start.dir;
        this.els.circuit.value = "A";
        this.setTool(this.tool);
    }

    updateMeta() {
        this.draft.name = this.els.name.value.trim() || "Admin Floor";
        this.draft.mission = this.els.mission.value.trim() || "Reach the finish.";
        this.draft.stars = {
            three: clampInt(this.els.starThree.value, 1, 99, 12),
            two: clampInt(this.els.starTwo.value, 1, 120, 18),
            one: clampInt(this.els.starOne.value, 1, 150, 24)
        };
    }

    resizeGrid() {
        const next = clampInt(this.els.gridSize.value, 4, 12, 8);
        this.draft.grid = next;
        this.draft.start.x = clampInt(this.draft.start.x, 0, next - 1, 0);
        this.draft.start.y = clampInt(this.draft.start.y, 0, next - 1, 0);
        this.draft.exit.x = clampInt(this.draft.exit.x, 0, next - 1, next - 1);
        this.draft.exit.y = clampInt(this.draft.exit.y, 0, next - 1, next - 1);
        trimToGrid(this.draft);
        this.render();
    }

    applyTool(x, y) {
        const circuit = cleanCircuit(this.els.circuit.value) || "A";
        this.els.circuit.value = circuit;
        if (this.tool !== "erase" && this.isStartOrExit(x, y) && !["start", "exit", "chip", "patrol"].includes(this.tool)) {
            this.toast("Move start or finish before placing that item.", true);
            return;
        }

        if (this.tool === "start") {
            this.draft.start = { x, y, dir: Number(this.els.startDir.value) };
            this.selected = { type: "start" };
        } else if (this.tool === "exit") {
            this.draft.exit = { x, y };
            this.selected = { type: "exit" };
        } else if (this.tool === "chip") {
            togglePoint(this.draft.chips, x, y);
            this.selected = null;
        } else if (this.tool === "obstacle") {
            this.clearCell(x, y);
            togglePoint(this.draft.obstacles, x, y);
            this.selected = null;
        } else if (this.tool === "switch") {
            const index = toggleObject(this.draft.switches, x, y, { x, y, power: circuit, mode: "on", color: colorForCircuit(circuit) });
            this.selected = index >= 0 ? { type: "switches", index } : null;
        } else if (this.tool === "door") {
            const index = toggleObject(this.draft.doors, x, y, { x, y, requires: [circuit], color: colorForCircuit(circuit) });
            this.selected = index >= 0 ? { type: "doors", index } : null;
        } else if (this.tool === "bridge") {
            this.toggleBridgeCell(x, y, circuit);
        } else if (this.tool === "cable") {
            const index = toggleObject(this.draft.cables, x, y, { x, y, id: circuit, color: colorForCircuit(circuit) });
            this.selected = index >= 0 ? { type: "cables", index } : null;
        } else if (this.tool === "laser") {
            const index = toggleObject(this.draft.lasers, x, y, { cells: [{ x, y }], period: 4, active: [0, 1], color: COLORS.red });
            this.selected = index >= 0 ? { type: "lasers", index } : null;
        } else if (this.tool === "hiddenTrap") {
            togglePoint(this.draft.hiddenTraps, x, y);
            this.selected = null;
        } else if (this.tool === "guard") {
            const existing = this.draft.guards.findIndex((guard) => guard.path?.[0]?.x === x && guard.path?.[0]?.y === y);
            if (existing >= 0) {
                this.selected = { type: "guards", index: existing };
            } else {
                this.draft.guards.push({ name: `Guard ${this.draft.guards.length + 1}`, color: COLORS.red, path: [{ x, y }], phase: 0, vision: 3 });
                this.selected = { type: "guards", index: this.draft.guards.length - 1 };
            }
        } else if (this.tool === "patrol") {
            this.addPatrolPoint(x, y);
        } else if (this.tool === "target") {
            this.draft.enemies.push({ name: `Target ${this.draft.enemies.length + 1}`, x, y, color: COLORS.red, stepEvery: 999 });
            this.selected = { type: "enemies", index: this.draft.enemies.length - 1 };
        } else if (this.tool === "hunter") {
            this.draft.enemies.push({ name: `Hunter ${this.draft.enemies.length + 1}`, x, y, color: COLORS.red, stepEvery: 2 });
            this.selected = { type: "enemies", index: this.draft.enemies.length - 1 };
        } else if (this.tool === "erase") {
            this.clearCell(x, y);
            this.selected = null;
        }
        this.render();
    }

    isStartOrExit(x, y) {
        return (this.draft.start.x === x && this.draft.start.y === y) || (this.draft.exit.x === x && this.draft.exit.y === y);
    }

    clearCell(x, y) {
        this.draft.chips = withoutPoint(this.draft.chips, x, y);
        this.draft.obstacles = withoutPoint(this.draft.obstacles, x, y);
        this.draft.switches = withoutPoint(this.draft.switches, x, y);
        this.draft.doors = withoutPoint(this.draft.doors, x, y);
        this.draft.cables = withoutPoint(this.draft.cables, x, y);
        this.draft.hiddenTraps = withoutPoint(this.draft.hiddenTraps, x, y);
        this.draft.lasers = this.draft.lasers.filter((laser) => !laser.cells.some((cell) => cell.x === x && cell.y === y));
        this.draft.guards.forEach((guard) => {
            guard.path = guard.path.filter((point) => point.x !== x || point.y !== y);
        });
        this.draft.guards = this.draft.guards.filter((guard) => guard.path.length);
        this.draft.enemies = withoutPoint(this.draft.enemies, x, y);
        this.draft.bridges.forEach((bridge) => {
            bridge.cells = withoutPoint(bridge.cells, x, y);
        });
        this.draft.bridges = this.draft.bridges.filter((bridge) => bridge.cells.length);
    }

    toggleBridgeCell(x, y, circuit) {
        let bridge = this.draft.bridges.find((item) => (item.requires || [])[0] === circuit);
        if (!bridge) {
            bridge = { cells: [], requires: [circuit], color: colorForCircuit(circuit) };
            this.draft.bridges.push(bridge);
        }
        togglePoint(bridge.cells, x, y);
        if (!bridge.cells.length) this.draft.bridges = this.draft.bridges.filter((item) => item !== bridge);
        else this.selected = { type: "bridges", index: this.draft.bridges.indexOf(bridge) };
    }

    addPatrolPoint(x, y) {
        if (!this.selected || this.selected.type !== "guards") {
            this.toast("Select or place a guard before adding patrol points.", true);
            return;
        }
        const guard = this.draft.guards[this.selected.index];
        if (!guard) return;
        guard.path.push({ x, y });
    }

    render() {
        this.renderGrid();
        this.renderInspector();
        this.setTool(this.tool);
    }

    renderGrid() {
        this.els.grid.style.setProperty("--admin-grid", this.draft.grid);
        this.els.grid.innerHTML = "";
        for (let y = 0; y < this.draft.grid; y++) {
            for (let x = 0; x < this.draft.grid; x++) {
                const cell = document.createElement("button");
                cell.type = "button";
                cell.className = "admin-cell";
                cell.dataset.x = x;
                cell.dataset.y = y;
                cell.addEventListener("click", () => this.applyTool(x, y));
                cell.innerHTML = this.cellHtml(x, y);
                if (this.cellSelected(x, y)) cell.classList.add("selected");
                this.els.grid.appendChild(cell);
            }
        }
    }

    cellHtml(x, y) {
        const tokens = [];
        if (this.draft.start.x === x && this.draft.start.y === y) tokens.push(token("start", dirLabel(this.draft.start.dir)));
        if (this.draft.exit.x === x && this.draft.exit.y === y) tokens.push(token("exit", "F"));
        if (hasPoint(this.draft.obstacles, x, y)) tokens.push(token("wall", "W"));
        if (hasPoint(this.draft.chips, x, y)) tokens.push(token("chip", "D"));
        this.draft.switches.filter((item) => item.x === x && item.y === y).forEach((item) => tokens.push(token("switch", item.power || "A")));
        this.draft.doors.filter((item) => item.x === x && item.y === y).forEach((item) => tokens.push(token("door", (item.requires || ["A"]).join(""))));
        this.draft.bridges.forEach((bridge) => {
            if (hasPoint(bridge.cells, x, y)) tokens.push(token("bridge", (bridge.requires || ["A"])[0]));
        });
        this.draft.cables.filter((item) => item.x === x && item.y === y).forEach((item) => tokens.push(token("cable", item.id || "A")));
        this.draft.lasers.forEach((laser) => {
            if (hasPoint(laser.cells, x, y)) tokens.push(token("laser", "L"));
        });
        if (hasPoint(this.draft.hiddenTraps, x, y)) tokens.push(token("hidden", "?"));
        this.draft.guards.forEach((guard, guardIndex) => {
            (guard.path || []).forEach((point, pathIndex) => {
                if (point.x === x && point.y === y) tokens.push(token(pathIndex ? "patrol" : "guard", pathIndex ? String(pathIndex) : "G", guardIndex));
            });
        });
        this.draft.enemies.filter((item) => item.x === x && item.y === y).forEach((item) => tokens.push(token(item.stepEvery >= 99 ? "target" : "hunter", item.stepEvery >= 99 ? "T" : "H")));
        return `<span class="admin-coord">${x},${y}</span><span class="admin-cell-stack">${tokens.join("")}</span>`;
    }

    cellSelected(x, y) {
        const selected = this.selectedObject();
        if (!selected) return false;
        if (this.selected.type === "start") return this.draft.start.x === x && this.draft.start.y === y;
        if (this.selected.type === "exit") return this.draft.exit.x === x && this.draft.exit.y === y;
        if (this.selected.type === "guards") return selected.path?.some((point) => point.x === x && point.y === y);
        if (this.selected.type === "bridges") return selected.cells?.some((point) => point.x === x && point.y === y);
        if (this.selected.type === "lasers") return selected.cells?.some((point) => point.x === x && point.y === y);
        return selected.x === x && selected.y === y;
    }

    selectedObject() {
        if (!this.selected) return null;
        if (this.selected.type === "start") return this.draft.start;
        if (this.selected.type === "exit") return this.draft.exit;
        return this.draft[this.selected.type]?.[this.selected.index] || null;
    }

    renderInspector() {
        const selected = this.selectedObject();
        if (!selected) {
            this.els.inspector.innerHTML = `<div class="admin-empty">Tool: ${escapeHtml(this.els.activeTool.textContent || "")}</div>`;
            return;
        }
        const type = this.selected.type;
        if (type === "guards") {
            this.els.inspector.innerHTML = `
                <label>Name<input data-admin-prop="name" value="${escapeAttr(selected.name || "Guard")}"></label>
                <label>Vision<input data-admin-prop="vision" type="number" min="0" max="8" value="${selected.vision || 0}"></label>
                <label>Phase<input data-admin-prop="phase" type="number" min="0" max="${Math.max(0, selected.path.length - 1)}" value="${selected.phase || 0}"></label>
                <div class="admin-path-list">${selected.path.map((point, index) => `<span>${index}: ${point.x},${point.y}</span>`).join("")}</div>
                <button type="button" data-admin-action="delete">Delete Guard</button>
            `;
        } else if (type === "enemies") {
            this.els.inspector.innerHTML = `
                <label>Name<input data-admin-prop="name" value="${escapeAttr(selected.name || "Hunter")}"></label>
                <label>AI Delay<input data-admin-prop="stepEvery" type="number" min="1" max="999" value="${selected.stepEvery || 2}"></label>
                <button type="button" data-admin-action="delete">Delete Enemy</button>
            `;
        } else if (type === "lasers") {
            this.els.inspector.innerHTML = `
                <label>Period<input data-admin-prop="period" type="number" min="1" max="12" value="${selected.period || 4}"></label>
                <label>Active Ticks<input data-admin-prop="active" value="${(selected.active || [0]).join(",")}"></label>
                <button type="button" data-admin-action="delete">Delete Trap</button>
            `;
        } else if (["switches", "doors", "cables", "bridges"].includes(type)) {
            const value = type === "doors" || type === "bridges" ? (selected.requires || ["A"]).join(",") : (selected.power || selected.id || "A");
            this.els.inspector.innerHTML = `
                <label>Circuit<input data-admin-prop="circuit" value="${escapeAttr(value)}"></label>
                <button type="button" data-admin-action="delete">Delete Item</button>
            `;
        } else {
            this.els.inspector.innerHTML = `<div class="admin-empty">${type === "start" ? "Start" : "Finish"} selected.</div>`;
        }
        this.bindInspector();
    }

    bindInspector() {
        this.els.inspector.querySelectorAll("[data-admin-prop]").forEach((input) => {
            input.addEventListener("input", () => {
                const item = this.selectedObject();
                if (!item) return;
                const prop = input.dataset.adminProp;
                if (prop === "name") item.name = input.value;
                if (prop === "vision") item.vision = clampInt(input.value, 0, 8, 0);
                if (prop === "phase") item.phase = clampInt(input.value, 0, Math.max(0, (item.path || []).length - 1), 0);
                if (prop === "stepEvery") item.stepEvery = clampInt(input.value, 1, 999, 2);
                if (prop === "period") item.period = clampInt(input.value, 1, 12, 4);
                if (prop === "active") item.active = parseTicks(input.value, item.period || 4);
                if (prop === "circuit") this.updateSelectedCircuit(input.value);
                this.renderGrid();
            });
        });
        this.els.inspector.querySelector("[data-admin-action='delete']")?.addEventListener("click", () => {
            if (!this.selected) return;
            this.draft[this.selected.type].splice(this.selected.index, 1);
            this.selected = null;
            this.render();
        });
    }

    updateSelectedCircuit(rawValue) {
        const item = this.selectedObject();
        if (!item) return;
        const circuits = rawValue.split(",").map(cleanCircuit).filter(Boolean);
        const circuit = circuits[0] || "A";
        if (this.selected.type === "switches") item.power = circuit;
        if (this.selected.type === "cables") item.id = circuit;
        if (this.selected.type === "doors" || this.selected.type === "bridges") item.requires = circuits.length ? circuits : [circuit];
        item.color = colorForCircuit(circuit);
    }

    makeLevel() {
        this.updateMeta();
        const level = normalizeLevel({
            ...this.draft,
            id: "admin-draft",
            introduces: "Admin Console",
            requiredPower: requiredPowerFor(this.draft),
            allowed: ALL_COMMANDS,
            template: "",
            starter: this.draft.starter || ""
        });
        return level;
    }

    saveDraft() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.makeLevel()));
    }

    loadDraft() {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
            return saved ? levelToDraft(saved) : null;
        } catch {
            return null;
        }
    }

    toast(message, isError = false) {
        this.onToast?.(message, isError);
    }
}

function createDraft() {
    return normalizeLevel({
        id: "admin-draft",
        name: "Admin Floor",
        introduces: "Admin Console",
        grid: 8,
        start: { x: 1, y: 6, dir: 0 },
        exit: { x: 6, y: 1 },
        chips: [{ x: 2, y: 6 }, { x: 6, y: 1 }],
        obstacles: [],
        switches: [],
        doors: [],
        bridges: [],
        guards: [],
        enemies: [],
        cables: [],
        lasers: [],
        hiddenTraps: [],
        requiredPower: [],
        allowed: ALL_COMMANDS,
        stars: { three: 12, two: 18, one: 24 },
        mission: "Reach the finish.",
        template: "",
        starter: ""
    });
}

function levelToDraft(level) {
    return normalizeLevel({
        ...createDraft(),
        ...structuredCloneSafe(level),
        id: "admin-draft",
        introduces: "Admin Console",
        allowed: ALL_COMMANDS
    });
}

function normalizeLevel(level) {
    const grid = clampInt(level.grid, 4, 12, 8);
    const normalized = {
        ...level,
        grid,
        start: normalizePoint(level.start || { x: 0, y: grid - 1 }, grid, { dir: clampInt(level.start?.dir, 0, 3, 0) }),
        exit: normalizePoint(level.exit || { x: grid - 1, y: 0 }, grid),
        stars: {
            three: clampInt(level.stars?.three, 1, 99, 12),
            two: clampInt(level.stars?.two, 1, 120, 18),
            one: clampInt(level.stars?.one, 1, 150, 24)
        },
        name: level.name || "Admin Floor",
        mission: level.mission || "Reach the finish."
    };
    ARRAY_KEYS.forEach((key) => {
        normalized[key] = Array.isArray(level[key]) ? structuredCloneSafe(level[key]) : [];
    });
    normalized.bridges = Array.isArray(level.bridges) ? structuredCloneSafe(level.bridges) : [];
    normalized.guards = normalized.guards
        .map((guard, index) => ({
            name: guard.name || `Guard ${index + 1}`,
            color: guard.color || COLORS.red,
            path: Array.isArray(guard.path) ? guard.path.map((point) => normalizePoint(point, grid)).filter(Boolean) : [],
            phase: clampInt(guard.phase, 0, Math.max(0, (guard.path || []).length - 1), 0),
            vision: clampInt(guard.vision, 0, 8, 0)
        }))
        .filter((guard) => guard.path.length);
    normalized.enemies = normalized.enemies.map((enemy, index) => ({
        name: enemy.name || `Hunter ${index + 1}`,
        x: clampInt(enemy.x, 0, grid - 1, 0),
        y: clampInt(enemy.y, 0, grid - 1, 0),
        color: enemy.color || COLORS.red,
        stepEvery: clampInt(enemy.stepEvery, 1, 999, 2)
    }));
    normalized.lasers = normalized.lasers.map((laser) => ({
        cells: (laser.cells || []).map((point) => normalizePoint(point, grid)).filter(Boolean),
        period: clampInt(laser.period, 1, 12, 4),
        active: parseTicks((laser.active || [0]).join(","), clampInt(laser.period, 1, 12, 4)),
        color: laser.color || COLORS.red,
        disabledBy: laser.disabledBy || undefined
    })).filter((laser) => laser.cells.length);
    normalized.bridges = normalized.bridges.map((bridge) => ({
        cells: (bridge.cells || []).map((point) => normalizePoint(point, grid)).filter(Boolean),
        requires: bridge.requires?.length ? bridge.requires.map(cleanCircuit).filter(Boolean) : ["A"],
        color: bridge.color || colorForCircuit(bridge.requires?.[0] || "A")
    })).filter((bridge) => bridge.cells.length);
    normalized.switches = normalized.switches.map((item) => ({ x: clampInt(item.x, 0, grid - 1, 0), y: clampInt(item.y, 0, grid - 1, 0), power: cleanCircuit(item.power) || "A", mode: item.mode === "toggle" ? "toggle" : "on", color: item.color || colorForCircuit(item.power || "A") }));
    normalized.doors = normalized.doors.map((item) => ({ x: clampInt(item.x, 0, grid - 1, 0), y: clampInt(item.y, 0, grid - 1, 0), requires: item.requires?.length ? item.requires.map(cleanCircuit).filter(Boolean) : ["A"], color: item.color || colorForCircuit(item.requires?.[0] || "A") }));
    normalized.cables = normalized.cables.map((item) => ({ x: clampInt(item.x, 0, grid - 1, 0), y: clampInt(item.y, 0, grid - 1, 0), id: cleanCircuit(item.id) || "A", color: item.color || colorForCircuit(item.id || "A") }));
    normalized.chips = normalized.chips.map((point) => normalizePoint(point, grid)).filter(Boolean);
    normalized.obstacles = normalized.obstacles.map((point) => normalizePoint(point, grid)).filter(Boolean);
    normalized.hiddenTraps = normalized.hiddenTraps.map((point) => normalizePoint(point, grid)).filter(Boolean);
    normalized.requiredPower = requiredPowerFor(normalized);
    normalized.allowed = ALL_COMMANDS;
    trimToGrid(normalized);
    return normalized;
}

function trimToGrid(level) {
    const inGrid = (point) => point.x >= 0 && point.x < level.grid && point.y >= 0 && point.y < level.grid;
    level.chips = level.chips.filter(inGrid);
    level.obstacles = level.obstacles.filter(inGrid);
    level.switches = level.switches.filter(inGrid);
    level.doors = level.doors.filter(inGrid);
    level.cables = level.cables.filter(inGrid);
    level.hiddenTraps = level.hiddenTraps.filter(inGrid);
    level.enemies = level.enemies.filter(inGrid);
    level.lasers.forEach((laser) => laser.cells = laser.cells.filter(inGrid));
    level.lasers = level.lasers.filter((laser) => laser.cells.length);
    level.guards.forEach((guard) => guard.path = guard.path.filter(inGrid));
    level.guards = level.guards.filter((guard) => guard.path.length);
    level.bridges.forEach((bridge) => bridge.cells = bridge.cells.filter(inGrid));
    level.bridges = level.bridges.filter((bridge) => bridge.cells.length);
}

function requiredPowerFor(level) {
    const set = new Set();
    (level.doors || []).forEach((door) => (door.requires || []).forEach((circuit) => set.add(circuit)));
    (level.bridges || []).forEach((bridge) => (bridge.requires || []).forEach((circuit) => set.add(circuit)));
    return [...set].filter(Boolean);
}

function togglePoint(points, x, y) {
    const index = points.findIndex((point) => point.x === x && point.y === y);
    if (index >= 0) points.splice(index, 1);
    else points.push({ x, y });
}

function toggleObject(items, x, y, value) {
    const index = items.findIndex((item) => item.x === x && item.y === y);
    if (index >= 0) {
        items.splice(index, 1);
        return -1;
    }
    items.push(value);
    return items.length - 1;
}

function withoutPoint(items, x, y) {
    return items.filter((item) => item.x !== x || item.y !== y);
}

function hasPoint(items, x, y) {
    return items.some((item) => item.x === x && item.y === y);
}

function token(kind, label, index = "") {
    return `<span class="admin-token ${kind}" data-index="${index}">${escapeHtml(label)}</span>`;
}

function normalizePoint(point, grid, extra = {}) {
    if (!point) return null;
    return {
        x: clampInt(point.x, 0, grid - 1, 0),
        y: clampInt(point.y, 0, grid - 1, 0),
        ...extra
    };
}

function parseTicks(value, period) {
    const parsed = String(value)
        .split(",")
        .map((item) => clampInt(item.trim(), 0, Math.max(0, period - 1), 0))
        .filter((item, index, arr) => arr.indexOf(item) === index);
    return parsed.length ? parsed : [0];
}

function cleanCircuit(value) {
    return String(value || "A").toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 4);
}

function colorForCircuit(circuit) {
    return COLORS[cleanCircuit(circuit)] || COLORS.A;
}

function dirLabel(dir) {
    return ["N", "E", "S", "W"][Number(dir) || 0];
}

function clampInt(value, min, max, fallback) {
    const number = Number.parseInt(value, 10);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, number));
}

function structuredCloneSafe(value) {
    return JSON.parse(JSON.stringify(value));
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
    return escapeHtml(value);
}
