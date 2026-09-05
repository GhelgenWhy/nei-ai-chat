import { describe, test, expect } from "vitest";
import {
    measureBottomChromeInset,
    measureChrome,
    computeKeyboardInset,
    bottomOverlayOverlap
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

const visibleFixed = { position: "fixed", display: "block", visibility: "visible", opacity: 1 };

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

describe("bottomOverlayOverlap (deep scan predicate — floating mobile navbar pill)", () => {
    const cRect: Rect = { top: 0, bottom: 800, left: 0, right: 400, width: 400, height: 800 };

    test("fixed floating pill overlapping the bottom is counted with full clearance", () => {
        // MIUI/Obsidian mobile navbar pill: centered, covers the input row
        const pill: Rect = { top: 700, bottom: 800, left: 30, right: 370, width: 340, height: 100 };
        expect(bottomOverlayOverlap(cRect, pill, visibleFixed)).toBe(100);
    });

    test("auto-hidden pill (translated below the viewport) is ignored", () => {
        const hidden: Rect = { top: 810, bottom: 910, left: 30, right: 370, width: 340, height: 100 };
        expect(bottomOverlayOverlap(cRect, hidden, visibleFixed)).toBe(0);
    });

    test("static in-flow element is ignored (only fixed/absolute overlay)", () => {
        const pill: Rect = { top: 700, bottom: 800, left: 30, right: 370, width: 340, height: 100 };
        expect(bottomOverlayOverlap(cRect, pill, { ...visibleFixed, position: "static" })).toBe(0);
    });

    test("hidden / transparent elements are ignored", () => {
        const pill: Rect = { top: 700, bottom: 800, left: 30, right: 370, width: 340, height: 100 };
        expect(bottomOverlayOverlap(cRect, pill, { ...visibleFixed, display: "none" })).toBe(0);
        expect(bottomOverlayOverlap(cRect, pill, { ...visibleFixed, visibility: "hidden" })).toBe(0);
        expect(bottomOverlayOverlap(cRect, pill, { ...visibleFixed, opacity: 0 })).toBe(0);
    });

    test("small floating buttons (FABs) are below the chrome size threshold", () => {
        const fab: Rect = { top: 730, bottom: 786, left: 320, right: 376, width: 56, height: 56 };
        expect(bottomOverlayOverlap(cRect, fab, visibleFixed)).toBe(0);
    });

    test("element off to the side without horizontal overlap is ignored", () => {
        const sideBar: Rect = { top: 700, bottom: 800, left: 500, right: 900, width: 400, height: 100 };
        expect(bottomOverlayOverlap(cRect, sideBar, visibleFixed)).toBe(0);
    });

    test("absolute-positioned overlay (drawer content) is counted too", () => {
        const drawer: Rect = { top: 650, bottom: 820, left: 0, right: 400, width: 400, height: 170 };
        expect(bottomOverlayOverlap(cRect, drawer, { ...visibleFixed, position: "absolute" })).toBe(150);
    });

    test("full-screen backdrop layer (drawer dim) is NOT chrome — must not pad", () => {
        // Regression: a fixed backdrop covering the panel from the top produced
        // an inset equal to the panel height and collapsed the message list.
        const backdrop: Rect = { top: 0, bottom: 800, left: 0, right: 400, width: 400, height: 800 };
        expect(bottomOverlayOverlap(cRect, backdrop, visibleFixed)).toBe(0);
    });

    test("overlay starting in the top half is treated as backdrop, not chrome", () => {
        const tallOverlay: Rect = { top: 100, bottom: 800, left: 0, right: 400, width: 400, height: 700 };
        expect(bottomOverlayOverlap(cRect, tallOverlay, visibleFixed)).toBe(0);
    });

    test("measureBottomChromeInset skips full-screen wrappers of known classes", () => {
        const wrapper: Partial<Rect> = { top: 0, bottom: 800, left: 0, right: 400, width: 400, height: 800 };
        expect(measureBottomChromeInset(container(), [el(wrapper)])).toBe(0);
    });
});

describe("Android floating navbar pill (measured on device: ih=904, pill 807..859, safe-b=0)", () => {
    // Real geometry from the phone: webview extends behind system nav buttons,
    // the pill hovers 45px above the container bottom.
    const phoneContainer = () => container({ top: 0, bottom: 904, left: 0, right: 406, width: 406, height: 904 });
    const phonePill: Partial<Rect> = { top: 807, bottom: 859, left: 44, right: 360, width: 316, height: 52 };

    test("pill hovering above the bottom edge IS counted (regression)", () => {
        expect(measureBottomChromeInset(phoneContainer(), [el(phonePill)])).toBe(97);
    });

    test("measureChrome reports the system-area gap below the pill", () => {
        const m = measureChrome(phoneContainer(), [el(phonePill)]);
        expect(m.inset).toBe(97);
        expect(m.gapBelow).toBe(45);
    });

    test("deep-scan predicate counts the same pill", () => {
        const cRect: Rect = { top: 0, bottom: 904, left: 0, right: 406, width: 406, height: 904 };
        const pill: Rect = { top: 807, bottom: 859, left: 44, right: 360, width: 316, height: 52 };
        expect(bottomOverlayOverlap(cRect, pill, visibleFixed)).toBe(97);
    });

    test("gapBelow clamps to 150px for strips far above the bottom", () => {
        const strip: Partial<Rect> = { top: 500, bottom: 620, left: 0, right: 400, width: 400, height: 120 };
        // top 500 ≥ half 400 ✓, bottom 620 ≥ quarter 600 ✓ → counted; gap 800-620=180 → clamp 150
        const m = measureChrome(container(), [el(strip)]);
        expect(m.inset).toBe(300);
        expect(m.gapBelow).toBe(150);
    });
});

describe("computeKeyboardInset", () => {
    const vv = (height: number, offsetTop = 0) => ({ height, offsetTop });

    test("resized webview (Android/Capacitor): layout shrank → no extra inset", () => {
        expect(computeKeyboardInset(800, 500, vv(500))).toBe(0);
    });

    test("non-resizing webview (iOS edge): visual viewport shrank → keyboard height", () => {
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
