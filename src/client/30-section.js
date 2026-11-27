/**
 * dsh-ollama-credits — the first-level Ollama Credits settings section
 * (CONTRACT.md §5.3).
 *
 * Registered on the `settings.section` slot by 90-entry.js. The component
 * self-fetches `overview` on mount and every 30 s while mounted, re-derives the
 * reset countdowns locally from `resetsAt` once per second, and writes config
 * through `POST config` / `POST refresh` (§4.3, §4.5). All styles are inline
 * style objects reading the shell's theme variables with neutral fallbacks, so
 * the panel reads in both light and dark mode and ships no CSS file.
 */

/** Section layout shared by every block. */
var OLLAMA_CREDITS_SECTION_STYLES = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    padding: '2px 4px 32px',
    color: OLLAMA_CREDITS_COLORS.text,
    fontSize: '13px',
    lineHeight: '1.5',
    maxWidth: '760px'
  },
  header: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: '10px',
    flexWrap: 'wrap'
  },
  headerText: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '10px',
    flexWrap: 'wrap',
    minWidth: 0
  },
  title: {
    fontSize: '16px',
    fontWeight: 600,
    letterSpacing: '0.01em',
    lineHeight: '22px'
  },
  muted: {
    color: OLLAMA_CREDITS_COLORS.muted,
    fontSize: '12px',
    lineHeight: '18px'
  },
  small: {
    color: OLLAMA_CREDITS_COLORS.muted,
    fontSize: '11px',
    lineHeight: '16px'
  },
  heading: {
    color: OLLAMA_CREDITS_COLORS.muted,
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    lineHeight: '16px',
    marginBottom: '8px'
  },
  block: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    minWidth: 0
  },
  row: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: '10px',
    minWidth: 0
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap'
  },
  track: {
    height: '5px',
    width: '100%',
    borderRadius: '3px',
    background: OLLAMA_CREDITS_COLORS.track,
    overflow: 'hidden'
  },
  button: {
    border: '1px solid ' + OLLAMA_CREDITS_COLORS.border,
    borderRadius: '6px',
    background: 'transparent',
    color: OLLAMA_CREDITS_COLORS.text,
    font: 'inherit',
    fontSize: '12px',
    lineHeight: '20px',
    padding: '3px 10px',
    cursor: 'pointer'
  },
  buttonActive: {
    border: '1px solid ' + OLLAMA_CREDITS_COLORS.accent,
    borderRadius: '6px',
    background: OLLAMA_CREDITS_COLORS.hover,
    color: OLLAMA_CREDITS_COLORS.text,
    font: 'inherit',
    fontSize: '12px',
    lineHeight: '20px',
    padding: '3px 10px',
    cursor: 'pointer',
    fontWeight: 600
  },
  buttonDisabled: {
    border: '1px solid ' + OLLAMA_CREDITS_COLORS.border,
    borderRadius: '6px',
    background: 'transparent',
    color: OLLAMA_CREDITS_COLORS.muted,
    font: 'inherit',
    fontSize: '12px',
    lineHeight: '20px',
    padding: '3px 10px',
    cursor: 'default'
  },
  input: {
    width: '64px',
    boxSizing: 'border-box',
    border: '1px solid ' + OLLAMA_CREDITS_COLORS.border,
    borderRadius: '6px',
    background: 'transparent',
    color: OLLAMA_CREDITS_COLORS.text,
    font: 'inherit',
    fontSize: '12px',
    lineHeight: '20px',
    padding: '3px 6px'
  },
  error: {
    color: OLLAMA_CREDITS_COLORS.low,
    fontSize: '12px',
    lineHeight: '18px'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '12px'
  },
  th: {
    textAlign: 'left',
    color: OLLAMA_CREDITS_COLORS.muted,
    fontWeight: 600,
    fontSize: '11px',
    lineHeight: '16px',
    padding: '4px 6px',
    borderBottom: '1px solid ' + OLLAMA_CREDITS_COLORS.border
  },
  thRight: {
    textAlign: 'right',
    color: OLLAMA_CREDITS_COLORS.muted,
    fontWeight: 600,
    fontSize: '11px',
    lineHeight: '16px',
    padding: '4px 6px',
    borderBottom: '1px solid ' + OLLAMA_CREDITS_COLORS.border
  },
  td: {
    padding: '4px 6px',
    borderBottom: '1px solid ' + OLLAMA_CREDITS_COLORS.border,
    verticalAlign: 'top',
    wordBreak: 'break-word'
  },
  tdRight: {
    padding: '4px 6px',
    borderBottom: '1px solid ' + OLLAMA_CREDITS_COLORS.border,
    verticalAlign: 'top',
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap'
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '10px 12px',
    border: '1px solid ' + OLLAMA_CREDITS_COLORS.border,
    borderRadius: '8px',
    background: OLLAMA_CREDITS_COLORS.surface,
    minWidth: 0
  },
  chart: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '2px',
    height: '76px',
    width: '100%',
    padding: '2px 0 0',
    borderBottom: '1px solid ' + OLLAMA_CREDITS_COLORS.border,
    boxSizing: 'border-box'
  },
  axis: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '4px',
    width: '100%',
    color: OLLAMA_CREDITS_COLORS.muted,
    fontSize: '10px',
    lineHeight: '14px',
    fontVariantNumeric: 'tabular-nums'
  }
};

