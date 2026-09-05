/**
 * Runtime measurement of Obsidian app chrome that overlays a plugin view's
 * bottom edge and exposes it as a CSS variable.
 *
 * Why: Obsidian's own UI floats ON TOP of workspace leaves on both platforms —
 * desktop `.status-bar`, and on mobile the floating `.mobile-navbar` pill
 * (back/search/new-tab/menu) plus `.mobile-toolbar` above the keyboard. A
 * static padding guess cannot handle themes, plugins that enlarge the toolbar,
 * auto-hiding navbars, or version changes — so we measure actual geometry.
 *
 * Two layers:
 *  1. Fast path — known Obsidian chrome classes (cheap, runs on every event).
 *  2. Deep scan — walks the DOM for ANY visible fixed/absolute element that
 *     overlaps the container's bottom strip (catches the floating navbar pill
 *     regardless of its class name; debounced, runs on focus/resize/mutations).
 *
 * Consume in CSS:
 *   .my-input-container {
 *       padding-bottom: calc(max(env(safe-area-inset-bottom, 8px), 8px) + var(--nei-chrome-inset, 0px));
 *   }
 *
 * The pure functions are exported separately for unit testing.
 */

/** Obsidian DOM elements known to float over the bottom of workspace leaves. */
export const OBSIDIAN_BOTTOM_CHROME_SELECTOR = ".status-bar, .mobile-toolbar, .mobile-navbar";

/** Transient overlays that must not permanently pad the layout. */
export const TRANSIENT_OVERLAY_SELECTOR = ".notice, .menu, .modal-container";

export interface RectLike {
    top: number;
    bottom: number;
    left: number;
    right: number;
    width: number;
    height: number;
}

export interface OverlayStyleProbe {
    position: string;
    display: string;
    visibility: string;
    opacity: number;
}

/** Minimum believable chrome dimensions (filters FABs, handles, specks). */
const MIN_CHROME_HEIGHT = 16;
const MIN_CHROME_WIDTH = 80;

/**
 * How many pixels `rect` covers of the container's bottom strip, given its
 * computed style. Returns 0 for non-overlays (static elements, hidden
 * elements, tiny floating buttons, elements translated off the bottom edge)
 * and for BACKDROPS: an element that starts in the top half of the container
 * (full-screen dim layers behind drawers, app shell overlays) covers too much
 * to be chrome — padding for it would collapse the whole layout.
 */
export function bottomOverlayOverlap(
    containerRect: RectLike,
    rect: RectLike,
    style: OverlayStyleProbe
): number {
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === 0) return 0;
    if (style.position !== "fixed" && style.position !== "absolute") return 0;
    if (rect.height < MIN_CHROME_HEIGHT || rect.width < MIN_CHROME_WIDTH) return 0;

    // Chrome is a horizontal STRIP anchored at the bottom, not a backdrop.
    const halfPoint = containerRect.top + containerRect.height * 0.5;
    if (rect.top < halfPoint) return 0;

    // Must reach into the container's bottom strip (2px tolerance for rounding)
    const touchesBottom = rect.top < containerRect.bottom && rect.bottom >= containerRect.bottom - 2;
    const overlapsHorizontally = rect.left < containerRect.right && rect.right > containerRect.left;
    if (!touchesBottom || !overlapsHorizontally) return 0;

    return Math.ceil(containerRect.bottom - rect.top);
}

/**
 * Fast path: overlap of known Obsidian chrome classes.
 * Pure: pass chrome elements explicitly in tests.
 */
export function measureBottomChromeInset(
    container: HTMLElement,
    chromeElements?: Iterable<Element>
): number {
    const cRect = container.getBoundingClientRect();
    if (cRect.height <= 0 || cRect.width <= 0) return 0;

    const chrome = chromeElements ?? container.ownerDocument.querySelectorAll(OBSIDIAN_BOTTOM_CHROME_SELECTOR);

    let inset = 0;
    const halfPoint = cRect.top + cRect.height * 0.5;
    for (const el of Array.from(chrome)) {
        const rect = (el as HTMLElement).getBoundingClientRect();
        if (rect.height <= 0 || rect.width <= 0) continue;
        // Chrome is a bottom strip, not a full-screen wrapper (see bottomOverlayOverlap)
        if (rect.top < halfPoint) continue;
        const touchesBottom = rect.top < cRect.bottom && rect.bottom >= cRect.bottom - 2;
        const overlapsHorizontally = rect.left < cRect.right && rect.right > cRect.left;
        if (touchesBottom && overlapsHorizontally) {
            inset = Math.max(inset, cRect.bottom - rect.top);
        }
    }
    return Math.ceil(inset);
}

/**
 * Deep scan: the maximum bottom overlap over ALL visible fixed/absolute
 * elements in the document that are not our own UI and not transient overlays
 * (notices, menus, modals). This is what catches the floating mobile navbar
 * pill without knowing its class name. Walks `body *` — call it debounced.
 */
