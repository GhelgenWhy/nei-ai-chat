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
 * Capacitor's keyboardHeight tends to over-report (suggestion strip, rounded
 * corners) — the input ends up floating above the keyboard. Calibrated
 * on-device (MIUI): trim ~35px from bridge-reported heights.
 */
const KEYBOARD_HEIGHT_TRIM = 35;

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

    // The element must reach into the bottom QUARTER of the container — it does
    // NOT have to touch the very bottom edge: on Android the webview extends
    // behind the system navigation buttons, so Obsidian's floating navbar pill
    // hovers ~45px above the container bottom (data from on-device inspector).
    const quarterLine = containerRect.top + containerRect.height * 0.75;
    const inBottomRegion = rect.top < containerRect.bottom && rect.bottom >= quarterLine;
    const overlapsHorizontally = rect.left < containerRect.right && rect.right > containerRect.left;
    if (!inBottomRegion || !overlapsHorizontally) return 0;

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
    return measureChrome(container, chromeElements).inset;
}

export interface ChromeMeasure {
    /** Pixels of the container's bottom edge covered by the tallest chrome strip. */
    inset: number;
    /** Gap between the LOWEST chrome element's bottom edge and the container
     *  bottom — on Android this is the system navigation area (0 on desktop). */
    gapBelow: number;
}

/**
 * Measures known Obsidian chrome: max inset + the system-area gap below it.
 * Pure: pass chrome elements explicitly in tests.
 */
export function measureChrome(
    container: HTMLElement,
    chromeElements?: Iterable<Element>
): ChromeMeasure {
    const cRect = container.getBoundingClientRect();
    if (cRect.height <= 0 || cRect.width <= 0) return { inset: 0, gapBelow: 0 };

    const chrome = chromeElements ?? container.ownerDocument.querySelectorAll(OBSIDIAN_BOTTOM_CHROME_SELECTOR);

    let inset = 0;
    let lowestBottom = Infinity;
    const halfPoint = cRect.top + cRect.height * 0.5;
    const quarterLine = cRect.top + cRect.height * 0.75;
    for (const el of Array.from(chrome)) {
        const rect = (el as HTMLElement).getBoundingClientRect();
        if (rect.height <= 0 || rect.width <= 0) continue;
        // Chrome is a bottom strip, not a full-screen wrapper (see bottomOverlayOverlap)
        if (rect.top < halfPoint) continue;
        // Reaches the bottom quarter but may hover above the bottom edge
        // (system navigation area) — see bottomOverlayOverlap for rationale.
        const inBottomRegion = rect.top < cRect.bottom && rect.bottom >= quarterLine;
        const overlapsHorizontally = rect.left < cRect.right && rect.right > cRect.left;
        if (inBottomRegion && overlapsHorizontally) {
            inset = Math.max(inset, cRect.bottom - rect.top);
            lowestBottom = Math.min(lowestBottom, rect.bottom);
        }
    }
    const gapBelow = isFinite(lowestBottom)
        ? Math.max(0, Math.min(150, cRect.bottom - lowestBottom))
        : 0;
    return { inset: Math.ceil(inset), gapBelow: Math.round(gapBelow) };
}

/**
 * Deep scan: the maximum bottom overlap over ALL visible fixed/absolute
 * elements in the document that are not our own UI and not transient overlays
 * (notices, menus, modals). This is what catches the floating mobile navbar
 * pill without knowing its class name. Walks `body *` — call it debounced.
 */
export function scanBottomOverlaps(container: HTMLElement): ChromeMeasure {
    const doc = container.ownerDocument;
    const view = doc.defaultView;
    if (!view) return { inset: 0, gapBelow: 0 };
    const cRect = container.getBoundingClientRect();
    if (cRect.height <= 0 || cRect.width <= 0) return { inset: 0, gapBelow: 0 };

    let inset = 0;
    let lowestBottom = Infinity;
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

        const rect = el.getBoundingClientRect();
        const overlap = bottomOverlayOverlap(cRect, rect, {
            position: cs.position,
            display: cs.display,
            visibility: cs.visibility,
            opacity: Number(cs.opacity)
        });
        if (overlap > 0) {
            if (overlap > inset) inset = overlap;
            lowestBottom = Math.min(lowestBottom, rect.bottom);
        }
    }
    const gapBelow = isFinite(lowestBottom)
        ? Math.max(0, Math.min(150, cRect.bottom - lowestBottom))
        : 0;
    return { inset, gapBelow: Math.round(gapBelow) };
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