/** A thin remaining bar; the fill is the remaining percent. */
function ollamaCreditsSectionBar(percent, color) {
  var value = ollamaCreditsFiniteNumber(percent);
  var width = value === null ? '0%' : String(Math.max(0, Math.min(100, value))) + '%';
  return NS.react.createElement(
    'div',
    { style: OLLAMA_CREDITS_SECTION_STYLES.track },
    NS.react.createElement('div', {
      style: { height: '100%', width: width, background: color, borderRadius: '3px' }
    })
  );
}

/** The `low` pill shown when a window crossed its threshold. */
function ollamaCreditsSectionLowPill(key) {
  return NS.react.createElement(
    'span',
    {
      key: key,
      style: {
        color: OLLAMA_CREDITS_COLORS.low,
        border: '1px solid ' + OLLAMA_CREDITS_COLORS.low,
        borderRadius: '4px',
        fontSize: '10px',
        lineHeight: '14px',
        padding: '0 4px',
        whiteSpace: 'nowrap'
      }
    },
    'low'
  );
}

/**
 * One balance window row (Session/Weekly): percent, threshold-coloured bar and
 * a live reset countdown (CONTRACT.md §5.3 item 1).
 */
function ollamaCreditsSectionWindowRow(label, windowValue, threshold, nowMs, fetchedAtMs, key) {
  var percent = ollamaCreditsWindowPercent(windowValue);
  var seconds = ollamaCreditsWindowSeconds(windowValue, nowMs, fetchedAtMs);
  var color = ollamaCreditsBarColor(percent, threshold);
  var low = ollamaCreditsIsLow(percent, threshold);
  var resetClock = windowValue !== null && windowValue !== undefined && typeof windowValue === 'object' ? ollamaCreditsFormatClock(windowValue.resetsAt) : null;
  var countdown = seconds === null ? 'reset time unknown' : 'resets in ' + ollamaCreditsFormatCountdown(seconds);
  var head = [
    NS.react.createElement('span', { key: 'label', style: { fontWeight: 600 } }, label),
    NS.react.createElement(
      'span',
      { key: 'value', style: { display: 'flex', alignItems: 'baseline', gap: '8px' } },
      low ? ollamaCreditsSectionLowPill('pill') : null,
      NS.react.createElement('span', { style: { fontWeight: 600, fontVariantNumeric: 'tabular-nums' } }, ollamaCreditsFormatPercent(percent))
    )
  ];
  return NS.react.createElement(
    'div',
    { key: key, style: OLLAMA_CREDITS_SECTION_STYLES.card },
    NS.react.createElement('div', { style: OLLAMA_CREDITS_SECTION_STYLES.row }, head),
    ollamaCreditsSectionBar(percent, color),
    NS.react.createElement(
      'div',
      { style: OLLAMA_CREDITS_SECTION_STYLES.small },
      countdown + (resetClock === null ? '' : ' · at ' + resetClock)
    )
  );
}

