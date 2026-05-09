export const DIRS = [
    { x: 0, y: -1, name: "north" },
    { x: 1, y: 0, name: "east" },
    { x: 0, y: 1, name: "south" },
    { x: -1, y: 0, name: "west" }
];

export function createState(level) {
    const power = {};
    for (const circuit of allCircuits(level)) power[circuit] = false;
    if (level.initialPower) {
        for (const [key, value] of Object.entries(level.initialPower)) power[key] = Boolean(value);
    }
    return {
        x: level.start.x,
        y: level.start.y,
        dir: level.start.dir,
        tick: 0,
        actions: 0,
        collected: new Set(),
        repaired: new Set(),
        power,
        guards: (level.guards || []).map((guard) => {
            const index = guard.phase || 0;
            const point = guard.path[index % guard.path.length];
            return { ...guard, index, x: point.x, y: point.y };
        }),
        enemies: (level.enemies || []).map((enemy, index) => ({
            ...enemy,
            id: enemy.id || `enemy-${index}`,
            alive: true,
            x: enemy.x,
            y: enemy.y
        })),
        failed: false,
        failReason: "",
        complete: false,
        lastEvents: []
    };
}

export function allCircuits(level) {
    const set = new Set(level.requiredPower || []);
    for (const sw of level.switches || []) set.add(sw.power);
    for (const door of level.doors || []) for (const circuit of door.requires || []) set.add(circuit);
    for (const bridge of level.bridges || []) for (const circuit of bridge.requires || []) set.add(circuit);
    return [...set];
}

export function starsFor(level, actions) {
    if (actions <= level.stars.three) return 3;
    if (actions <= level.stars.two) return 2;
    if (actions <= level.stars.one) return 1;
    return 0;
}

export function isPowerOn(state, circuit) {
    return Boolean(state.power[circuit]);
}

export function isComplete(level, state) {
    const hasAllChips = state.collected.size === (level.chips || []).length;
    const powered = (level.requiredPower || []).every((circuit) => isPowerOn(state, circuit));
    const cablesFixed = (level.cables || []).every((cable) => state.repaired.has(cable.id));
    return hasAllChips && powered && cablesFixed && state.x === level.exit.x && state.y === level.exit.y && !state.failed;
}

export function conditionPathClear(level, state) {
    const dir = DIRS[state.dir];
    return canEnter(level, state, state.x + dir.x, state.y + dir.y).ok;
}

export function canEnter(level, state, x, y) {
    if (x < 0 || x >= level.grid || y < 0 || y >= level.grid) return { ok: false, reason: "edge" };
    if ((level.obstacles || []).some((tile) => tile.x === x && tile.y === y)) return { ok: false, reason: "blocked platform" };
    const bridge = bridgeAt(level, x, y);
    if (bridge && !requiresAreOn(state, bridge.requires)) return { ok: false, reason: "offline bridge" };
    const door = doorAt(level, x, y);
    if (door && !requiresAreOn(state, door.requires)) return { ok: false, reason: "locked door" };
    if (guardAt(state, x, y)) return { ok: false, reason: "guard" };
    if (enemyAt(state, x, y)) return { ok: false, reason: "enemy" };
    if (laserAt(level, state, x, y)) return { ok: false, reason: "laser" };
    return { ok: true, reason: "" };
}

export function executePrimitive(level, state, type) {
    if (state.failed) return { ok: false, reason: state.failReason, events: [] };
    const events = [];
    const from = { x: state.x, y: state.y, dir: state.dir };

    if (type === "MoveForward") {
        const dir = DIRS[state.dir];
        const nx = state.x + dir.x;
        const ny = state.y + dir.y;
        const entry = canEnter(level, state, nx, ny);
        if (!entry.ok) return fail(state, entry.reason, events);
        state.x = nx;
        state.y = ny;
        events.push({ type: "move", from, to: { x: nx, y: ny, dir: state.dir } });
        collectChip(level, state, events);
    } else if (type === "TurnLeft") {
        state.dir = (state.dir + 3) % 4;
        events.push({ type: "turn", from, to: { x: state.x, y: state.y, dir: state.dir } });
    } else if (type === "TurnRight") {
        state.dir = (state.dir + 1) % 4;
        events.push({ type: "turn", from, to: { x: state.x, y: state.y, dir: state.dir } });
    } else if (type === "TurnAround") {
        state.dir = (state.dir + 2) % 4;
        events.push({ type: "turn", from, to: { x: state.x, y: state.y, dir: state.dir } });
    } else if (type === "Use") {
        const used = useCurrentTile(level, state, events);
        if (!used) events.push({ type: "use-empty", at: { x: state.x, y: state.y } });
    } else if (type === "Wait") {
        events.push({ type: "wait", at: { x: state.x, y: state.y } });
    } else if (type === "Shoot") {
        shootForward(level, state, events);
    } else {
        return fail(state, `unknown action ${type}`, events);
    }

    state.actions++;
    advanceWorld(level, state, events);
    collectChip(level, state, events);
    const hazard = hazardAtPlayer(level, state);
    if (hazard) return fail(state, hazard, events);
    state.complete = isComplete(level, state);
    state.lastEvents = events;
    return { ok: !state.failed, reason: state.failReason, events };
}

