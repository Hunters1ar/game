const PROGRESS_KEY = "scriptRunner3dProgressV2";
const SETTINGS_KEY = "scriptRunner3dSettingsV2";

export const DEFAULT_SETTINGS = {
    speed: 1.15,
    camera: "orbit",
    quality: "balanced",
    showPath: true,
    freeRun: false,
    sound: true
};

export function loadSettings() {
    try {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") };
    } catch {
        return { ...DEFAULT_SETTINGS };
    }
}

export function saveSettings(settings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function loadProgress(levelCount) {
    const fallback = {
        unlocked: 1,
        lastLevel: 0,
        levels: {}
    };
    try {
        const saved = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}");
        return {
            ...fallback,
            ...saved,
            unlocked: Math.max(1, Math.min(levelCount, Number(saved.unlocked || 1))),
            lastLevel: Math.max(0, Math.min(levelCount - 1, Number(saved.lastLevel || 0))),
            levels: saved.levels || {}
        };
    } catch {
        return fallback;
    }
}

export function saveProgress(progress) {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

export function resetProgress() {
    localStorage.removeItem(PROGRESS_KEY);
}

export function recordWin(progress, levelIndex, actionCount, stars, levelCount) {
    const current = progress.levels[levelIndex] || { completed: false, bestStars: 0, bestActions: null };
    const bestActions = current.bestActions == null ? actionCount : Math.min(current.bestActions, actionCount);
    progress.levels[levelIndex] = {
        completed: true,
        bestStars: Math.max(current.bestStars || 0, stars),
        bestActions
    };
    progress.lastLevel = levelIndex;
    progress.unlocked = Math.max(progress.unlocked || 1, Math.min(levelCount, levelIndex + 2));
    saveProgress(progress);
}