/**
 * The credit-plan balance row: USD included balance against its allowance, with
 * the same threshold-coloured bar and reset countdown.
 */
function ollamaCreditsSectionIncludedRow(included, purchased, key) {
  var balance = ollamaCreditsFiniteNumber(included.balanceUsd);
  var allowance = ollamaCreditsFiniteNumber(included.allowanceUsd);
  var percent = balance !== null && allowance !== null && allowance > 0 ? (balance / allowance) * 100 : null;
  var color = ollamaCreditsBarColor(percent, 10);
  var period = included.period !== null && included.period !== undefined && typeof included.period === 'object' ? included.period : null;
  var resetIn = period === null ? null : ollamaCreditsFiniteNumber(period.resetInSec);
  var countdown = resetIn === null ? 'reset time unknown' : 'resets in ' + ollamaCreditsFormatCountdown(Math.max(0, resetIn));
  var purchasedBalance = purchased !== null && purchased !== undefined && typeof purchased === 'object' ? ollamaCreditsFiniteNumber(purchased.balanceUsd) : null;
  return NS.react.createElement(
    'div',
    { key: key, style: OLLAMA_CREDITS_SECTION_STYLES.card },
    NS.react.createElement(
      'div',
      { style: OLLAMA_CREDITS_SECTION_STYLES.row },
      NS.react.createElement('span', { style: { fontWeight: 600 } }, 'Included credit'),
      NS.react.createElement(
        'span',
        { style: { fontWeight: 600, fontVariantNumeric: 'tabular-nums' } },
        ollamaCreditsFormatUsd(balance) + ' / ' + ollamaCreditsFormatUsd(allowance)
      )
    ),
    ollamaCreditsSectionBar(percent, color),
    NS.react.createElement(
      'div',
      { style: OLLAMA_CREDITS_SECTION_STYLES.small },
      countdown + (purchasedBalance === null ? '' : ' · ' + ollamaCreditsFormatUsd(purchasedBalance) + ' purchased')
    )
  );
}

/** The 24-bar hourly chart from `usage.24h.buckets` (§5.3 item 2). */
function ollamaCreditsSectionChart(buckets) {
  var max = 0;
  var i;
  for (i = 0; i < buckets.length; i++) {
    if (buckets[i].requests > max) max = buckets[i].requests;
  }
  var bars = [];
  for (i = 0; i < buckets.length; i++) {
    var bucket = buckets[i];
    var occupied = bucket.requests > 0;
    var height = occupied && max > 0 ? Math.max(4, Math.round((bucket.requests / max) * 100)) : 0;
    bars.push(NS.react.createElement('div', {
      key: 'bar-' + String(i),
      title: ollamaCreditsFormatHourRange(bucket.from) + ' · ' + ollamaCreditsFormatRequests(bucket.requests) + ' requests',
      style: {
        flex: '1 1 0',
        minWidth: '2px',
        alignSelf: 'flex-end',
        height: occupied ? String(height) + '%' : '2px',
        background: occupied ? OLLAMA_CREDITS_COLORS.accent : OLLAMA_CREDITS_COLORS.track,
        opacity: bucket.partial === true ? 0.65 : 1,
        borderRadius: '2px 2px 0 0'
      }
    }));
  }
  var labels = [];
  if (buckets.length > 0) {
    var picks = [
      { index: 0, align: 'flex-start', fallback: '-24h' },
      { index: 6, align: 'center', fallback: '' },
      { index: 12, align: 'center', fallback: '' },
      { index: 18, align: 'center', fallback: '' },
      { index: buckets.length - 1, align: 'flex-end', fallback: 'now' }
    ];
    for (var p = 0; p < picks.length; p++) {
      var pick = picks[p];
      var text = '';
      if (pick.index >= 0 && pick.index < buckets.length) {
        text = ollamaCreditsFormatHour(buckets[pick.index].from);
        if (text.length === 0) text = pick.fallback;
      }
      labels.push(NS.react.createElement('span', {
        key: 'label-' + String(p),
        style: { flex: '1 1 0', textAlign: pick.align === 'flex-start' ? 'left' : pick.align === 'flex-end' ? 'right' : 'center' }
      }, text));
    }
  }
  return NS.react.createElement(
    'div',
    { style: OLLAMA_CREDITS_SECTION_STYLES.block },
    NS.react.createElement('div', { style: OLLAMA_CREDITS_SECTION_STYLES.chart }, bars),
    NS.react.createElement('div', { style: OLLAMA_CREDITS_SECTION_STYLES.axis }, labels)
  );
}

