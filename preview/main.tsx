import { createRoot } from "react-dom/client";
import { ViewRenderer } from "@batthewz/response-ui-renderer";
import type { ViewSpec } from "@batthewz/response-ui-renderer/spec";

// Fetched, not imported: the document is data the host never bundles, and keeping it out
// of the build is also what stops Tailwind scanning it — a utility class must come from
// the library's own compiled CSS, not from the document that asked for it.
const spec: ViewSpec = await (await fetch("./spec.json")).json();
createRoot(document.getElementById("root")!).render(<ViewRenderer spec={spec} />);
