// / UX adherence: the design guide is a contract, and "ensures
// adherence" must be machine-enforced, not eyeballed. The running app defines
// its design tokens as CSS custom properties on :root (per the real
// partner-asset-tracker STYLE_GUIDE: tokens in theme.css :root are readable in
// Playwright tests). This checks those rendered :root variables against the
// tokens declared in design-guide.json, so a primary button that renders blue
// or rounded when the guide says red + sharp fails the build.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  designGuideToCssVars,
  checkTokenAdherence,
  assertDesignAdherence,
  checkHardcodedValues,
  checkRequiredSeams,
  checkFeedbackPresent,
  checkRouteReachability,
  checkTokenConsumption,
  checkUxClean,
} from "../../consort/architecture/design-adherence";

const GUIDE = {
  typography: { font_family: "DM Sans", font_mono: "DM Mono", scale: { "text-base": "15px" } },
  colors: { brand: { "brand-red": "#FF3621" }, semantic: { success: "#2E844A" } },
  spacing: { "space-4": "16px" },
  radius: { "radius-none": "0px" },
};

describe("designGuideToCssVars: flattens a guide to CSS custom properties", () => {
  it("maps tokens to their --css-var names by convention", () => {
    const vars = designGuideToCssVars(GUIDE);
    expect(vars["--font-family"]).toBe("DM Sans");
    expect(vars["--font-mono"]).toBe("DM Mono");
    expect(vars["--text-base"]).toBe("15px");
    expect(vars["--color-brand-red"]).toBe("#FF3621");
    expect(vars["--color-success"]).toBe("#2E844A");
    expect(vars["--space-4"]).toBe("16px");
    expect(vars["--radius-none"]).toBe("0px");
  });

  it("maps the expanded typography tokens (line_heights, font_weights) to prefixed vars", () => {
    const vars = designGuideToCssVars({
      ...GUIDE,
      typography: {
        ...GUIDE.typography,
        line_heights: { body: "1.5", heading: "1.25" },
        font_weights: { regular: "400", medium: "500" },
      },
    });
    expect(vars["--line-height-body"]).toBe("1.5");
    expect(vars["--line-height-heading"]).toBe("1.25");
    expect(vars["--font-weight-regular"]).toBe("400");
    expect(vars["--font-weight-medium"]).toBe("500");
  });

  it("omits the expanded typography vars when the guide does not declare them", () => {
    const vars = designGuideToCssVars(GUIDE);
    expect(Object.keys(vars).some((k) => k.startsWith("--line-height-"))).toBe(false);
    expect(Object.keys(vars).some((k) => k.startsWith("--font-weight-"))).toBe(false);
  });
});

describe("checkTokenAdherence: rendered :root vars vs declared tokens", () => {
  const declared = designGuideToCssVars(GUIDE);

  it("ok when every declared token matches the rendered value (case/space-insensitive)", () => {
    const rendered = {
      "--font-family": "DM Sans",
      "--font-mono": "DM Mono",
      "--text-base": "15px",
      "--color-brand-red": " #ff3621 ", // whitespace + lowercase still matches
      "--color-success": "#2E844A",
      "--space-4": "16px",
      "--radius-none": "0px",
    };
    expect(checkTokenAdherence(declared, rendered).ok).toBe(true);
  });

  it("reports a mismatch when a rendered value differs from the declared token", () => {
    const rendered = { ...{ "--font-family": "DM Sans", "--font-mono": "DM Mono", "--text-base": "15px", "--color-success": "#2E844A", "--space-4": "16px", "--radius-none": "0px" }, "--color-brand-red": "#0000FF" };
    const r = checkTokenAdherence(declared, rendered);
    expect(r.ok).toBe(false);
    const brand = r.mismatches.find((m) => m.cssVar === "--color-brand-red");
    expect(brand?.expected).toBe("#FF3621");
    expect(brand?.actual).toBe("#0000FF");
  });

  it("reports a missing var when the app does not define a declared token", () => {
    const rendered = { "--font-family": "DM Sans" }; // everything else absent
    const r = checkTokenAdherence(declared, rendered);
    expect(r.ok).toBe(false);
    const missing = r.mismatches.find((m) => m.cssVar === "--color-brand-red");
    expect(missing?.actual).toBeUndefined();
  });
});