function fail(state, reason, events) {
    state.failed = true;
    state.failReason = reason;
    state.lastEvents = events;
    return { ok: false, reason, events };
}

function collectChip(level, state, events) {
    (level.chips || []).forEach((chip, index) => {
        if (chip.x === state.x && chip.y === state.y && !state.collected.has(index)) {
            state.collected.add(index);
            events.push({ type: "collect", index, at: { x: chip.x, y: chip.y } });
        }
    });
}

function useCurrentTile(level, state, events) {
    const cable = (level.cables || []).find((item) => item.x === state.x && item.y === state.y && !state.repaired.has(item.id));
    if (cable) {
        state.repaired.add(cable.id);
        events.push({ type: "repair", cableId: cable.id, at: { x: cable.x, y: cable.y } });
        return true;
    }
    const sw = (level.switches || []).find((item) => item.x === state.x && item.y === state.y);
    if (!sw) return false;
    const next = sw.mode === "toggle" ? !state.power[sw.power] : true;
    state.power[sw.power] = next;
    events.push({ type: "power", power: sw.power, value: next, at: { x: sw.x, y: sw.y } });
    return true;
}

function shootForward(level, state, events) {
    const dir = DIRS[state.dir];
    const from = { x: state.x, y: state.y, dir: state.dir };
    let x = state.x + dir.x;
    let y = state.y + dir.y;
    while (x >= 0 && x < level.grid && y >= 0 && y < level.grid) {
        if ((level.obstacles || []).some((tile) => tile.x === x && tile.y === y)) break;
        const door = doorAt(level, x, y);
        if (door && !requiresAreOn(state, door.requires)) break;
        const enemy = liveEnemyAt(state, x, y);
        if (enemy) {
            enemy.alive = false;
            events.push({ type: "shoot", hit: true, from, to: { x, y }, enemyId: enemy.id });
            return;
        }
        x += dir.x;
        y += dir.y;
    }
    events.push({ type: "shoot", hit: false, from, to: { x: state.x + dir.x * 2, y: state.y + dir.y * 2 } });
}

function advanceWorld(level, state, events) {
    state.tick++;
    state.guards.forEach((guard, guardIndex) => {
        if (!guard.path || guard.path.length < 1) return;
        guard.index = (guard.index + 1) % guard.path.length;
        const point = guard.path[guard.index];
        const from = { x: guard.x, y: guard.y };
        guard.x = point.x;
        guard.y = point.y;
        events.push({ type: "guard", guardIndex, from, to: { x: guard.x, y: guard.y } });
    });
    state.enemies.forEach((enemy, enemyIndex) => {
        if (!enemy.alive) return;
        const stepEvery = enemy.stepEvery || 1;
        if (state.tick % stepEvery !== 0) return;
        const from = { x: enemy.x, y: enemy.y };
        const next = nextEnemyStep(level, state, enemy);
        enemy.x = next.x;
        enemy.y = next.y;
        events.push({ type: "enemy", enemyIndex, from, to: { x: enemy.x, y: enemy.y } });
    });
    events.push({ type: "tick", tick: state.tick });
}

function hazardAtPlayer(level, state) {
    if (guardAt(state, state.x, state.y)) return "guard";
    if (enemyAt(state, state.x, state.y)) return "enemy reached Nova";
    if (laserAt(level, state, state.x, state.y)) return "laser";
    if (hiddenTrapAt(level, state.x, state.y)) return "hidden trap";
    const watcher = state.guards.find((guard) => guard.vision && guardSees(level, state, guard));
    if (watcher) return `${watcher.name || "guard"} vision`;
    return "";
}

function nextEnemyStep(level, state, enemy) {
    const dx = Math.sign(state.x - enemy.x);
    const dy = Math.sign(state.y - enemy.y);
    const options = Math.abs(state.x - enemy.x) >= Math.abs(state.y - enemy.y)
        ? [{ x: enemy.x + dx, y: enemy.y }, { x: enemy.x, y: enemy.y + dy }]
        : [{ x: enemy.x, y: enemy.y + dy }, { x: enemy.x + dx, y: enemy.y }];
    for (const option of options) {
        if (option.x === enemy.x && option.y === enemy.y) continue;
        if (canEnemyEnter(level, state, option.x, option.y, enemy.id)) return option;
    }
    return { x: enemy.x, y: enemy.y };
}

