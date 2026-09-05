/**
 * Runtime measurement of Obsidian app chrome that overlays a plugin view's
 * bottom edge (desktop .status-bar, mobile .mobile-toolbar), plus a guarded
 * keyboard-occlusion fallback for webviews that do not resize.
 *
 * Copy into the plugin, call `attachChromeInsetWatcher(containerEl)` in the
 * view/component mount, and consume `--nei-chrome-inset` in CSS:
 *
 *   .my-input-container {
 *       padding-bottom: calc(max(env(safe-area-inset-bottom, 8px), 8px) + var(--nei-chrome-inset, 0px));
 *   }
 *
 * The pure function is exported separately for unit testing.
 */

/** Obsidian DOM elements that float over the bottom of workspace leaves. */
export const OBSIDIAN_BOTTOM_CHROME_SELECTOR = ".status-bar, .mobile-toolbar";

/**
 * Computes how many pixels of the container's bottom edge are covered by
 * Obsidian chrome. Pure: pass chrome elements explicitly in tests.
 */
export function measureBottomChromeInset(
    container: HTMLElement,
    chromeElements?: Iterable<Element>
): number {
    const cRect = container.getBoundingClientRect();
    if (cRect.height <= 0 || cRect.width <= 0) return 0;

    const chrome = chromeElements ?? container.ownerDocument.querySelectorAll(OBSIDIAN_BOTTOM_CHROME_SELECTOR);

    let inset = 0;
    for (const el of Array.from(chrome)) {
        const rect = (el as HTMLElement).getBoundingClientRect();
        if (rect.height <= 0 || rect.width <= 0) continue;
        // The element must reach into the container's bottom strip
        const touchesBottom = rect.top < cRect.bottom && rect.bottom >= cRect.bottom - 2;
        const overlapsHorizontally = rect.left < cRect.right && rect.right > cRect.left;
        if (touchesBottom && overlapsHorizontally) {
            inset = Math.max(inset, cRect.bottom - rect.top);
        }
    }
    return Math.ceil(inset);
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

    const apply = () => {
        const chromeInset = measureBottomChromeInset(container);
        const keyboardInset = computeKeyboardInset(
            baselineInnerHeight,
            window.innerHeight,
            window.visualViewport ?? undefined
        );
        // Keyboard closed again → re-baseline for the next open
        if (window.innerHeight >= baselineInnerHeight) baselineInnerHeight = window.innerHeight;
        container.style.setProperty("--nei-chrome-inset", `${Math.ceil(chromeInset + keyboardInset)}px`);
    };

    // .mobile-toolbar appears with an animation delay after focus — re-measure
    const delayedRemeasure = () => {
        [200, 600, 1200].forEach(ms => window.setTimeout(apply, ms));
    };

    const vv = window.visualViewport;
    window.addEventListener("resize", apply);
    vv?.addEventListener("resize", apply);
    vv?.addEventListener("scroll", apply);
    container.ownerDocument.addEventListener("focusin", delayedRemeasure);
    container.ownerDocument.addEventListener("focusout", delayedRemeasure);

    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(apply) : null;
    ro?.observe(container);

    apply();
    delayedRemeasure();

    return () => {
        window.removeEventListener("resize", apply);
        vv?.removeEventListener("resize", apply);
        vv?.removeEventListener("scroll", apply);
        container.ownerDocument.removeEventListener("focusin", delayedRemeasure);
        container.ownerDocument.removeEventListener("focusout", delayedRemeasure);
        ro?.disconnect();
        container.style.removeProperty("--nei-chrome-inset");
    };
}
