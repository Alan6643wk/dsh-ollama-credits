/**
 * dsh-ollama-credits — wire-to-display helpers (CONTRACT.md §4.1, §4.2, §5).
 *
 * Pure functions only: no DOM, no React, no clock of their own. Every reader
 * tolerates a missing or malformed field and answers null (or a neutral label)
 * instead of throwing, because the settings section and the foot card must
 * survive the host answering `ok:false` with a partial document.
 */

/** A finite number, or null for anything else (including numeric strings). */
function ollamaCreditsFiniteNumber(value) {
  return typeof value === 'number' && isFinite(value) ? value : null;
}

/** Clamp a percent to the 0..100 range; null stays null. */
function ollamaCreditsClampPercent(value) {
  var number = ollamaCreditsFiniteNumber(value);
  if (number === null) return null;
  if (number < 0) return 0;
  if (number > 100) return 100;
  return number;
}

/** Two-digit zero pad (hours may widen beyond two digits for long counts). */
function ollamaCreditsPad2(value) {
  var number = ollamaCreditsFiniteNumber(value);
  if (number === null) number = 0;
  var text = String(Math.floor(Math.abs(number)));
  return text.length >= 2 ? text : '0' + text;
}

/**
 * Render an HH:MM:SS countdown, clamped at zero (§5.4: never negative).
 * @param seconds - remaining seconds; anything unusable reads as 0.
 */
function ollamaCreditsFormatCountdown(seconds) {
  var total = ollamaCreditsFiniteNumber(seconds);
  if (total === null || total < 0) total = 0;
  total = Math.floor(total);
  var hours = Math.floor(total / 3600);
  var minutes = Math.floor((total % 3600) / 60);
  var rest = total % 60;
  return ollamaCreditsPad2(hours) + ':' + ollamaCreditsPad2(minutes) + ':' + ollamaCreditsPad2(rest);
}

/** Parse an ISO timestamp to epoch milliseconds, or null. */
function ollamaCreditsIsoTime(iso) {
  if (typeof iso !== 'string' || iso.length === 0) return null;
  var ms = Date.parse(iso);
  return isFinite(ms) ? ms : null;
}

/**
 * Remaining seconds of one balance window. `resetsAt` is authoritative (the
 * countdown is computed locally from it); `resetInSec` is only the fallback for
 * a host document that carries no timestamp.
 * @param windowValue - one `{remainingPercent, resetsAt, resetInSec}` object.
 * @param nowMs - current epoch milliseconds.
 * @param fetchedAtMs - when the document carrying the window was received.
 */
function ollamaCreditsWindowSeconds(windowValue, nowMs, fetchedAtMs) {
  if (windowValue === undefined || windowValue === null || typeof windowValue !== 'object') return null;
  var resetAt = ollamaCreditsIsoTime(windowValue.resetsAt);
  if (resetAt !== null) {
    var now = ollamaCreditsFiniteNumber(nowMs);
    if (now === null) now = Date.now();
    return Math.max(0, (resetAt - now) / 1000);
  }
  var resetIn = ollamaCreditsFiniteNumber(windowValue.resetInSec);
  if (resetIn === null) return null;
  var fetchedAt = ollamaCreditsFiniteNumber(fetchedAtMs);
  var elapsed = fetchedAt === null ? 0 : Math.max(0, ((ollamaCreditsFiniteNumber(nowMs) === null ? fetchedAt : nowMs) - fetchedAt) / 1000);
  return Math.max(0, resetIn - elapsed);
}

/** Remaining percent of one balance window, clamped; null when absent. */
function ollamaCreditsWindowPercent(windowValue) {
  if (windowValue === undefined || windowValue === null || typeof windowValue !== 'object') return null;
  return ollamaCreditsClampPercent(windowValue.remainingPercent);
}

/** Percent display: integers plain, fractions to one decimal, null as an em dash. */
function ollamaCreditsFormatPercent(percent) {
  var value = ollamaCreditsFiniteNumber(percent);
  if (value === null) return '—';
  var rounded = Math.round(value * 10) / 10;
  if (Math.abs(rounded - Math.round(rounded)) < 0.05) return String(Math.round(rounded)) + '%';
  return rounded.toFixed(1) + '%';
}

