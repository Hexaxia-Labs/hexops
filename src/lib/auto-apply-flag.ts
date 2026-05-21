/**
 * Master kill-switch for applying dependency fixes from the dashboards.
 *
 * Disabled 2026-05-21: applying a transitive fix via package-manager override
 * + reinstall cascaded a single postcss bump into ~88 changed packages on
 * hexaxia-media. Until a safer, reviewable apply workflow exists, the entry
 * points that POST to /api/projects/[id]/update (or /api/security/cve-lite/[id]/fix)
 * are hidden:
 *   - Patches dashboard:  "fix now" (per-item override) + "Update Selected"
 *   - CVE Lite dashboard: "Fix all direct" + per-finding "Apply"
 *
 * Only the UI entry points are gated; the underlying endpoints and handlers
 * remain intact. Flip this to `true` to restore the buttons once a better
 * workflow is in place.
 */
export const AUTO_APPLY_ENABLED: boolean = false;