describe("assertDesignAdherence: reads :root from a page-like reader", () => {
  // A minimal reader stands in for a Playwright Page: it returns the computed
  // value of each requested CSS custom property.
  function readerFrom(vars: Record<string, string>) {
    return {
      evaluate: async (_fn: unknown, names: string[]) =>
        Object.fromEntries(names.map((n) => [n, vars[n] ?? ""])),
    };
  }

  it("resolves when the rendered tokens match the guide", async () => {
    const reader = readerFrom({
      "--font-family": "DM Sans",
      "--font-mono": "DM Mono",
      "--text-base": "15px",
      "--color-brand-red": "#FF3621",
      "--color-success": "#2E844A",
      "--space-4": "16px",
      "--radius-none": "0px",
    });
    await expect(assertDesignAdherence(reader, GUIDE)).resolves.toBeUndefined();
  });

  it("throws naming the mismatched token when the UI drifts from the guide", async () => {
    const reader = readerFrom({
      "--font-family": "DM Sans",
      "--font-mono": "DM Mono",
      "--text-base": "15px",
      "--color-brand-red": "#0000FF", // wrong
      "--color-success": "#2E844A",
      "--space-4": "16px",
      "--radius-none": "0px",
    });
    await expect(assertDesignAdherence(reader, GUIDE)).rejects.toThrow(/--color-brand-red/);
  });
});

// ─── Element-level adherence (increment B) ───────────────────────
// A UI can set :root tokens yet never USE them. These checks read the rendered
// markup/styles and flag the element-level gaps the token check cannot see:
// hardcoded design values, missing data-testid seams, actions with no feedback.

