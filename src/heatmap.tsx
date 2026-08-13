/**
 * A sequential heatmap the component library does not have: rows × columns of counts,
 * painted from the theme's own tokens.
 *
 * Colors are computed, not picked: a cell mixes `--C-ACCENT` into `--C-SURFACE-3` in
 * OKLCH, which keeps lightness monotone from the recessed surface (zero) to the accent
 * (max) in any theme the host applies. A non-zero cell never drops below a visible floor,
 * because "one commit" and "none" must not read alike. Everything is styled inline or with
 * text tokens the library already compiles — an invented utility class fails silently.
 */
import type { CSSProperties, ReactElement } from "react";

export type HeatmapProps = {
  /** Rows × columns. `null` is "no cell here" (a matrix diagonal), not zero. */
  values: Array<Array<number | null>>;
  rowLabels: string[];
  colLabels: string[];
  /** Scale anchor. Defaults to the data's own max. */
  max?: number;
  /** Pluralised unit for cell hover titles: `1 commit`, `4 commits`. */
  unitOne?: string;
  unitMany?: string;
  /** Rotate column labels for long names (a file matrix). */
  verticalColLabels?: boolean;
  "aria-label": string;
  className?: string;
};

/** Any activity must be visible against zero, so non-zero starts at this mix percent. */
const FLOOR = 18;

const mix = (fraction: number): string =>
  `color-mix(in oklch, var(--C-ACCENT) ${Math.round(FLOOR + (100 - FLOOR) * fraction)}%, var(--C-SURFACE-3))`;

const cellColor = (value: number, max: number): string =>
  value === 0 || max === 0 ? "var(--C-SURFACE-3)" : mix(value / max);

const labelStyle: CSSProperties = { fontSize: "0.625rem", lineHeight: 1.2 };

export function Heatmap({
  values,
  rowLabels,
  colLabels,
  max,
  unitOne = "commit",
  unitMany = "commits",
  verticalColLabels = false,
  "aria-label": ariaLabel,
  className,
}: HeatmapProps): ReactElement {
  const dataMax = max ?? Math.max(0, ...values.flat().map((v) => v ?? 0));
  const title = (row: number, col: number, v: number): string =>
    `${rowLabels[row]} · ${colLabels[col]} — ${v.toLocaleString("en-US")} ${v === 1 ? unitOne : unitMany}`;

  return (
    <div role="img" aria-label={ariaLabel} className={className}>
      <div
        aria-hidden
        style={{
          display: "grid",
          // A 2px gap in the surface color is the separator; marks never wear borders.
          gap: 2,
          gridTemplateColumns: `auto repeat(${colLabels.length}, minmax(0, 1fr))`,
          alignItems: "end",
        }}
      >
        <span />
        {colLabels.map((label, c) => (
          <span
            key={c}
            className="text-fg-muted"
            style={
              verticalColLabels
                ? { ...labelStyle, writingMode: "vertical-rl", transform: "rotate(180deg)", justifySelf: "center" }
                : { ...labelStyle, textAlign: "center" }
            }
          >
            {label}
          </span>
        ))}
        {values.flatMap((row, r) => [
            <span
              key={`label-${r}`}
              className="text-fg-muted"
              style={{ ...labelStyle, textAlign: "right", paddingRight: 6, alignSelf: "center" }}
            >
              {rowLabels[r]}
            </span>,
            ...row.map((v, c) =>
              v === null ? (
                <span key={`${r}-${c}`} />
              ) : (
                <div
                  key={`${r}-${c}`}
                  title={title(r, c, v)}
                  style={{
                    height: 22,
                    borderRadius: 2,
                    background: cellColor(v, dataMax),
                  }}
                />
              ),
            ),
        ])}
      </div>
      <div
        aria-hidden
        className="text-fg-muted"
        style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 6, marginTop: 8, justifyContent: "flex-end" }}
      >
        <span>0</span>
        <span style={{ width: 14, height: 10, borderRadius: 2, background: "var(--C-SURFACE-3)" }} />
        <span>1</span>
        <span
          style={{
            width: 96,
            height: 10,
            borderRadius: 2,
            background: `linear-gradient(to right, ${mix(1 / Math.max(1, dataMax))}, ${mix(1)})`,
          }}
        />
        <span>{dataMax.toLocaleString("en-US")}</span>
      </div>
    </div>
  );
}