/** Request-count display with thousands separators (locale independent). */
function ollamaCreditsFormatRequests(value) {
  var number = ollamaCreditsFiniteNumber(value);
  if (number === null) return '—';
  var rounded = Math.round(number);
  var grouped = String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (rounded < 0 ? '-' : '') + grouped;
}

/** USD display with two decimals; null as an em dash. */
function ollamaCreditsFormatUsd(value) {
  var number = ollamaCreditsFiniteNumber(value);
  if (number === null) return '—';
  return '$' + number.toFixed(2);
}

/** Local wall clock of an ISO timestamp, HH:MM:SS, or null. */
function ollamaCreditsFormatClock(iso) {
  var ms = ollamaCreditsIsoTime(iso);
  if (ms === null) return null;
  try {
    var date = new Date(ms);
    return ollamaCreditsPad2(date.getHours()) + ':' + ollamaCreditsPad2(date.getMinutes()) + ':' + ollamaCreditsPad2(date.getSeconds());
  } catch (error) {
    return null;
  }
}

/** Local hour label of an ISO timestamp, e.g. `14:00`; empty when unusable. */
function ollamaCreditsFormatHour(iso) {
  var ms = ollamaCreditsIsoTime(iso);
  if (ms === null) return '';
  try {
    return ollamaCreditsPad2(new Date(ms).getHours()) + ':00';
  } catch (error) {
    return '';
  }
}

/** Local hour range of a bucket, e.g. `14:00-15:00`. */
function ollamaCreditsFormatHourRange(iso) {
  var ms = ollamaCreditsIsoTime(iso);
  if (ms === null) return 'unknown hour';
  try {
    var start = new Date(ms);
    var end = new Date(ms + 3600000);
    return ollamaCreditsPad2(start.getHours()) + ':00-' + ollamaCreditsPad2(end.getHours()) + ':00';
  } catch (error) {
    return 'unknown hour';
  }
}

/**
 * Bar colour for a remaining percent against its low threshold: the low colour
 * at or below the threshold, the normal colour above it (CONTRACT.md §5.3).
 */
function ollamaCreditsBarColor(percent, threshold) {
  var value = ollamaCreditsFiniteNumber(percent);
  var limit = ollamaCreditsFiniteNumber(threshold);
  if (value !== null && limit !== null && value <= limit) return OLLAMA_CREDITS_COLORS.low;
  return OLLAMA_CREDITS_COLORS.normal;
}

/** True when a remaining percent has crossed its low threshold. */
function ollamaCreditsIsLow(percent, threshold) {
  var value = ollamaCreditsFiniteNumber(percent);
  var limit = ollamaCreditsFiniteNumber(threshold);
  return value !== null && limit !== null && value <= limit;
}

/** Model display name; the host folds upstream overflow into `__other__`. */
function ollamaCreditsModelName(model) {
  if (model === '__other__') return 'other';
  if (typeof model === 'string' && model.length > 0) return model;
  return 'unknown';
}

/**
 * The exact 24 hourly buckets the chart renders, oldest first. The host already
 * zero-fills, but a short or long array is normalised here so a version skew
 * never draws a wrong-width chart.
 * @param usage - the overview's `usage` object.
 */
function ollamaCreditsHourlyBuckets(usage) {
  var range = usage !== null && usage !== undefined && typeof usage === 'object' ? usage['24h'] : null;
  var raw = range !== null && range !== undefined && Array.isArray(range.buckets) ? range.buckets : [];
  var list = [];
  for (var i = 0; i < raw.length; i++) {
    var bucket = raw[i];
    if (bucket === undefined || bucket === null || typeof bucket !== 'object') {
      list.push({ from: null, requests: 0, partial: false });
      continue;
    }
    var requests = ollamaCreditsFiniteNumber(bucket.requests);
    list.push({
      from: typeof bucket.from === 'string' ? bucket.from : null,
      requests: requests === null || requests < 0 ? 0 : requests,
      partial: bucket.partial === true
    });
  }
  if (list.length > OLLAMA_CREDITS_HOURS) list = list.slice(list.length - OLLAMA_CREDITS_HOURS);
  while (list.length < OLLAMA_CREDITS_HOURS) list.unshift({ from: null, requests: 0, partial: false });
  return list;
}

