export type Direction = 0 | 1 | 2 | 3;
export type CommandKey =
    | "MoveForward"
    | "TurnLeft"
    | "TurnRight"
    | "Repeat"
    | "Use"
    | "Wait"
    | "Shoot"
    | "IfPowerOn"
    | "IfPathClear"
    | "WhilePathClear"
    | "TurnAround";

export interface Point {
    x: number;
    y: number;
}

export interface Door extends Point {
    requires: string[];
    color?: number;
}

export interface Switch extends Point {
    power: string;
    mode: "on" | "toggle";
    color?: number;
}

export interface Bridge {
    cells: Point[];
    requires: string[];
    color?: number;
}

export interface Guard {
    name: string;
    path: Point[];
    color?: number;
    phase?: number;
    vision?: number;
}

export interface Laser {
    cells: Point[];
    period: number;
    active: number[];
    color?: number;
    disabledBy?: string;
}

export interface Cable extends Point {
    id: string;
    color?: number;
}

export interface Enemy extends Point {
    name: string;
    color?: number;
    stepEvery?: number;
}

export interface Level {
    id: string;
    name: string;
    introduces: string;
    grid: number;
    start: Point & { dir: Direction };
    exit: Point;
    chips: Point[];
    obstacles: Point[];
    switches: Switch[];
    doors: Door[];
    bridges: Bridge[];
    guards: Guard[];
    enemies: Enemy[];
    cables: Cable[];
    lasers: Laser[];
    requiredPower: string[];
    allowed: CommandKey[];
    stars: { three: number; two: number; one: number };
    mission: string;
    template: string;
}

export interface RuntimeState {
    x: number;
    y: number;
    dir: Direction;
    tick: number;
    actions: number;
    collected: Set<number>;
    power: Record<string, boolean>;
    failed: boolean;
    failReason: string;
    complete: boolean;
    repaired: Set<string>;
}
