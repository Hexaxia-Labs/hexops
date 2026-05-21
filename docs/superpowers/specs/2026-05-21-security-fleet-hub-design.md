# Security Fleet Hub — Implementation Design

## Goal

Replace the thin `/security` page with a CVE Lite-powered fleet hub: split-panel layout with an alphabetical project rail on the left and the full CVE Lite triage + fix experience on the right. Enrich the Patches dashboard with CVE Lite advisory context and bidirectional links to the fleet hub.

## Architecture

### Files changed

| File | Change |
|------|--------|
| `src/app/security/page.tsx` | Full rewrite — split-panel fleet hub |
| `src/components/security/fleet-project-rail.tsx` | New — scrollable project list with severity pills |
| `src/app/api/security/cve-lite/summary/route.ts` | New — lightweight per-project CVE Lite severity counts |
| `src/app/api/security/findings/route.ts` | Add `?project=id` query filter |
| `src/components/security/cve-lite/cve-lite-toolbar.tsx` | Add `hideSelector?: boolean` prop |
| `src/app/patches/page.tsx` | Patch detail panel: lazy CVE Lite context block + "→ Security" link |

### Files untouched

`src/app/security/cve-lite/page.tsx` · all existing CVE Lite components · `SourceStrip` · patch scanner · security sources · `src/lib/security/**`

---

## Data Flow

### Fleet hub on mount (two parallel fetches)

1. **`GET /api/security/cve-lite/summary`** (new) — reads CVE Lite cache for all projects, no CLI invocation. Returns per-project severity counts for the left rail.

   ```json
   {
     "projects": [
       { "id": "alyfe-v3", "name": "alyfe-v3", "critical": 3, "high": 5, "medium": 1, "low": 0, "scannedAt": "2026-05-21T..." },
       { "id": "hexops",   "name": "hexops",   "critical": 0, "high": 0, "medium": 0, "low": 0, "scannedAt": null }
     ]
   }
   ```

   `scannedAt: null` means no CVE Lite scan exists yet for that project.

2. **`GET /api/security/findings`** (existing) — reads merged 3-source cache for all projects. Loaded once on mount; drives the `SourceStrip` (pnpm-audit / Grype / cve-lite status) in the right panel for any selected project. No per-project refetch when switching projects.

### On project select

3. **`GET /api/security/cve-lite/${id}`** (existing) — loads full CVE Lite report for the selected project. Drives fix plan + findings table. Cached 1 h; **Re-scan** passes `?force=true`. If the project has never been scanned, this triggers the first scan automatically.

### Patches panel lazy fetch (on row expand)

4. **`GET /api/security/findings?project=id`** (existing endpoint, new filter) — returns merged findings for one project only. The patch detail panel calls this once per project (cached in component state), then matches findings by package name to surface CVE Lite context.

---

## Component: `FleetProjectRail`

**File:** `src/components/security/fleet-project-rail.tsx`

**Props:**
```ts
interface Props {
  projects: FleetProject[];   // { id, name, critical, high, medium, low, scannedAt }
  selected: string;
  onSelect: (id: string) => void;
}
```

**Behaviour:**
- Fixed width `~220px`, scrollable, full page height
- Projects listed alphabetically
- Each row: project name + severity pills (only non-zero counts shown)
  - `critical` → red · `high` → orange · `medium` → yellow · `low` → blue
  - All-zero counts → green `✓ clean`
  - `scannedAt: null` → grey `— not scanned` (still selectable; triggers first scan)
- Selected row: purple left border (`border-l-2 border-purple-600`) + dim background tint
- Unselected rows: transparent left border, muted name colour

---

## Component: `CveLiteToolbar` — `hideSelector` prop

Add `hideSelector?: boolean` to the existing toolbar props. When `true`, the project `<select>` dropdown is not rendered. Everything else (scanned timestamp, Re-scan, imported-only toggle, SBOM / SARIF / HTML report buttons) remains unchanged.

---

## Page: `/security` (fleet hub rewrite)

**Layout:** two-column flex row, no padding between columns.

- Left: `<FleetProjectRail>` — `w-[220px] flex-shrink-0 border-r border-zinc-800`
- Right: CVE Lite panel — `flex-1 overflow-auto p-6 space-y-4`

**Right panel contents (top to bottom):**

1. **`<CveLiteToolbar hideSelector>`** — Re-scan · imported-only · SBOM · SARIF · HTML report
2. **`<CveLiteScanControls>`** — min severity · prod-only · only-used · show all
3. **Combined status row** — OSV DB age + Sync DB button + install-skill button | pnpm-audit ✓ · grype ✓ · cve-lite ✓ · Rescan all
4. **Fix plan section** — `<FixPlan>` with Fix all direct button
5. **Findings section** — `<CveLiteFindings>` with per-row Apply buttons

The combined status row merges `<CveLiteManage>` (OSV DB age, Sync DB, install-skill) and `<SourceStrip>` (source badges, Rescan all) into a single horizontal strip to reduce vertical noise. The install-skill button sits at the right end of this row.

