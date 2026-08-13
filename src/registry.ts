/**
 * The one registry both sides of the contract read.
 *
 * A document naming `Heatmap` renders only on a host holding this registry, so the gate
 * that approves documents and the preview host that draws them must consume this module —
 * a second copy is how the gate approves what the host cannot draw. The contracts ride
 * along for the same reason: a component registered without one is invisible to every
 * check `validateViewSpec` runs.
 */
import {
  defaultRegistry,
  extendRegistry,
  type ComponentRegistry,
} from "@batthewz/response-ui-renderer";
import {
  defaultContracts,
  extendContracts,
  type ComponentContracts,
} from "@batthewz/response-ui-renderer/spec";
import { Heatmap } from "./heatmap.tsx";

export const registry: ComponentRegistry = extendRegistry(defaultRegistry, { Heatmap });

export const contracts: ComponentContracts = extendContracts(defaultContracts, {
  Heatmap: {
    category: "Data",
    note:
      "values is rows × columns of counts; null is a missing cell (a matrix diagonal), " +
      "not zero. The scale anchors at max, defaulting to the data's own. Painted from " +
      "--C-ACCENT into --C-SURFACE-3, so it follows themeOverrides. Requires aria-label.",
  },
});