function canEnemyEnter(level, state, x, y, enemyId) {
    if (x < 0 || x >= level.grid || y < 0 || y >= level.grid) return false;
    if ((level.obstacles || []).some((tile) => tile.x === x && tile.y === y)) return false;
    const door = doorAt(level, x, y);
    if (door && !requiresAreOn(state, door.requires)) return false;
    const bridge = bridgeAt(level, x, y);
    if (bridge && !requiresAreOn(state, bridge.requires)) return false;
    if (state.guards.some((guard) => guard.x === x && guard.y === y)) return false;
    return !state.enemies.some((enemy) => enemy.alive && enemy.id !== enemyId && enemy.x === x && enemy.y === y);
}

function guardSees(level, state, guard) {
    if (guard.x !== state.x && guard.y !== state.y) return false;
    const distance = Math.abs(guard.x - state.x) + Math.abs(guard.y - state.y);
    if (distance === 0 || distance > guard.vision) return false;
    const stepX = Math.sign(state.x - guard.x);
    const stepY = Math.sign(state.y - guard.y);
    let x = guard.x + stepX;
    let y = guard.y + stepY;
    while (x !== state.x || y !== state.y) {
        if ((level.obstacles || []).some((tile) => tile.x === x && tile.y === y)) return false;
        const door = doorAt(level, x, y);
        if (door && !requiresAreOn(state, door.requires)) return false;
        x += stepX;
        y += stepY;
    }
    return true;
}

export function guardAt(state, x, y) {
    return state.guards.some((guard) => guard.x === x && guard.y === y);
}

export function enemyAt(state, x, y) {
    return Boolean(liveEnemyAt(state, x, y));
}

function liveEnemyAt(state, x, y) {
    return state.enemies.find((enemy) => enemy.alive && enemy.x === x && enemy.y === y);
}

export function laserAt(level, state, x, y) {
    return (level.lasers || []).some((laser) => {
        if (laser.disabledBy && isPowerOn(state, laser.disabledBy)) return false;
        if (!laser.cells.some((cell) => cell.x === x && cell.y === y)) return false;
        const period = laser.period || 1;
        const active = laser.active || [0];
        return active.includes(state.tick % period);
    });
}

export function hiddenTrapAt(level, x, y) {
    return (level.hiddenTraps || []).some((trap) => trap.x === x && trap.y === y);
}

export function doorAt(level, x, y) {
    return (level.doors || []).find((door) => door.x === x && door.y === y);
}

export function switchAt(level, x, y) {
    return (level.switches || []).find((sw) => sw.x === x && sw.y === y);
}

export function bridgeAt(level, x, y) {
    return (level.bridges || []).find((bridge) => bridge.cells.some((cell) => cell.x === x && cell.y === y));
}

export function requiresAreOn(state, requires = []) {
    return requires.every((circuit) => isPowerOn(state, circuit));
}

export function executeProgramSync(level, commands, state = createState(level), maxLoop = 240) {
    let loopGuard = 0;
    function runBlock(block) {
        for (const command of block) {
            if (state.failed || state.complete) return;
            if (command.type === "Repeat") {
                for (let i = 0; i < command.count; i++) runBlock(command.body);
            } else if (command.type === "IfPowerOn") {
                if (isPowerOn(state, command.power)) runBlock(command.body);
            } else if (command.type === "IfPathClear") {
                if (conditionPathClear(level, state)) runBlock(command.body);
            } else if (command.type === "WhilePathClear") {
                while (conditionPathClear(level, state) && !state.failed && !state.complete) {
                    loopGuard++;
                    if (loopGuard > maxLoop) {
                        fail(state, "loop limit", []);
                        return;
                    }
                    runBlock(command.body);
                }
            } else {
                executePrimitive(level, state, command.type);
            }
        }
    }
    collectChip(level, state, []);
    runBlock(commands);
    state.complete = isComplete(level, state);
    return state;
}

export function previewPath(level, commands) {
    const state = createState(level);
    const points = [{ x: state.x, y: state.y }];
    let failed = false;
    function apply(command) {
        if (failed) return;
        if (command.type === "Repeat") {
            for (let i = 0; i < command.count; i++) command.body.forEach(apply);
        } else if (command.type === "IfPowerOn") {
            if (isPowerOn(state, command.power)) command.body.forEach(apply);
        } else if (command.type === "IfPathClear") {
            if (conditionPathClear(level, state)) command.body.forEach(apply);
        } else if (command.type === "WhilePathClear") {
            let guard = 0;
            while (conditionPathClear(level, state) && guard < 100 && !failed) {
                guard++;
                command.body.forEach(apply);
            }
        } else {
            const result = executePrimitive(level, state, command.type);
            if (!result.ok) failed = true;
            if (command.type === "MoveForward") points.push({ x: state.x, y: state.y });
        }
    }
    commands.forEach(apply);
    return { points, failed };
}
