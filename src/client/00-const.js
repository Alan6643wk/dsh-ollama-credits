/**
 * dsh-ollama-credits — client-side constants (CONTRACT.md §5).
 *
 * Part of the concatenated lazy-CJS browser bundle: a plain statement list
 * inside build.mjs's factory. Nothing here touches the DOM or React, so these
 * values are safe to read from every later module.
 */

/** Stable browser module id, the same string the loader row carries (§5.1). */
var OLLAMA_CREDITS_MODULE_ID = 'dsh-ollama-credits';

/**
 * Route prefix, DOCUMENT-RELATIVE on purpose: the GUI is served with
 * `<base href="./">`, so a sub-path deployment resolves these against the
 * shell's entry directory instead of escaping to the origin root (same rule
 * the shell's own fetches follow, CONTRACT.md §5.2).
 */
var OLLAMA_CREDITS_API_BASE = 'api/dsh-ollama-credits/';

/** Data attribute marking the injected sidebar foot card container (§5.2). */
var OLLAMA_CREDITS_FOOT_ATTR = 'data-dsh-ollama-credits-foot';

/** Selector form of the attribute above, the DOM-level idempotency guard. */
var OLLAMA_CREDITS_FOOT_SELECTOR = '[' + OLLAMA_CREDITS_FOOT_ATTR + ']';

/** Slot the detail view registers into (§5.3). */
var OLLAMA_CREDITS_SECTION_SLOT = 'settings.section';

/** Section identity: id drives nav selection, label drives the nav row text. */
var OLLAMA_CREDITS_SECTION_ID = 'dsh-ollama-credits';
var OLLAMA_CREDITS_SECTION_ORDER = 152;
var OLLAMA_CREDITS_SECTION_LABEL = 'Ollama Credits';

/** Poll cadence of the permanently seated foot card, visible tab only (§5.2). */
var OLLAMA_CREDITS_FOOT_POLL_MS = 30000;

/** Poll cadence of the open settings section while mounted (§5.3). */
var OLLAMA_CREDITS_SECTION_POLL_MS = 30000;

/** Countdown tick: the numbers are computed locally from resetsAt (§5.2, §5.4). */
var OLLAMA_CREDITS_TICK_MS = 1000;

/** Hard ceiling for one route call; a stalled host must not pile requests up. */
var OLLAMA_CREDITS_FETCH_TIMEOUT_MS = 15000;

/** Buckets the hourly chart renders (last 24 h, zero-filled by the host). */
var OLLAMA_CREDITS_HOURS = 24;

/** Range tabs of the per-model table, most likely first (§5.3 item 3). */
var OLLAMA_CREDITS_RANGES = ['24h', '7d', '30d'];

/** Below this measured card width the foot card switches to its rail layout. */
var OLLAMA_CREDITS_COMPACT_WIDTH = 150;

/**
 * Palette. Every colour reads the shell's theme variables first and falls back
 * to a neutral literal, so light and dark both stay legible; the second
 * fallback is the current DSH alias token for that role. The primary
 * `--color-*` names are honoured when a future shell exposes them.
 */
var OLLAMA_CREDITS_COLORS = {
  text: 'var(--color-text, var(--dsw-alias-label-primary, #1f2328))',
  muted: 'var(--color-muted, var(--dsw-alias-label-secondary, #6b7280))',
  faint: 'var(--color-faint, var(--dsw-alias-label-tertiary, #9aa1ab))',
  border: 'var(--color-border, var(--dsw-alias-border-l3, rgba(127, 127, 127, 0.3)))',
  track: 'var(--color-track, var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.18)))',
  surface: 'var(--color-surface, transparent)',
  hover: 'var(--color-hover, var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.14)))',
  accent: 'var(--color-accent, var(--dsw-alias-state-business-primary, #4f7cff))',
  normal: 'var(--color-positive, var(--dsw-alias-state-success-primary, #2f9e63))',
  warn: 'var(--color-warning, var(--dsw-alias-state-warn-primary, #d8a23a))',
  low: 'var(--color-danger, var(--dsw-alias-state-error-primary, #d64545))'
};