export function scanBottomOverlaps(container: HTMLElement): number {
    const doc = container.ownerDocument;
    const view = doc.defaultView;
    if (!view) return 0;
    const cRect = container.getBoundingClientRect();
    if (cRect.height <= 0 || cRect.width <= 0) return 0;

    let maxOverlap = 0;
    const all = doc.querySelectorAll<HTMLElement>("body *");
    for (const el of Array.from(all)) {
        // Skip ourselves, our ancestors (app shell), and our descendants
        if (el === container || el.contains(container) || container.contains(el)) continue;
        if (el.closest(TRANSIENT_OVERLAY_SELECTOR)) continue;

        let cs: CSSStyleDeclaration;
        try {
            cs = view.getComputedStyle(el);
        } catch {
            continue;
        }

        const overlap = bottomOverlayOverlap(cRect, el.getBoundingClientRect(), {
            position: cs.position,
            display: cs.display,
            visibility: cs.visibility,
            opacity: Number(cs.opacity)
        });
        if (overlap > maxOverlap) maxOverlap = overlap;
    }
    return maxOverlap;
}

/**
 * Keyboard occlusion for webviews that do NOT resize on keyboard open:
 * layout viewport stays tall while the visual viewport shrinks.
 * When the webview itself resizes (Capacitor default), the layout already
 * accounts for the keyboard and this returns 0 — no double padding.
 */
export function computeKeyboardInset(
    baselineInnerHeight: number,
    currentInnerHeight: number,
    visualViewport: { height: number; offsetTop: number } | undefined
): number {
    if (!visualViewport) return 0;
    const layoutShrank = currentInnerHeight < baselineInnerHeight - 40;
    if (layoutShrank) return 0;
    return Math.max(0, currentInnerHeight - visualViewport.height - visualViewport.offsetTop);
}

/**
 * Watches a container and keeps `--nei-chrome-inset` up to date.
 * Returns a detach function.
 */
export function attachChromeInsetWatcher(container: HTMLElement): () => void {
    let baselineInnerHeight = window.innerHeight;
    let deepInset = 0;
    let deepTimer: number | null = null;
    const timers: number[] = [];

    const apply = () => {
        const fastInset = measureBottomChromeInset(container);
        const keyboardInset = computeKeyboardInset(
            baselineInnerHeight,
            window.innerHeight,
            window.visualViewport ?? undefined
        );
        // Keyboard closed again → re-baseline for the next open
        if (window.innerHeight >= baselineInnerHeight) baselineInnerHeight = window.innerHeight;
        const total = Math.ceil(Math.max(fastInset, deepInset) + keyboardInset);
        container.style.setProperty("--nei-chrome-inset", `${total}px`);
    };

    const measureDeep = () => {
        deepInset = scanBottomOverlaps(container);
        apply();
    };

    // Debounced: the deep scan walks the whole document
    const scheduleDeep = () => {
        if (deepTimer !== null) return;
        deepTimer = window.setTimeout(() => {
            deepTimer = null;
            measureDeep();
        }, 250);
    };

    // .mobile-toolbar / keyboard chrome appears with an animation delay after focus
    const delayedRemeasure = () => {
        [200, 600, 1200].forEach(ms => {
            timers.push(window.setTimeout(() => {
                apply();
                scheduleDeep();
            }, ms));
        });
    };

    const onResize = () => {
        apply();
        scheduleDeep();
    };

    window.addEventListener("resize", onResize);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", onResize);
    vv?.addEventListener("scroll", apply);
    container.ownerDocument.addEventListener("focusin", delayedRemeasure);
    container.ownerDocument.addEventListener("focusout", delayedRemeasure);

    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(onResize) : null;
    ro?.observe(container);

    // Notices, menus and toolbars mount as body children — re-scan when they do
    let mo: MutationObserver | null = null;
    if (typeof MutationObserver !== "undefined" && container.ownerDocument.body) {
        mo = new MutationObserver(scheduleDeep);
        mo.observe(container.ownerDocument.body, { childList: true, subtree: false });
    }

    apply();
    scheduleDeep();
    delayedRemeasure();

    return () => {
        window.removeEventListener("resize", onResize);
        vv?.removeEventListener("resize", onResize);
        vv?.removeEventListener("scroll", apply);
        container.ownerDocument.removeEventListener("focusin", delayedRemeasure);
        container.ownerDocument.removeEventListener("focusout", delayedRemeasure);
        ro?.disconnect();
        mo?.disconnect();
        if (deepTimer !== null) window.clearTimeout(deepTimer);
        timers.forEach(t => window.clearTimeout(t));
        container.style.removeProperty("--nei-chrome-inset");
    };
}
