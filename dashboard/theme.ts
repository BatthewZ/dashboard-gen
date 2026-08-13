/**
 * The palette the document wears, and the node that makes it visible.
 */
import type { ViewNode } from "@batthewz/response-ui-renderer/spec";

/**
 * Deep ocean. A complete palette rather than a brand re-tint.
 *
 * `themeOverrides` cannot set `color-scheme` — it is a CSS property, not a custom one —
 * so whatever follows the host's light/dark scheme keeps following it. That is survivable
 * *here specifically*, and the residue is smaller than it first looks: every surface, text,
 * border and status token is set, so nothing falls back to a host neutral; the package
 * paints scrollbars from `--C-BORDER-DEFAULT` rather than from the scheme, so the
 * scrollports are themed too; and the document contains no native form control, which is
 * where the rest of the scheme-dependent chrome would have been. What is genuinely left is
 * the caret and the focus-ring default on elements this page never renders. A page with an
 * `Input` on it would not get off so lightly.
 *
 * Not touched, on purpose: the responsive scales (`--H1`-`--H6`, `--BodyText-*` and their
 * line heights, `--R-SIZE-*`, the weight tokens). They step up at a 40rem media query and
 * an inline override is one flat value at every width, which would freeze that step.
 */
export const DEEP_OCEAN: Record<string, string> = {
  // Surfaces run raised (0) to recessed (3); the canvas sits between rungs 1 and 2, and
  // never at pure black — the recessed rungs need somewhere below the page floor to go.
  "--C-CANVAS": "oklch(0.2 0.042 242)",
  "--C-SURFACE-0": "oklch(0.28 0.045 240)",
  "--C-SURFACE-1": "oklch(0.24 0.044 241)",
  "--C-SURFACE-2": "oklch(0.175 0.04 243)",
  "--C-SURFACE-3": "oklch(0.14 0.038 245)",

  // Bioluminescence: the only bright things down here.
  "--C-PRIMARY": "oklch(0.66 0.125 208)",
  "--C-PRIMARY-HOVER": "oklch(0.72 0.13 208)",
  "--C-PRIMARY-ACTIVE": "oklch(0.6 0.12 208)",
  "--C-TEXT-ON-PRIMARY": "oklch(0.17 0.04 235)",
  "--C-SECONDARY": "oklch(0.33 0.05 236)",
  "--C-SECONDARY-HOVER": "oklch(0.39 0.055 236)",
  "--C-ACCENT": "oklch(0.78 0.135 190)",
  "--C-ACCENT-HOVER": "oklch(0.84 0.13 190)",
  "--C-TEXT-ON-ACCENT": "oklch(0.16 0.035 200)",

  "--C-TEXT-PRIMARY": "oklch(0.94 0.018 210)",
  "--C-TEXT-SECONDARY": "oklch(0.79 0.03 205)",
  "--C-TEXT-MUTED": "oklch(0.66 0.035 210)",
  "--C-TEXT-INVERSE": "oklch(0.18 0.04 240)",

  "--C-BORDER-DEFAULT": "oklch(0.34 0.045 238)",
  "--C-BORDER-STRONG": "oklch(0.5 0.06 225)",
  "--C-BORDER-FOCUS": "oklch(0.78 0.135 190)",

  // Each foreground is chosen to read on its own tinted background, not on the canvas.
  "--C-STATUS-SUCCESS": "oklch(0.8 0.14 172)",
  "--C-STATUS-SUCCESS-BG": "oklch(0.27 0.055 174)",
  "--C-STATUS-WARNING": "oklch(0.84 0.13 88)",
  "--C-STATUS-WARNING-BG": "oklch(0.29 0.05 82)",
  "--C-STATUS-ERROR": "oklch(0.72 0.15 18)",
  "--C-STATUS-ERROR-BG": "oklch(0.28 0.07 20)",
  "--C-STATUS-INFO": "oklch(0.8 0.1 232)",
  "--C-STATUS-INFO-BG": "oklch(0.28 0.05 235)",

  // Set explicitly rather than relying on these inheriting the accent pair.
  "--C-SELECTION": "oklch(0.78 0.135 190)",
  "--C-TEXT-ON-SELECTION": "oklch(0.16 0.035 200)",

  "--RADIUS-SM": "0.25rem",
  "--RADIUS-MD": "0.5rem",
  "--RADIUS-LG": "0.875rem",
  "--RADIUS-XL": "1.25rem",

  // Deep water swallows light: darker and tighter than the default shadows, not blurrier.
  "--SHADOW-SM": "0 1px 2px oklch(0.08 0.03 245 / 0.55)",
  "--SHADOW-MD":
    "0 6px 14px -4px oklch(0.07 0.03 245 / 0.7), 0 2px 5px -2px oklch(0.07 0.03 245 / 0.55)",
  "--SHADOW-LG":
    "0 18px 36px -10px oklch(0.06 0.03 245 / 0.8), 0 6px 12px -6px oklch(0.06 0.03 245 / 0.6)",

  "--OVERLAY-SCRIM-COLOR": "oklch(0.1 0.04 245 / 0.78)",
  "--OVERLAY-GRADIENT-START": "oklch(0.1 0.04 245 / 0)",
  "--OVERLAY-GRADIENT-END": "oklch(0.1 0.04 245 / 0.92)",
  "--OVERLAY-BLUR": "0.25rem",
  "--OVERLAY-BLUR-HEAVY": "0.75rem",

  "--HEADING-FONT": 'ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Consolas, monospace',
  "--HEADING-LETTER-SPACING": "0.01em",
  "--DEFAULT-MONO-FONT": "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",

  // Tidal rather than snappy: slow in, quicker out.
  "--DURATION-FAST": "120ms",
  "--DURATION-NORMAL": "240ms",
  "--DURATION-SLOW": "420ms",
  "--MOTION-DURATION-ENTER": "420ms",
  "--MOTION-DURATION-EXIT": "260ms",
  "--MOTION-DURATION-SHIFT": "460ms",
  "--MOTION-EASE-ENTER": "cubic-bezier(0.16, 1, 0.3, 1)",
  "--MOTION-EASE-EXIT": "cubic-bezier(0.7, 0, 0.84, 0)",
  "--MOTION-DISTANCE-MD": "0.75rem",
};

/**
 * The page floor. `themeOverrides` land as custom properties on the renderer's wrapper and
 * a custom property paints nothing by itself — without an element carrying `bg-canvas` the
 * floor stays the host's, so a dark palette renders as dark cards stranded on a white page.
 * `min-h-screen` keeps that floor under a short document too.
 *
 * It lives beside the palette because the two only work as a pair: the version of this that
 * shipped set every token and painted none of them.
 */
export const themedPage = (children: ViewNode[]): ViewNode => ({
  component: "Stack",
  props: { className: "bg-canvas min-h-screen p-r3", gap: "r3" },
  children,
});