/** The range tabs of the per-model table (§5.3 item 3). */
function ollamaCreditsSectionTabs(active, onSelect) {
  var buttons = [];
  for (var i = 0; i < OLLAMA_CREDITS_RANGES.length; i++) {
    var range = OLLAMA_CREDITS_RANGES[i];
    var isActive = range === active;
    buttons.push(NS.react.createElement(
      'button',
      {
        key: 'range-' + range,
        type: 'button',
        'aria-pressed': isActive ? 'true' : 'false',
        onClick: function (rangeValue) {
          return function () {
            onSelect(rangeValue);
          };
        }(range),
        style: isActive ? OLLAMA_CREDITS_SECTION_STYLES.buttonActive : OLLAMA_CREDITS_SECTION_STYLES.button
      },
      range
    ));
  }
  return NS.react.createElement('div', { style: OLLAMA_CREDITS_SECTION_STYLES.controls }, buttons);
}

/** The per-model table: model | requests | share % (`__other__` reads "other"). */
function ollamaCreditsSectionTable(rows) {
  var body = [];
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    body.push(NS.react.createElement(
      'tr',
      { key: 'model-' + String(i) + '-' + row.model },
      NS.react.createElement('td', { style: OLLAMA_CREDITS_SECTION_STYLES.td }, row.model),
      NS.react.createElement('td', { style: OLLAMA_CREDITS_SECTION_STYLES.tdRight }, ollamaCreditsFormatRequests(row.requests)),
      NS.react.createElement('td', { style: OLLAMA_CREDITS_SECTION_STYLES.tdRight }, ollamaCreditsFormatPercent(row.sharePct))
    ));
  }
  return NS.react.createElement(
    'table',
    { style: OLLAMA_CREDITS_SECTION_STYLES.table },
    NS.react.createElement(
      'thead',
      null,
      NS.react.createElement(
        'tr',
        null,
        NS.react.createElement('th', { style: OLLAMA_CREDITS_SECTION_STYLES.th }, 'Model'),
        NS.react.createElement('th', { style: OLLAMA_CREDITS_SECTION_STYLES.thRight }, 'Requests'),
        NS.react.createElement('th', { style: OLLAMA_CREDITS_SECTION_STYLES.thRight }, 'Share')
      )
    ),
    NS.react.createElement('tbody', null, body)
  );
}

/**
 * The section component. Self-fetching: the slot's `inject` face is empty, so
 * props are ignored (the shell may still pass `close`).
 */