/** The busiest bucket of a list, or null when every bucket is empty. */
function ollamaCreditsBusiestBucket(buckets) {
  if (!Array.isArray(buckets)) return null;
  var best = null;
  for (var i = 0; i < buckets.length; i++) {
    var bucket = buckets[i];
    if (bucket === undefined || bucket === null) continue;
    var requests = ollamaCreditsFiniteNumber(bucket.requests);
    if (requests === null || requests <= 0) continue;
    if (best === null || requests > best.requests) best = { index: i, requests: requests, from: bucket.from };
  }
  return best;
}

/** One usage range of the overview (`null` when the host has no such range). */
function ollamaCreditsRange(usage, range) {
  if (usage === null || usage === undefined || typeof usage !== 'object') return null;
  var data = usage[range];
  return data !== null && data !== undefined && typeof data === 'object' ? data : null;
}

/** Total requests of one usage range, or null. */
function ollamaCreditsRangeTotal(rangeData) {
  if (rangeData === null || rangeData === undefined) return null;
  var totals = rangeData.totals;
  if (totals === null || totals === undefined || typeof totals !== 'object') return null;
  return ollamaCreditsFiniteNumber(totals.requests);
}

/**
 * Table rows of one usage range: model, requests, share percent. The host
 * already computes `sharePct`; it is recomputed from the range total when a
 * document omits it, so the column is never blank.
 * @param rangeData - one `UsageRange` object.
 * @returns an array of `{model, requests, sharePct}` (may be empty).
 */
function ollamaCreditsModelRows(rangeData) {
  var rows = [];
  if (rangeData === null || rangeData === undefined) return rows;
  var totals = rangeData.totals !== null && rangeData.totals !== undefined && typeof rangeData.totals === 'object' ? rangeData.totals : null;
  var total = totals === null ? null : ollamaCreditsFiniteNumber(totals.requests);
  var models = totals !== null && Array.isArray(totals.models) ? totals.models : [];
  for (var i = 0; i < models.length; i++) {
    var entry = models[i];
    if (entry === undefined || entry === null || typeof entry !== 'object') continue;
    var requests = ollamaCreditsFiniteNumber(entry.requests);
    if (requests === null) requests = 0;
    var share = ollamaCreditsFiniteNumber(entry.sharePct);
    if (share === null) share = total !== null && total > 0 ? (requests / total) * 100 : 0;
    rows.push({ model: ollamaCreditsModelName(entry.model), requests: requests, sharePct: share });
  }
  return rows;
}

/** Human wording for the host's `message`/`error`/`status` fields. */
function ollamaCreditsErrorMessage(payload, fallback) {
  if (payload !== null && payload !== undefined && typeof payload === 'object') {
    if (typeof payload.message === 'string' && payload.message.length > 0) return payload.message;
    if (typeof payload.error === 'string' && payload.error.length > 0) return payload.error;
    if (typeof payload.status === 'string' && payload.status.length > 0) return payload.status;
  }
  return typeof fallback === 'string' && fallback.length > 0 ? fallback : 'no data';
}

/** Human wording for a rejected request (transport Error, string, or unknown). */
function ollamaCreditsErrorText(error) {
  if (error === null || error === undefined) return 'request failed';
  if (typeof error === 'string') return error;
  if (typeof error.message === 'string' && error.message.length > 0) return error.message;
  return 'request failed';
}

/** Short plan label for the section header and footer. */
function ollamaCreditsPlanLabel(plan) {
  if (plan === 'legacy') return 'Legacy plan';
  if (plan === 'credits') return 'Credit plan';
  return 'Plan unknown';
}

/**
 * Last-poll line parts from an overview/status `poll` object.
 * @returns `{clock, error}` where clock is a local HH:MM:SS string or null.
 */
function ollamaCreditsPollLine(poll) {
  if (poll === null || poll === undefined || typeof poll !== 'object') return { clock: null, error: null };
  var error = typeof poll.lastError === 'string' && poll.lastError.length > 0 ? poll.lastError : null;
  return { clock: ollamaCreditsFormatClock(poll.lastPollAt), error: error };
}

/** Whole-minute interval of an overview `poll` object, or null. */
function ollamaCreditsIntervalMinutes(poll) {
  if (poll === null || poll === undefined || typeof poll !== 'object') return null;
  var minutes = ollamaCreditsFiniteNumber(poll.intervalMin);
  return minutes === null ? null : Math.round(minutes);
}
