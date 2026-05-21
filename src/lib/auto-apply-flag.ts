/**
 * Master kill-switch for applying dependency fixes from the dashboards.
 * Gates: Patches "Update Selected", CVE Lite "Fix all direct" + per-finding "Apply".
 * Endpoints /update, /cve-lite/fix, /override-remove return 409 when false.
 */
export const AUTO_APPLY_ENABLED: boolean = true;

/**
 * Gates the Patches "fix now" button specifically (fixViaOverride path).
 * Kept disabled: applying a transitive fix via package-manager override + reinstall
 * cascaded a single postcss bump into ~88 changed packages on hexaxia-media (2026-05-21).
 * Needs a safer workflow (preview resolved-tree delta, bounded scope) before re-enabling.
 */
export const FIX_VIA_OVERRIDE_ENABLED: boolean = false;
