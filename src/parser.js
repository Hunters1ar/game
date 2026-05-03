import { COMMANDS } from "./command-library.js";

const REPEAT_RE = /^Repeat\(\s*(\d+)\s*,\s*function\s*\(\)\s*\{\s*$/;
const IF_POWER_RE = /^IfPowerOn\(\s*["']([A-Za-z0-9_-]+)["']\s*,\s*function\s*\(\)\s*\{\s*$/;
const IF_PATH_RE = /^IfPathClear\(\s*function\s*\(\)\s*\{\s*$/;
const WHILE_PATH_RE = /^WhilePathClear\(\s*function\s*\(\)\s*\{\s*$/;

export function parseCode(code, allowedKeys) {
    const allowed = new Set(allowedKeys);
    const lines = code.replace(/\r/g, "").split("\n");
    const errors = [];
    let index = 0;

    function ensureAllowed(key, line) {
        if (!COMMANDS[key]) {
            errors.push({ line, message: `Unknown command family: ${key}` });
            return false;
        }
        if (!allowed.has(key)) {
            errors.push({ line, message: `${COMMANDS[key].label} is locked on this floor.` });
            return false;
        }
        return true;
    }

    function parseBlock(expectClose) {
        const commands = [];
        while (index < lines.length) {
            const lineNo = index;
            const raw = lines[index++];
            const line = raw.trim();
            if (!line || line.startsWith("//")) continue;

            if (line === "});" || line === "}") {
                if (!expectClose) {
                    errors.push({ line: lineNo, message: "Unexpected block close." });
                }
                return { commands, closed: true };
            }

            if (line === "MoveForward();") {
                if (ensureAllowed("MoveForward", lineNo)) commands.push({ type: "MoveForward", line: lineNo });
                continue;
            }
            if (line === "TurnLeft();") {
                if (ensureAllowed("TurnLeft", lineNo)) commands.push({ type: "TurnLeft", line: lineNo });
                continue;
            }
            if (line === "TurnRight();") {
                if (ensureAllowed("TurnRight", lineNo)) commands.push({ type: "TurnRight", line: lineNo });
                continue;
            }
            if (line === "TurnAround();") {
                if (ensureAllowed("TurnAround", lineNo)) commands.push({ type: "TurnAround", line: lineNo });
                continue;
            }
            if (line === "Use();") {
                if (ensureAllowed("Use", lineNo)) commands.push({ type: "Use", line: lineNo });
                continue;
            }
            if (line === "Wait();") {
                if (ensureAllowed("Wait", lineNo)) commands.push({ type: "Wait", line: lineNo });
                continue;
            }
            if (line === "Shoot();") {
                if (ensureAllowed("Shoot", lineNo)) commands.push({ type: "Shoot", line: lineNo });
                continue;
            }

            const repeatMatch = line.match(REPEAT_RE);
            if (repeatMatch) {
                ensureAllowed("Repeat", lineNo);
                const count = Number(repeatMatch[1]);
                if (count < 1 || count > 100) {
                    errors.push({ line: lineNo, message: "Repeat count must be 1 through 100." });
                }
                const inner = parseBlock(true);
                if (!inner.closed) errors.push({ line: lineNo, message: "Repeat block is missing });" });
                commands.push({ type: "Repeat", line: lineNo, count, body: inner.commands });
                continue;
            }

            const powerMatch = line.match(IF_POWER_RE);
            if (powerMatch) {
                ensureAllowed("IfPowerOn", lineNo);
                const inner = parseBlock(true);
                if (!inner.closed) errors.push({ line: lineNo, message: "IfPowerOn block is missing });" });
                commands.push({ type: "IfPowerOn", line: lineNo, power: powerMatch[1], body: inner.commands });
                continue;
            }

            if (IF_PATH_RE.test(line)) {
                ensureAllowed("IfPathClear", lineNo);
                const inner = parseBlock(true);
                if (!inner.closed) errors.push({ line: lineNo, message: "IfPathClear block is missing });" });
                commands.push({ type: "IfPathClear", line: lineNo, body: inner.commands });
                continue;
            }

            if (WHILE_PATH_RE.test(line)) {
                ensureAllowed("WhilePathClear", lineNo);
                const inner = parseBlock(true);
                if (!inner.closed) errors.push({ line: lineNo, message: "WhilePathClear block is missing });" });
                commands.push({ type: "WhilePathClear", line: lineNo, body: inner.commands });
                continue;
            }

            errors.push({ line: lineNo, message: `Unknown command: ${line}` });
        }
        return { commands, closed: !expectClose };
    }

    const result = parseBlock(false);
    return { commands: result.commands, errors, lines };
}

export function flattenActions(commands, output = []) {
    for (const command of commands) {
        if (command.type === "Repeat") {
            for (let i = 0; i < command.count; i++) flattenActions(command.body, output);
        } else if (command.body) {
            flattenActions(command.body, output);
        } else {
            output.push(command);
        }
    }
    return output;
}