/** Gap below the panel that means "the keyboard already has its room". */
export const KEYBOARD_ROOM_THRESHOLD = 60;

export interface KeyboardInsetParams {
    kbOpen: boolean;
    layoutShrank: boolean;
    /** Empty space between the panel bottom and the viewport bottom. */
    roomBelow: number;
    vvInset: number;
    capInset: number;
}

/**
 * Decides how much of the bottom inset the keyboard itself contributes.
 *  - Resizing layout: the workspace already moved — 0.
 *  - Obsidian-made room: on mobile Obsidian may shrink the WORKSPACE (not the
 *    webview) when the keyboard opens (measured on device: main window, ih
 *    unchanged, pill removed from DOM, big gap below the panel). A large gap
 *    below the panel means the keyboard is already accounted for — 0.
 *  - Otherwise (keyboard purely overlays the page): the larger of the signals.
 */
export function resolveKeyboardInset(p: KeyboardInsetParams): number {
    if (p.layoutShrank) return 0;
    if (p.kbOpen && p.roomBelow > KEYBOARD_ROOM_THRESHOLD) return 0;
    return Math.max(p.vvInset, p.capInset);
}

/**
 * Watches a container and keeps `--nei-chrome-inset` up to date.
 * Returns a detach function.
 */
export function attachChromeInsetWatcher(container: HTMLElement): () => void {
    let baselineInnerHeight = window.innerHeight;
    let deep: ChromeMeasure = { inset: 0, gapBelow: 0 };
    // Android: the webview extends behind the system navigation area. When the
    // navbar pill auto-hides, this remembered gap keeps the input clear of it.
    let systemGap = 0;
    // Authoritative keyboard height from the Capacitor bridge — the only signal
    // on Android WebViews where the keyboard neither resizes the layout viewport
    // nor shrinks visualViewport (it just overlays the page).
    let capKeyboardInset = 0;
    // Separate "keyboard seen" flag: stays true even if the reported height
    // trims down to 0, so the open/closed state never flickers.
    let capKeyboardSeen = false;
    let deepTimer: number | null = null;
    const timers: number[] = [];
    const capListenerHandles: Array<Promise<unknown> | unknown> = [];

    const apply = () => {
        // Keyboard open = layout viewport shrank (resizing webview) OR the
        // Capacitor bridge reported a keyboard (non-resizing webviews, e.g. MIUI).
        const layoutShrank = window.innerHeight < baselineInnerHeight - 40;
        const kbOpen = layoutShrank || capKeyboardSeen;
        document.body.classList.toggle("nei-kb-open", kbOpen);

        const fast = measureChrome(container);
        if (fast.inset > 0) systemGap = Math.max(systemGap, fast.gapBelow);
        if (deep.inset > 0) systemGap = Math.max(systemGap, deep.gapBelow);
        const chromeInset = Math.max(fast.inset, deep.inset);
        // With the keyboard open the system nav area is behind it — no gap fallback.
        const effectiveChrome = kbOpen ? chromeInset : (chromeInset > 0 ? chromeInset : systemGap);
        const keyboardInset = computeKeyboardInset(
            baselineInnerHeight,
            window.innerHeight,
            window.visualViewport ?? undefined
        );
        // Keyboard closed again → re-baseline for the next open
        if (window.innerHeight >= baselineInnerHeight) baselineInnerHeight = window.innerHeight;
        const roomBelow = Math.max(0, window.innerHeight - container.getBoundingClientRect().bottom);
        const keyboard = resolveKeyboardInset({
            kbOpen,
            layoutShrank,
            roomBelow,
            vvInset: keyboardInset,
            capInset: capKeyboardInset
        });
        const total = Math.ceil(Math.max(effectiveChrome, keyboard));
        container.style.setProperty("--nei-chrome-inset", `${total}px`);
        // Telemetry for the layout inspector / remote debugging
        container.dataset.neiInset = String(total);
        container.dataset.neiFast = String(fast.inset);
        container.dataset.neiDeep = String(deep.inset);
        container.dataset.neiKb = String(keyboard);
        container.dataset.neiCap = String(capKeyboardInset);
        container.dataset.neiGap = String(systemGap);
        container.dataset.neiRoom = String(Math.round(roomBelow));
    };

    const measureDeep = () => {
        deep = scanBottomOverlaps(container);
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

    // Capacitor Keyboard bridge (Obsidian mobile runs on Capacitor). Sizes may
    // arrive in device pixels on some bridge versions — normalize by dpr when
    // implausible, and clamp so a bogus event can never hide the whole panel.
    // keyboardDidShow is authoritative: some ROMs report an inflated height on
    // keyboardWillShow (which alone made the input fly far above the keyboard
    // in the main window). willShow is only a timed fallback.
    let willShowTimer: number | null = null;
    try {
        const cap = (window as unknown as {
            Capacitor?: { Plugins?: { Keyboard?: { addListener?: (event: string, cb: (e: { keyboardHeight?: number }) => void) => unknown } } };
        }).Capacitor;
        const kb = cap?.Plugins?.Keyboard;
        if (kb && typeof kb.addListener === "function") {
            const normalize = (raw: number): number => {
                let h = Math.round(raw || 0);
                if (h > window.innerHeight * 0.8) {
                    h = Math.round(h / (window.devicePixelRatio || 1));
                }
                // A keyboard is never taller than ~55% of the viewport — some
                // ROMs/bridges over-report massively in resize-mode-off.
                return Math.max(0, Math.min(h - KEYBOARD_HEIGHT_TRIM, Math.round(window.innerHeight * 0.55)));
            };
            const setKeyboard = (h: number) => {
                capKeyboardSeen = true;
                capKeyboardInset = h;
                apply();
            };
            const onWillShow = (e: { keyboardHeight?: number }) => {
                const h = normalize(e?.keyboardHeight || 0);
                if (willShowTimer !== null) window.clearTimeout(willShowTimer);
                // Provisional: some ROMs never fire didShow — apply after 350ms
                willShowTimer = window.setTimeout(() => {
                    willShowTimer = null;
                    if (capKeyboardInset === 0) setKeyboard(h);
                }, 350);
            };
            const onDidShow = (e: { keyboardHeight?: number }) => {
                if (willShowTimer !== null) {
                    window.clearTimeout(willShowTimer);
                    willShowTimer = null;
                }
                setKeyboard(normalize(e?.keyboardHeight || 0));
            };
            const onHide = () => {
                if (willShowTimer !== null) {
                    window.clearTimeout(willShowTimer);
                    willShowTimer = null;
                }
                capKeyboardSeen = false;
                capKeyboardInset = 0;
                apply();
            };
            capListenerHandles.push(kb.addListener("keyboardWillShow", onWillShow));
            capListenerHandles.push(kb.addListener("keyboardDidShow", onDidShow));
            capListenerHandles.push(kb.addListener("keyboardWillHide", onHide));
            capListenerHandles.push(kb.addListener("keyboardDidHide", onHide));
        }
    } catch {
        /* not a Capacitor build — viewport-based keyboard logic still applies */
    }

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
        for (const handle of capListenerHandles) {
            try {
                Promise.resolve(handle).then((h) => {
                    const r = h as { remove?: () => void } | null | undefined;
                    r?.remove?.();
                }).catch(() => { /* bridge gone */ });
            } catch { /* ignore */ }
        }
        if (deepTimer !== null) window.clearTimeout(deepTimer);
        if (willShowTimer !== null) window.clearTimeout(willShowTimer);
        timers.forEach(t => window.clearTimeout(t));
        container.style.removeProperty("--nei-chrome-inset");
        delete container.dataset.neiInset;
        delete container.dataset.neiFast;
        delete container.dataset.neiDeep;
        delete container.dataset.neiKb;
        delete container.dataset.neiCap;
        delete container.dataset.neiGap;
        delete container.dataset.neiRoom;
        document.body.classList.remove("nei-kb-open");
    };
}