function OllamaCreditsSection() {
  var react = NS.react;
  var dataState = react.useState(null);
  var failedState = react.useState(false);
  var errorTextState = react.useState('');
  var nowState = react.useState(function () {
    return Date.now();
  });
  var rangeState = react.useState('24h');
  var intervalState = react.useState('');
  var noteState = react.useState('');
  var savingState = react.useState(false);
  var refreshingState = react.useState(false);
  var dirtyRef = react.useRef(false);

  var data = dataState[0];
  var setData = dataState[1];
  var failed = failedState[0] === true;
  var setFailed = failedState[1];
  var errorText = errorTextState[0];
  var setErrorText = errorTextState[1];
  var now = nowState[0];
  var setNow = nowState[1];
  var range = rangeState[0];
  var setRange = rangeState[1];
  var intervalInput = intervalState[0];
  var setIntervalInput = intervalState[1];
  var note = noteState[0];
  var setNote = noteState[1];
  var saving = savingState[0] === true;
  var setSaving = savingState[1];
  var refreshing = refreshingState[0] === true;
  var setRefreshing = refreshingState[1];

  /** Fetch one overview; a hidden tab skips the relaxed poll, never the first. */
  function loadOverview(force) {
    if (force !== true && typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    ollamaCreditsOverview().then(function (payload) {
      if (payload !== null && payload !== undefined && payload.ok === true) {
        setData({ payload: payload, at: Date.now() });
        setFailed(false);
        setErrorText('');
      } else {
        setFailed(true);
        setErrorText(ollamaCreditsErrorMessage(payload, 'no data'));
      }
    }, function (error) {
      setFailed(true);
      setErrorText(ollamaCreditsErrorText(error));
    });
  }

  /* Mount poll: immediately, then every 30 s while open (§5.3). */
  react.useEffect(function () {
    loadOverview(true);
    var timer = window.setInterval(function () {
      loadOverview(false);
    }, OLLAMA_CREDITS_SECTION_POLL_MS);
    function onVisibility() {
      if (document.visibilityState === 'visible') loadOverview(false);
    }
    document.addEventListener('visibilitychange', onVisibility);
    return function () {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  /* One tick per second keeps both countdowns live without new requests. */
  react.useEffect(function () {
    var timer = window.setInterval(function () {
      setNow(Date.now());
    }, OLLAMA_CREDITS_TICK_MS);
    return function () {
      window.clearInterval(timer);
    };
  }, []);

  /* Seed the interval input from the host config until the user edits it. */
  react.useEffect(function () {
    if (dirtyRef.current) return;
    var payload = data !== null && data !== undefined ? data.payload : null;
    var config = payload !== null && payload !== undefined && payload.config !== null && payload.config !== undefined && typeof payload.config === 'object' ? payload.config : null;
    var minutes = config === null ? null : ollamaCreditsFiniteNumber(config.pollIntervalMin);
    if (minutes !== null) setIntervalInput(String(Math.round(minutes)));
  }, [data]);

  function onRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    setNote('');
    ollamaCreditsRefresh().then(function (payload) {
      if (payload !== null && payload !== undefined && payload.ok === true) {
        setData({ payload: payload, at: Date.now() });
        setFailed(false);
        setErrorText('');
        setNote('Refreshed.');
      } else {
        setFailed(true);
        setErrorText(ollamaCreditsErrorMessage(payload, 'refresh failed'));
      }
    }, function (error) {
      setFailed(true);
      setErrorText(ollamaCreditsErrorText(error));
    }).then(function () {
      setRefreshing(false);
    }, function () {
      setRefreshing(false);
    });
  }

  function onSave() {
    if (saving) return;
    var raw = String(intervalInput).trim();
    var minutes = /^\d+$/.test(raw) ? parseInt(raw, 10) : NaN;
    if (!isFinite(minutes) || minutes < 1 || minutes > 60) {
      setNote('Poll interval must be a whole number from 1 to 60 minutes.');
      return;
    }
    setSaving(true);
    setNote('');
    ollamaCreditsSaveConfig({ pollIntervalMin: minutes }).then(function (payload) {
      if (payload !== null && payload !== undefined && payload.ok === true) {
        dirtyRef.current = false;
        var config = payload.config !== null && payload.config !== undefined && typeof payload.config === 'object' ? payload.config : null;
        var saved = config === null ? null : ollamaCreditsFiniteNumber(config.pollIntervalMin);
        var applied = saved === null ? minutes : Math.round(saved);
        setIntervalInput(String(applied));
        setNote('Saved. Polling every ' + String(applied) + ' min.');
        loadOverview(true);
      } else {
        setNote('Save failed: ' + ollamaCreditsErrorMessage(payload, 'invalid configuration'));
      }
    }, function (error) {
      setNote('Save failed: ' + ollamaCreditsErrorText(error));
    }).then(function () {
      setSaving(false);
    }, function () {
      setSaving(false);
    });
  }

  /* ---- render inputs ---------------------------------------------------- */
  var payload = data !== null && data !== undefined ? data.payload : null;
  var fetchedAt = data !== null && data !== undefined ? data.at : now;
  var balance = payload !== null && payload !== undefined && payload.balance !== null && payload.balance !== undefined && typeof payload.balance === 'object' ? payload.balance : null;
  var usage = payload !== null && payload !== undefined && payload.usage !== null && payload.usage !== undefined && typeof payload.usage === 'object' ? payload.usage : null;
  var poll = payload !== null && payload !== undefined && payload.poll !== null && payload.poll !== undefined && typeof payload.poll === 'object' ? payload.poll : null;
  var config = payload !== null && payload !== undefined && payload.config !== null && payload.config !== undefined && typeof payload.config === 'object' ? payload.config : null;
  var plan = balance !== null && typeof balance.plan === 'string' ? balance.plan : 'unknown';
  var pollLine = ollamaCreditsPollLine(poll);
  var pollInterval = config === null ? ollamaCreditsIntervalMinutes(poll) : ollamaCreditsFiniteNumber(config.pollIntervalMin);
  var sessionThreshold = config === null ? 10 : ollamaCreditsFiniteNumber(config.lowSessionPct);
  if (sessionThreshold === null) sessionThreshold = 10;
  var weeklyThreshold = config === null ? 10 : ollamaCreditsFiniteNumber(config.lowWeeklyPct);
  if (weeklyThreshold === null) weeklyThreshold = 10;

  var children = [];

  /* Header: title, plan + poll facts, manual Refresh (§5.3, §4.3). */
  var headerFacts = ollamaCreditsPlanLabel(plan) + (pollLine.clock === null ? ' · no poll yet' : ' · polled ' + pollLine.clock);
  children.push(NS.react.createElement(
    'div',
    { key: 'header', style: OLLAMA_CREDITS_SECTION_STYLES.header },
    NS.react.createElement(
      'div',
      { style: OLLAMA_CREDITS_SECTION_STYLES.headerText },
      NS.react.createElement('span', { style: OLLAMA_CREDITS_SECTION_STYLES.title }, 'Ollama Credits'),
      NS.react.createElement('span', { style: OLLAMA_CREDITS_SECTION_STYLES.muted }, headerFacts)
    ),
    NS.react.createElement(
      'button',
      {
        type: 'button',
        onClick: onRefresh,
        disabled: refreshing,
        style: refreshing ? OLLAMA_CREDITS_SECTION_STYLES.buttonDisabled : OLLAMA_CREDITS_SECTION_STYLES.button
      },
      refreshing ? 'Refreshing...' : 'Refresh'
    )
  ));

  /* Error / unavailable line: quiet, never a thrown panel (§5.4). */
  if (failed) {
    children.push(NS.react.createElement(
      'div',
      { key: 'error', style: OLLAMA_CREDITS_SECTION_STYLES.error },
      'Unavailable: ' + (errorText.length > 0 ? errorText : 'the host did not answer')
    ));
  }

  /* Balance windows (§5.3 item 1). */
  if (payload !== null) {
    var session = balance !== null && balance.session !== null && balance.session !== undefined && typeof balance.session === 'object' ? balance.session : null;
    var weekly = balance !== null && balance.weekly !== null && balance.weekly !== undefined && typeof balance.weekly === 'object' ? balance.weekly : null;
    var included = balance !== null && balance.included !== null && balance.included !== undefined && typeof balance.included === 'object' ? balance.included : null;
    var purchased = balance !== null && balance.purchased !== null && balance.purchased !== undefined && typeof balance.purchased === 'object' ? balance.purchased : null;
    var windowRows = [
      ollamaCreditsSectionWindowRow('Session', session, sessionThreshold, now, fetchedAt, 'session'),
      ollamaCreditsSectionWindowRow('Weekly', weekly, weeklyThreshold, now, fetchedAt, 'weekly')
    ];
    if (included !== null) windowRows.push(ollamaCreditsSectionIncludedRow(included, purchased, 'included'));
    children.push(NS.react.createElement(
      'div',
      { key: 'balance', style: OLLAMA_CREDITS_SECTION_STYLES.block },
      NS.react.createElement('div', { style: OLLAMA_CREDITS_SECTION_STYLES.heading }, 'Balance'),
      windowRows
    ));

    /* Hourly usage (§5.3 item 2). */
    var buckets = ollamaCreditsHourlyBuckets(usage);
    var range24 = ollamaCreditsRange(usage, '24h');
    var total24 = ollamaCreditsRangeTotal(range24);
    if (total24 === null) {
      total24 = 0;
      for (var b = 0; b < buckets.length; b++) total24 += buckets[b].requests;
    }
    var busiest = ollamaCreditsBusiestBucket(buckets);
    var hourlySummary = ollamaCreditsFormatRequests(total24) + ' requests in the last 24 h';
    if (busiest === null) hourlySummary += ' · no usage recorded';
    else hourlySummary += ' · busiest ' + ollamaCreditsFormatHourRange(busiest.from) + ' (' + ollamaCreditsFormatRequests(busiest.requests) + ')';
    children.push(NS.react.createElement(
      'div',
      { key: 'hourly', style: OLLAMA_CREDITS_SECTION_STYLES.block },
      NS.react.createElement('div', { style: OLLAMA_CREDITS_SECTION_STYLES.heading }, 'Hourly usage'),
      NS.react.createElement('div', { style: OLLAMA_CREDITS_SECTION_STYLES.muted }, hourlySummary),
      ollamaCreditsSectionChart(buckets)
    ));

    /* Per-model detail (§5.3 item 3). */
    var rangeData = ollamaCreditsRange(usage, range);
    var modelRows = ollamaCreditsModelRows(rangeData);
    var rangeTotal = ollamaCreditsRangeTotal(rangeData);
    var modelsChildren = [
      NS.react.createElement('div', { key: 'heading', style: OLLAMA_CREDITS_SECTION_STYLES.heading }, 'Per-model detail'),
      NS.react.createElement('div', { key: 'tabs' }, ollamaCreditsSectionTabs(range, function (nextRange) {
        setRange(nextRange);
      }))
    ];
    if (rangeData === null) {
      modelsChildren.push(NS.react.createElement('div', { key: 'nodata', style: OLLAMA_CREDITS_SECTION_STYLES.small }, 'No ' + range + ' data available yet.'));
    } else if (modelRows.length === 0) {
      modelsChildren.push(NS.react.createElement('div', { key: 'nomodels', style: OLLAMA_CREDITS_SECTION_STYLES.small }, 'No model usage recorded in this range.'));
    } else {
      modelsChildren.push(NS.react.createElement('div', { key: 'table' }, ollamaCreditsSectionTable(modelRows)));
      var totalText = (rangeTotal === null ? '—' : ollamaCreditsFormatRequests(rangeTotal)) + ' requests in ' + range;
      modelsChildren.push(NS.react.createElement('div', { key: 'total', style: OLLAMA_CREDITS_SECTION_STYLES.small }, totalText));
    }
    children.push(NS.react.createElement('div', { key: 'models', style: OLLAMA_CREDITS_SECTION_STYLES.block }, modelsChildren));
  } else {
    children.push(NS.react.createElement(
      'div',
      { key: 'loading', style: OLLAMA_CREDITS_SECTION_STYLES.small },
      failed ? 'Ollama Credits is unavailable. The host row may be disabled or not mounted.' : 'Loading…'
    ));
  }

  /* Settings (§5.3 item 4): interval input + Save (§4.5), last-poll line. */
  var settingsChildren = [
    NS.react.createElement('div', { key: 'heading', style: OLLAMA_CREDITS_SECTION_STYLES.heading }, 'Polling')
  ];
  settingsChildren.push(NS.react.createElement(
    'div',
    { key: 'controls', style: OLLAMA_CREDITS_SECTION_STYLES.controls },
    NS.react.createElement('label', { style: OLLAMA_CREDITS_SECTION_STYLES.muted, htmlFor: 'dsh-ollama-credits-interval' }, 'Poll interval (minutes, 1-60)'),
    NS.react.createElement('input', {
      id: 'dsh-ollama-credits-interval',
      type: 'number',
      min: 1,
      max: 60,
      step: 1,
      value: intervalInput,
      onChange: function (event) {
        dirtyRef.current = true;
        setIntervalInput(event.target.value);
      },
      style: OLLAMA_CREDITS_SECTION_STYLES.input
    }),
    NS.react.createElement(
      'button',
      {
        type: 'button',
        onClick: onSave,
        disabled: saving,
        style: saving ? OLLAMA_CREDITS_SECTION_STYLES.buttonDisabled : OLLAMA_CREDITS_SECTION_STYLES.button
      },
      saving ? 'Saving...' : 'Save'
    )
  ));
  if (note.length > 0) {
    settingsChildren.push(NS.react.createElement('div', { key: 'note', style: OLLAMA_CREDITS_SECTION_STYLES.small }, note));
  }
  var lastPollText = 'Last poll: ' + (pollLine.clock === null ? 'never' : pollLine.clock);
  if (pollInterval !== null) lastPollText += ' · every ' + String(Math.round(pollInterval)) + ' min';
  if (pollLine.error !== null) lastPollText += ' · error: ' + pollLine.error;
  settingsChildren.push(NS.react.createElement(
    'div',
    { key: 'lastpoll', style: pollLine.error === null ? OLLAMA_CREDITS_SECTION_STYLES.small : OLLAMA_CREDITS_SECTION_STYLES.error },
    lastPollText
  ));
  children.push(NS.react.createElement('div', { key: 'settings', style: OLLAMA_CREDITS_SECTION_STYLES.block }, settingsChildren));

  /* Plan footer (§5.3 item 5): legacy warning or USD balances. */
  if (payload !== null) {
    var footerText;
    if (plan === 'legacy') {
      footerText = 'Counts only on legacy plan: Ollama reports request counts, no USD or token totals.';
    } else if (plan === 'credits') {
      var includedBalance = balance !== null && balance.included !== null && balance.included !== undefined && typeof balance.included === 'object' ? ollamaCreditsFiniteNumber(balance.included.balanceUsd) : null;
      var allowanceBalance = balance !== null && balance.included !== null && balance.included !== undefined && typeof balance.included === 'object' ? ollamaCreditsFiniteNumber(balance.included.allowanceUsd) : null;
      var purchasedBalance = balance !== null && balance.purchased !== null && balance.purchased !== undefined && typeof balance.purchased === 'object' ? ollamaCreditsFiniteNumber(balance.purchased.balanceUsd) : null;
      footerText = 'Included ' + ollamaCreditsFormatUsd(includedBalance) + ' of ' + ollamaCreditsFormatUsd(allowanceBalance) + ' · purchased ' + ollamaCreditsFormatUsd(purchasedBalance) + '.';
    } else {
      footerText = 'Plan unknown: the balance document shape was not recognised.';
    }
    children.push(NS.react.createElement('div', { key: 'plan', style: OLLAMA_CREDITS_SECTION_STYLES.small }, footerText));
  }

  return NS.react.createElement('div', { style: OLLAMA_CREDITS_SECTION_STYLES.root }, children);
}

/** The section as registered, guarded so a render defect stays local. */
var OllamaCreditsSectionGuard = ollamaCreditsBoundary(OllamaCreditsSection, 'Ollama Credits is unavailable.');