**State:**
```ts
const [railProjects, setRailProjects]   // from /api/security/cve-lite/summary
const [allSources, setAllSources]       // from /api/security/findings — Record<projectId, SourceResult[]>
const [selected, setSelected]           // projectId string
const [report, setReport]               // CveLiteOutput | null
const [loading, setLoading]
const [error, setError]
const [importedOnly, setImportedOnly]
const [scannedAt, setScannedAt]
const [options, setOptions]             // ScanOptions
const [dbStatus, setDbStatus]
const [confirm, setConfirm]
const [busy, setBusy]
```

**On project select:** load CVE Lite report via `GET /api/security/cve-lite/${id}`. Auto-select first project on mount.

**`/security?project=id` deep-link support:** read `project` from `useSearchParams()` and pre-select that project on mount. This is how the Patches → Security link lands on the right project.

---

## API: `GET /api/security/cve-lite/summary`

**File:** `src/app/api/security/cve-lite/summary/route.ts`

Reads the CVE Lite cache for every project via `readCveLiteCache`. No CLI invocation. Counts findings by severity from `report.findings`.

```ts
export async function GET() {
  const projects = getProjects();
  const rows = projects.map((p) => {
    // ignoreTtl: show stale counts + timestamp rather than nulling out — rail
    // shows "scanned 2h ago" so user knows data may be old, right panel rescans fresh.
    const cached = readCveLiteCache(p.id, { ignoreTtl: true });
    if (!cached) return { id: p.id, name: p.name, critical: 0, high: 0, medium: 0, low: 0, scannedAt: null };
    const counts = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const f of cached.report.findings ?? []) {
      const sev = normalizeSeverity(f.severity); // reuse normSeverity from cve-lite-view.ts
      if (sev in counts) counts[sev as keyof typeof counts]++;
    }
    return { id: p.id, name: p.name, ...counts, scannedAt: cached.cachedAt };
  });
  return NextResponse.json({ projects: rows });
}
```

`normalizeSeverity` maps `moderate` → `medium`, unknown → omit.

---

## API: `GET /api/security/findings?project=id`

**File:** `src/app/api/security/findings/route.ts` (minor addition)

Add optional `project` query param. When present, return only the matching project instead of all projects. Existing callers (no `?project`) are unaffected.

```ts
const projectFilter = req.nextUrl.searchParams.get('project');
const perProject = projects
  .filter((p) => !projectFilter || p.id === projectFilter)
  .map(/* existing mapping */);
```

---

## Patches enrichment

**File:** `src/app/patches/page.tsx`

### CVE Lite context block

When a vulnerable patch row is expanded, the detail panel renders a **CVE Lite analysis** block sourced from the merged security findings cache.

**Fetch:** `GET /api/security/findings?project=id` — called once per project when any row in that project is first expanded. Result cached in a `Map<projectId, Finding[]>` held in component state (not re-fetched on re-expand).

**Matching:** find findings where `finding.package === patchRow.name`. If multiple advisories exist for the same package, show all.

**Block contents:**
- Header: `CVE Lite analysis` label + `Full analysis in Security →` link to `/security?project=id`
- `remediation.recommendedAction` — plain-English next step
- `finding.title` — OSV advisory summary (one-liner description), shown as a blockquote-style aside
- `remediation.parentUpgrade` — shown for transitive deps as `via <parent> → <package>`
- `finding.advisoryIds` — CVE / GHSA badge chips

**Omit entirely** if no matching finding exists in the security cache (no CVE Lite scan for that project, or package not in findings). Existing patch detail fields show as before — no regressions.

### `Full analysis in Security →` link

Routes to `/security?project=id`. The fleet hub reads the `project` query param on mount and pre-selects that project, landing directly on the CVE Lite fix plan for it.

---

## Grype role

Grype remains a passive second-opinion source. It contributes:
- Source badges in `SourceStrip` (`grype ✓ / ✗ / unavailable`)
- Multi-source badges on merged findings (`sources: ['pnpm-audit', 'grype']`)
- Divergence warnings when severity disagrees by >1 level

Grype has no role in the fix plan, Apply actions, or left rail pill counts — those are CVE Lite only. When Grype is not installed, `SourceStrip` shows `unavailable` silently.

---

## Error and edge cases

| Scenario | Behaviour |
|----------|-----------|
| Project never scanned | Left rail shows `— not scanned`; selecting it triggers first CVE Lite scan automatically |
| CVE Lite not installed | Right panel shows the existing 503 error message from the API |
| Grype not installed | `SourceStrip` shows `unavailable` for grype; everything else works normally |
| No CVE Lite data for a patch row | CVE Lite analysis block omitted; existing patch detail fields unchanged |
| `AUTO_APPLY_ENABLED=false` | Apply and Fix all direct buttons hidden — matches existing behaviour |
| Security findings cache empty | `SourceStrip` shows `No scan recorded yet`; right panel still loads CVE Lite report independently |

---

## Testing

- Unit: `src/app/api/security/cve-lite/summary/route.test.ts` — verify counts from fixture cache entries; verify `scannedAt: null` for missing cache
- Unit: `src/app/api/security/findings/route.test.ts` — verify `?project=id` filter returns only matching project
- Unit: `src/components/security/fleet-project-rail.test.tsx` — pill rendering for each severity combo; clean state; not-scanned state; selected highlight
- Integration: fleet hub mounts, summary + findings load, first project auto-selected, CVE Lite report loaded
