export const COMMANDS = {
    MoveForward: {
        key: "MoveForward",
        label: "MoveForward()",
        insert: "MoveForward();\n",
        description: "Move one platform forward.",
        kind: "basic"
    },
    TurnLeft: {
        key: "TurnLeft",
        label: "TurnLeft()",
        insert: "TurnLeft();\n",
        description: "Rotate Nova left.",
        kind: "basic"
    },
    TurnRight: {
        key: "TurnRight",
        label: "TurnRight()",
        insert: "TurnRight();\n",
        description: "Rotate Nova right.",
        kind: "basic"
    },
    Repeat: {
        key: "Repeat",
        label: "Repeat()",
        insert: "Repeat(3, function() {\n  MoveForward();\n});\n",
        description: "Run a block multiple times.",
        kind: "block"
    },
    Use: {
        key: "Use",
        label: "Use()",
        insert: "Use();\n",
        description: "Activate the switch or terminal on Nova's platform.",
        kind: "action"
    },
    Wait: {
        key: "Wait",
        label: "Wait()",
        insert: "Wait();\n",
        description: "Spend one action while guards and lasers advance.",
        kind: "action"
    },
    Shoot: {
        key: "Shoot",
        label: "Shoot()",
        insert: "Shoot();\n",
        description: "Fire a pulse forward and remove the first enemy in line.",
        kind: "action"
    },
    IfPowerOn: {
        key: "IfPowerOn",
        label: "IfPowerOn()",
        insert: "IfPowerOn(\"A\", function() {\n  MoveForward();\n});\n",
        description: "Run a block only when a named power circuit is on.",
        kind: "block"
    },
    IfPathClear: {
        key: "IfPathClear",
        label: "IfPathClear()",
        insert: "IfPathClear(function() {\n  MoveForward();\n});\n",
        description: "Run a block only if Nova can move forward.",
        kind: "block"
    },
    WhilePathClear: {
        key: "WhilePathClear",
        label: "WhilePathClear()",
        insert: "WhilePathClear(function() {\n  MoveForward();\n});\n",
        description: "Keep running a block while the next platform is clear.",
        kind: "block"
    },
    TurnAround: {
        key: "TurnAround",
        label: "TurnAround()",
        insert: "TurnAround();\n",
        description: "Rotate Nova 180 degrees in one action.",
        kind: "action"
    }
};

export const BASE_COMMANDS = ["MoveForward", "TurnLeft", "TurnRight"];

export function commandList(keys) {
    const allowed = new Set(keys);
    return Object.values(COMMANDS).filter((command) => allowed.has(command.key));
}
