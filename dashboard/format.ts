/**
 * Formatting and ViewNode helpers for the document builders.
 *
 * One copy, because two blocks rendering the same figure two ways is exactly the defect
 * these pages exist to expose.
 */
import type { ComponentNode, ViewNode } from "@batthewz/response-ui-renderer/spec";

// ── formatting ───────────────────────────────────────────────────────────────────────
export const n = (v: number): string => v.toLocaleString("en-US");

export const pct = (part: number, whole: number): number =>
  whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10;

/**
 * A percentage as prose, where `pct` is the number a bar is drawn from.
 *
 * A non-zero part never reads as `0%`: "the 4 authors not listed hold 0% of the commits"
 * says they hold none.
 */
export function share(part: number, whole: number): string {
  if (part === 0 || whole === 0) return "0%";
  const v = pct(part, whole);
  return v === 0 ? "<0.1%" : `${v}%`;
}

/** `1 commit`, `4 commits`. */
export const countOf = (v: number, one: string, many: string): string =>
  `${n(v)} ${v === 1 ? one : many}`;

export const utcDate = (t: number): string =>
  new Date(t).toISOString().slice(0, 19).replace("T", " ") + "Z";

// ── node helpers ─────────────────────────────────────────────────────────────────────
export const text = (children: ViewNode[], props: Record<string, unknown> = {}): ViewNode => ({
  component: "Text",
  props,
  children,
});

export const muted = (s: string): ViewNode => text([s], { variant: "body-3", color: "muted" });

export const card = (children: ViewNode[], padding = "r4"): ViewNode => ({
  component: "Card",
  props: { padding },
  children,
});

export const stack = (children: ViewNode[], gap = "r5"): ViewNode => ({
  component: "Stack",
  props: { gap },
  children,
});

/** `props` is omitted rather than defaulted to `{}`: a table is thousands of cells and an
 *  empty object on each is pure wire weight. */
export const cell = (children: ViewNode[], props?: Record<string, unknown>): ViewNode =>
  props ? { component: "Table.Cell", props, children } : { component: "Table.Cell", children };

export function table(
  headers: string[],
  rows: ViewNode[][],
  props: Record<string, unknown> = {},
): ViewNode {
  return {
    component: "Table",
    props: { density: "dense", ...props },
    children: [
      // No headers means no head. An empty `Table.Head` still paints its band, which reads
      // as a column row that lost its labels.
      ...(headers.length > 0
        ? [
            {
              component: "Table.Head",
              children: [
                {
                  component: "Table.Row",
                  children: headers.map((h) => ({
                    component: "Table.HeaderCell",
                    children: [h],
                  })),
                },
              ],
            } as ViewNode,
          ]
        : []),
      {
        // `index` is required on every row: zebra striping is computed per row and the
        // renderer's node wrapper hides a child's position from Table.Body, so without
        // it a `striped` table silently renders flat.
        component: "Table.Body",
        children: rows.map((cells, i) => ({
          component: "Table.Row",
          props: { index: i },
          children: cells,
        })),
      },
    ],
  };
}

/** A bar in a table cell. `Meter` is used because its min/max are a documented contract. */
export function meter(value: number, label: string): ComponentNode {
  return { component: "Meter", props: { value, min: 0, max: 100, "aria-label": label } };
}

export function statTile(label: string, value: string, note: string): ViewNode {
  return {
    component: "StatCard",
    children: [
      { component: "StatCard.Label", children: [label] },
      { component: "StatCard.Value", children: [value] },
      muted(note),
    ],
  };
}

export function panel(value: string, children: ViewNode[]): ViewNode {
  return { component: "Tabs.Panel", props: { value }, children: [stack(children, "r4")] };
}

/** A Tabs block from a list of panels. `defaultValue` must match a real tab or none open. */
export function tabsNode(
  tabs: Array<{ value: string; label: string; body: ViewNode[] }>,
  props: Record<string, unknown> = {},
): ViewNode {
  return {
    component: "Tabs",
    props: { defaultValue: tabs[0]!.value, variant: "underline", ...props },
    children: [
      {
        component: "Tabs.List",
        children: tabs.map((tab) => ({
          component: "Tabs.Tab",
          props: { value: tab.value },
          children: [tab.label],
        })),
      },
      ...tabs.map((tab) => panel(tab.value, tab.body)),
    ],
  };
}

/**
 * A Sparkline that is visible and responsive.
 *
 * Two things it fixes, both silent otherwise. The marks are painted with
 * `var(--sparkline-color, currentColor)` and nothing defines that variable, so they
 * inherit whatever `color` the surrounding div happens to have — which on a plain layout
 * wrapper is the browser default black, invisible on any dark surface. And `width` is a
 * viewBox number, not a layout width, so it renders at a fixed 120px by default; the svg
 * sets `preserveAspectRatio="none"`, which makes `w-full` stretch it to the container
 * while the height attribute still decides how tall it is.
 */
export function sparkline(
  values: number[],
  label: string,
  props: Record<string, unknown> = {},
): ViewNode {
  return {
    component: "Sparkline",
    props: {
      values,
      height: 96,
      className: "w-full text-accent",
      "aria-label": label,
      ...props,
    },
  };
}

/**
 * A Heatmap (this repo's own registry addition, not a library component). `values` is
 * rows × columns; `null` is a missing cell, not zero.
 */
export function heatmap(
  values: Array<Array<number | null>>,
  rowLabels: string[],
  colLabels: string[],
  label: string,
  props: Record<string, unknown> = {},
): ViewNode {
  return {
    component: "Heatmap",
    props: { values, rowLabels, colLabels, "aria-label": label, ...props },
  };
}

/**
 * What a top-N table left out, or an empty string when it left out nothing.
 *
 * Every `.slice(0, N)` in a document needs one of these. A ranked table drawn from a larger
 * population reads as exhaustive; the version that shipped without them cut between 20% and
 * 85% of its rows in silence.
 */
export function capNote(shown: number, total: number, unit: string, share?: string): string {
  if (total <= shown) return `All ${countOf(total, unit, unit + "s")}.`;
  return (
    `Showing the top ${n(shown)} of ${countOf(total, unit, unit + "s")}` +
    (share ? `; the ${n(total - shown)} not listed hold ${share}.` : ".")
  );
}

/** `capNote` for a table ordered by recency rather than by rank, where "the top 12"
 *  names the wrong twelve. */
export function tailNote(shown: number, total: number, unit: string): string {
  if (total <= shown) return `All ${countOf(total, unit, `${unit}s`)}.`;
  return (
    `The most recent ${n(shown)} of ${countOf(total, unit, `${unit}s`)}; ` +
    // The verb rides the count: "the 1 older month is", "the 5 older months are".
    `the ${countOf(total - shown, `older ${unit} is`, `older ${unit}s are`)} not listed.`
  );
}

/** Collapse whitespace and cap, for prose lifted out of a commit subject. */
export function excerpt(s: string, max: number): string {
  const flat = s.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  let end = max;
  // `slice` counts UTF-16 code units, so a cut that lands between the halves of an astral
  // character (any emoji, some CJK extensions) emits a lone surrogate — invalid UTF-16
  // that renders as a replacement glyph in the middle of the author's own words.
  const lastCode = flat.charCodeAt(end - 1);
  if (lastCode >= 0xd800 && lastCode <= 0xdbff) end -= 1;
  return flat.slice(0, end) + "…";
}