describe("checkHardcodedValues: hardcoded design values that should be tokens", () => {
  it("flags a raw hex color in an inline style", () => {
    const html = `<button style="color: #FF3621">Save</button>`;
    const r = checkHardcodedValues(html);
    expect(r.ok).toBe(false);
    expect(r.violations.join("\n")).toMatch(/#FF3621/);
  });

  it("flags a raw px font-size / spacing in a <style> block", () => {
    const css = `<style>.card { font-size: 15px; padding: 16px; }</style>`;
    const r = checkHardcodedValues(css);
    expect(r.ok).toBe(false);
    expect(r.violations.join("\n")).toMatch(/15px/);
  });

  it("ok when values come from var(--token)", () => {
    const html = `<button style="color: var(--color-brand-red); font-size: var(--text-base)">Save</button>`;
    expect(checkHardcodedValues(html).ok).toBe(true);
  });

  it("exempts the :root token DEFINITIONS themselves", () => {
    const css = `<style>:root { --color-brand-red: #FF3621; --text-base: 15px; --space-4: 16px; }</style>`;
    expect(checkHardcodedValues(css).ok).toBe(true);
  });
});

describe("checkRequiredSeams: every required data-testid must be rendered", () => {
  const html = `<form data-testid="bug-form"><input data-testid="bug-title" /></form>`;

  it("ok when every required testid appears", () => {
    expect(checkRequiredSeams(html, ["bug-form", "bug-title"]).ok).toBe(true);
  });

  it("flags a missing required testid", () => {
    const r = checkRequiredSeams(html, ["bug-form", "bug-status"]);
    expect(r.ok).toBe(false);
    expect(r.violations.join("\n")).toMatch(/bug-status/);
  });

  it("ok when no seams are required (nothing to check)", () => {
    expect(checkRequiredSeams(html, []).ok).toBe(true);
  });
});

describe("checkFeedbackPresent: an action surface has a feedback affordance", () => {
  it("flags a form with no feedback affordance anywhere", () => {
    const html = `<form><input name="title" /><button type="submit">Save</button></form>`;
    const r = checkFeedbackPresent(html);
    expect(r.ok).toBe(false);
    expect(r.violations.length).toBeGreaterThan(0);
  });

  it("ok when a role=alert feedback element is present", () => {
    const html = `<form><button type="submit">Save</button><div role="alert"></div></form>`;
    expect(checkFeedbackPresent(html).ok).toBe(true);
  });

  it("ok when a data-testid feedback seam is present", () => {
    const html = `<form><button type="submit">Save</button><p data-testid="form-error"></p></form>`;
    expect(checkFeedbackPresent(html).ok).toBe(true);
  });

  it("ok when there is no action surface to give feedback for", () => {
    const html = `<main><h1>Bugs</h1><p>nothing actionable here</p></main>`;
    expect(checkFeedbackPresent(html).ok).toBe(true);
  });
});

// ── Route reachability (increment C): every feature page is wired into App.tsx ──
describe("checkRouteReachability: feature pages must be reachable from App.tsx routes", () => {
  const APP_ONE_ROUTE = `
    import { Routes, Route } from "react-router-dom";
    import { HomePage } from "./pages/HomePage";
    export function App() {
      return (<Routes><Route path="/" element={<HomePage />} /></Routes>);
    }`;
  const APP_ALL = `
    import { Routes, Route } from "react-router-dom";
    export function App() {
      return (<Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/location/:loc" element={<StockByLocationPage />} />
        <Route path="/sku/:sku" element={<SkuDetailPage />} />
      </Routes>);
    }`;

  it("flags a page component that is never routed", () => {
    const r = checkRouteReachability({
      appSource: APP_ONE_ROUTE,
      pageComponents: ["HomePage", "StockByLocationPage", "SkuDetailPage"],
    });
    expect(r.ok).toBe(false);
    expect(r.unreachable).toEqual(expect.arrayContaining(["StockByLocationPage", "SkuDetailPage"]));
    expect(r.unreachable).not.toContain("HomePage");
    expect(r.remediation).toBeTruthy();
  });

  it("ok when every page is routed via element={<X/>}", () => {
    const r = checkRouteReachability({
      appSource: APP_ALL,
      pageComponents: ["HomePage", "StockByLocationPage", "SkuDetailPage"],
    });
    expect(r.ok).toBe(true);
    expect(r.unreachable).toEqual([]);
  });

  it("recognizes the Component={X} route form", () => {
    const app = `<Routes><Route path="/x" Component={StockByLocationPage} /></Routes>`;
    const r = checkRouteReachability({ appSource: app, pageComponents: ["StockByLocationPage"] });
    expect(r.ok).toBe(true);
  });

  it("empty inventory is trivially reachable", () => {
    expect(checkRouteReachability({ appSource: APP_ONE_ROUTE, pageComponents: [] }).ok).toBe(true);
  });

  it("an exempt component (composed inside another page) is not flagged", () => {
    const r = checkRouteReachability({
      appSource: APP_ONE_ROUTE,
      pageComponents: ["HomePage", "StockPanel"],
      exemptComponents: ["StockPanel"],
    });
    expect(r.ok).toBe(true);
  });
});

// ── Token consumption (increment C): feature pages must APPLY the design guide ──
describe("checkTokenConsumption: a feature page must consume tokens / the design vocabulary", () => {
  const BARE = `export function P(){ return (<table><tr><td>{x}</td></tr></table>); }`;
  const VAR = `export function P(){ return (<div style={{color:"var(--color-brand-red)"}}>hi</div>); }`;
  const CLASS = `export function P(){ return (<main className="page"><div className="card"/></main>); }`;

  it("flags a page that renders structure with zero var() and zero design class", () => {
    const r = checkTokenConsumption({ pageSources: { "SkuDetailPage.tsx": BARE } });
    expect(r.ok).toBe(false);
    expect(r.bare).toContain("SkuDetailPage.tsx");
    expect(r.remediation).toBeTruthy();
  });

  it("ok when the page consumes a var(--token)", () => {
    expect(checkTokenConsumption({ pageSources: { "P.tsx": VAR } }).ok).toBe(true);
  });

  it("ok when the page uses a design-class from the vocabulary", () => {
    const r = checkTokenConsumption({ pageSources: { "P.tsx": CLASS }, designClasses: ["page", "card", "btn"] });
    expect(r.ok).toBe(true);
  });

  it("flags a page that uses only ad-hoc classes not in the design vocabulary", () => {
    const adhoc = `export function P(){ return (<div className="my-random-wrapper"><span/></div>); }`;
    const r = checkTokenConsumption({ pageSources: { "P.tsx": adhoc }, designClasses: ["page", "card", "btn"] });
    expect(r.ok).toBe(false);
    expect(r.bare).toContain("P.tsx");
  });
});

// ── checkUxClean (I/O boundary): scans a project's client/, no-op without one ──
describe("checkUxClean: project-level UX gate (UI-track only)", () => {
  let dir: string;
  const mkClient = (app: string, pages: Record<string, string>): void => {
    mkdirSync(join(dir, "client", "src", "pages"), { recursive: true });
    writeFileSync(join(dir, "client", "package.json"), "{}");
    writeFileSync(join(dir, "client", "src", "App.tsx"), app);
    for (const [name, src] of Object.entries(pages)) {
      writeFileSync(join(dir, "client", "src", "pages", name), src);
    }
  };
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "uxclean-")); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("clean (no-op) when there is no client/ workspace", () => {
    expect(checkUxClean({ projectDir: dir }).clean).toBe(true);
  });

  it("not clean when a feature page is unrouted", () => {
    mkClient(
      `import {Routes,Route} from "react-router-dom";
       export function App(){return(<Routes><Route path="/" element={<HomePage/>}/></Routes>);}`,
      {
        "HomePage.tsx": `export function HomePage(){return(<main className="page"/>);}`,
        "SkuDetailPage.tsx": `export function SkuDetailPage(){return(<main className="page"><div className="card"/></main>);}`,
      },
    );
    const r = checkUxClean({ projectDir: dir });
    expect(r.clean).toBe(false);
    expect(r.reachability.unreachable).toContain("SkuDetailPage");
  });

  it("not clean when a routed feature page is bare (no tokens / classes)", () => {
    mkClient(
      `import {Routes,Route} from "react-router-dom";
       export function App(){return(<Routes>
         <Route path="/" element={<HomePage/>}/>
         <Route path="/sku" element={<SkuDetailPage/>}/>
       </Routes>);}`,
      {
        "HomePage.tsx": `export function HomePage(){return(<main className="page"/>);}`,
        "SkuDetailPage.tsx": `export function SkuDetailPage(){return(<table><tr><td>{x}</td></tr></table>);}`,
      },
    );
    const r = checkUxClean({ projectDir: dir });
    expect(r.clean).toBe(false);
    expect(r.tokens.bare).toContain("SkuDetailPage.tsx");
  });

  it("clean when every feature page is routed and styled", () => {
    mkClient(
      `import {Routes,Route} from "react-router-dom";
       export function App(){return(<Routes>
         <Route path="/" element={<HomePage/>}/>
         <Route path="/sku" element={<SkuDetailPage/>}/>
       </Routes>);}`,
      {
        "HomePage.tsx": `export function HomePage(){return(<main className="page"/>);}`,
        "SkuDetailPage.tsx": `export function SkuDetailPage(){return(<main className="page"><div className="card" style={{gap:"var(--space-4)"}}/></main>);}`,
      },
    );
    expect(checkUxClean({ projectDir: dir }).clean).toBe(true);
  });
});
