import { describe, test, expect } from "vitest";
import {
    measureBottomChromeInset,
    computeKeyboardInset
} from "../src/utils/obsidianChrome";

type Rect = { top: number; bottom: number; left: number; right: number; width: number; height: number };

function el(rect: Partial<Rect>): HTMLElement {
    const full: Rect = { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, ...rect };
    return {
        getBoundingClientRect: () => full
    } as unknown as HTMLElement;
}

function container(rect: Partial<Rect>): HTMLElement {
    return el({ top: 0, bottom: 800, left: 0, right: 400, width: 400, height: 800, ...rect });
}

// Desktop status bar: floats over the bottom of a full-height leaf
const statusBar: Partial<Rect> = { top: 776, bottom: 800, left: 0, right: 400, width: 400, height: 24 };

// Mobile toolbar above the keyboard: extends below the (unresized) container bottom
const mobileToolbar: Partial<Rect> = { top: 760, bottom: 860, left: 0, right: 400, width: 400, height: 100 };

describe("measureBottomChromeInset", () => {
    test("status bar overlapping the panel bottom yields its height", () => {
        const inset = measureBottomChromeInset(container(), [el(statusBar)]);
        expect(inset).toBe(24);
    });

    test("toolbar extending past the container bottom is fully counted", () => {
        const inset = measureBottomChromeInset(container(), [el(mobileToolbar)]);
        expect(inset).toBe(40); // 800 - 760
    });

    test("picks the largest overlap when several chrome elements stack", () => {
        const inset = measureBottomChromeInset(container(), [el(statusBar), el(mobileToolbar)]);
        expect(inset).toBe(40);
    });

    test("chrome below the container (other window / split) does not add inset", () => {
        const otherPaneBar: Partial<Rect> = { top: 1000, bottom: 1030, left: 0, right: 400, width: 400, height: 30 };
        expect(measureBottomChromeInset(container(), [el(otherPaneBar)])).toBe(0);
    });

    test("chrome that does not reach the container bottom is ignored", () => {
        const midBar: Partial<Rect> = { top: 300, bottom: 330, left: 0, right: 400, width: 400, height: 30 };
        expect(measureBottomChromeInset(container(), [el(midBar)])).toBe(0);
    });

    test("zero-size chrome elements are skipped", () => {
        expect(measureBottomChromeInset(container(), [el({ top: 776, bottom: 776, height: 0 })])).toBe(0);
    });

    test("no chrome → zero inset", () => {
        expect(measureBottomChromeInset(container(), [])).toBe(0);
    });
});

describe("computeKeyboardInset", () => {
    const vv = (height: number, offsetTop = 0) => ({ height, offsetTop });

    test("resized webview (Android/Capacitor): layout shrank → no extra inset", () => {
        // baseline 800 → innerHeight now 500 (webview resized by keyboard)
        expect(computeKeyboardInset(800, 500, vv(500))).toBe(0);
    });

    test("non-resizing webview (iOS edge): visual viewport shrank → keyboard height", () => {
        // layout stayed 800, visual viewport shrank to 500
        expect(computeKeyboardInset(800, 800, vv(500))).toBe(300);
    });

    test("accounts for visual viewport scroll offset", () => {
        // Visible region covers layout [100, 600] → bottom occlusion = 800 - 600 = 200
        expect(computeKeyboardInset(800, 800, vv(500, 100))).toBe(200);
    });

    test("keyboard closed → zero", () => {
        expect(computeKeyboardInset(800, 800, vv(800))).toBe(0);
    });

    test("no visualViewport API → zero", () => {
        expect(computeKeyboardInset(800, 800, undefined)).toBe(0);
    });
});
