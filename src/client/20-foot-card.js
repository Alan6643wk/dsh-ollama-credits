/**
 * dsh-ollama-credits — sidebar foot card (CONTRACT.md §5.2).
 *
 * The shell's foot area has no block slot: `sidebar.footer.action` stacks above
 * the Settings row and cannot host a card. So the card is a plain div with its
 * own React root, inserted directly above the shell's Settings seat and re-seated
 * whenever the shell re-renders around it (one body-mutation observer per page
 * bundle, coalesced to one re-check per frame).
 *
 * The card reads `status` only (§4.2), polls it every 30 s while the tab is
 * visible, and derives the reset countdown locally from `resetsAt` with a 1 s
 * tick, so the numbers move without new network traffic (§5.4). Every path is
 * defensive: a missing host row, a null React root, a DOM without the expected
 * anchors, or a failed fetch all degrade to a quiet line instead of an
 * exception or a console message.
 */

/** Card typography/chrome shared by both card layouts. */
var OLLAMA_CREDITS_FOOT_STYLES = {
  title: {
    color: OLLAMA_CREDITS_COLORS.muted,
    fontSize: '10px',
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    lineHeight: '13px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  line: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    marginTop: '5px',
    minWidth: 0
  },
  lineHead: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: '6px',
    minWidth: 0
  },
  label: {
    color: OLLAMA_CREDITS_COLORS.muted,
    fontSize: '10px',
    lineHeight: '12px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  value: {
    color: OLLAMA_CREDITS_COLORS.text,
    fontSize: '11px',
    fontWeight: 600,
    lineHeight: '12px',
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap'
  },
  countdown: {
    color: OLLAMA_CREDITS_COLORS.muted,
    fontSize: '10px',
    lineHeight: '12px',
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap'
  },
  note: {
    color: OLLAMA_CREDITS_COLORS.muted,
    fontSize: '10px',
    lineHeight: '12px',
    marginTop: '4px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  error: {
    color: OLLAMA_CREDITS_COLORS.low,
    fontSize: '10px',
    lineHeight: '12px',
    marginTop: '4px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  }
};

/** The shell sidebar column, when the frame has mounted. */
function ollamaCreditsSidebarColumn() {
  if (typeof document === 'undefined' || document === null) return null;
  try {
    var column = document.querySelector('[data-pane="sidebar"], [class*="sidebarCol"]');
    return column === null || column === undefined ? null : column;
  } catch (error) {
    return null;
  }
}

/** The sidebar foot area (footer actions + the Settings seat), when mounted. */
function ollamaCreditsFootArea() {
  if (typeof document === 'undefined' || document === null) return null;
  try {
    var column = ollamaCreditsSidebarColumn();
    var scope = column === null ? document : column;
    var area = scope.querySelector('[class*="footArea"]');
    if (area !== null && area !== undefined) return area;
    /* Fallback: any foot area carrying a settings seat, so a renamed column
       class does not silently disable the card. */
    var candidates = document.querySelectorAll('[class*="footArea"]');
    for (var i = 0; i < candidates.length; i++) {
      if (candidates[i].querySelector('[class*="settingsArea"]') !== null) return candidates[i];
    }
  } catch (error) {
    /* no recognisable sidebar */
  }
  return null;
}

/** Collapse whitespace and trim a node's text; empty for a non-node. */
function ollamaCreditsNormalizedText(node) {
  if (node === null || node === undefined) return '';
  var text = node.textContent;
  if (typeof text !== 'string') return '';
  return text.replace(/\s+/g, ' ').trim();
}

/** The accessible name of a button: aria-label, then title, then its text. */
function ollamaCreditsButtonName(button) {
  if (button === null || button === undefined) return '';
  var label = button.getAttribute('aria-label');
  if (typeof label === 'string' && label.length > 0) return label;
  var title = button.getAttribute('title');
  if (typeof title === 'string' && title.length > 0) return title;
  return ollamaCreditsNormalizedText(button);
}

/** True when a node is laid out; a menu mounts hidden before it is positioned. */
function ollamaCreditsVisible(node) {
  if (node === null || node === undefined) return false;
  try {
    if (typeof node.getClientRects === 'function' && node.getClientRects().length === 0) return false;
  } catch (error) {
    return true;
  }
  return true;
}

/** Every button inside one scope, in document order (empty for a null scope). */
function ollamaCreditsButtonsWithin(scope) {
  var list = [];
  if (scope === null || scope === undefined) return list;
  try {
    var buttons = scope.querySelectorAll('button');
    for (var i = 0; i < buttons.length; i++) list.push(buttons[i]);
  } catch (error) {
    /* no DOM */
  }
  return list;
}

/** The settings seat inside the sidebar foot (the foot's launcher lives there). */
function ollamaCreditsSettingsArea() {
  if (typeof document === 'undefined' || document === null) return null;
  try {
    var areas = document.querySelectorAll('[class*="settingsArea"]');
    for (var i = 0; i < areas.length; i++) {
      if (areas[i] !== null && areas[i] !== undefined) return areas[i];
    }
  } catch (error) {
    /* no DOM */
  }
  return null;
}

/**
 * The button that leads to the Settings panel.
 *
 * Two shipped shell shapes exist: one seats a direct Settings trigger
 * (`aria-haspopup="dialog"`) in the sidebar foot; the standard 0.2.1-rc.2
 * shell seats the Account menu there (`aria-haspopup="menu"`, accessible name
 * "Account menu"), and its popup's Settings item is the only way in. The finder
 * matches by accessible name, tries the foot seat before the whole sidebar
 * column, and only falls back positionally when no name matches.
 */
function ollamaCreditsSettingsTrigger() {
  if (typeof document === 'undefined' || document === null) return null;
  var column = ollamaCreditsSidebarColumn();
  var area = ollamaCreditsSettingsArea();
  var scopes = [area, column];
  for (var s = 0; s < scopes.length; s++) {
    var buttons = ollamaCreditsButtonsWithin(scopes[s]);
    var i;
    var name;
    var popup;
    /* A direct Settings trigger opens the dialog itself. */
    for (i = 0; i < buttons.length; i++) {
      popup = buttons[i].getAttribute('aria-haspopup');
      name = ollamaCreditsButtonName(buttons[i]);
      if (popup === 'dialog' && name.toLowerCase().indexOf('settings') >= 0) return buttons[i];
    }
    /* The Account menu launcher: its popup carries the Settings item. */
    for (i = 0; i < buttons.length; i++) {
      popup = buttons[i].getAttribute('aria-haspopup');
      name = ollamaCreditsButtonName(buttons[i]);
      if (popup === 'menu' && /account|settings|menu/i.test(name)) return buttons[i];
    }
    /* An unnamed popup launcher still identified by its accessible name. */
    for (i = 0; i < buttons.length; i++) {
      if (/account menu/i.test(ollamaCreditsButtonName(buttons[i]))) return buttons[i];
    }
  }
  /* Shell we do not recognise: keep the old positional fallbacks. */
  var areaButtons = ollamaCreditsButtonsWithin(area);
  if (areaButtons.length > 0) return areaButtons[0];
  if (column !== null) {
    try {
      var popupButton = column.querySelector('button[aria-haspopup]');
      if (popupButton !== null && popupButton !== undefined) return popupButton;
    } catch (error) {
      /* no DOM */
    }
  }
  return null;
}

/** The open settings panel: the dialog carrying nav buttons, if any. */
function ollamaCreditsSettingsPanel() {
  if (typeof document === 'undefined' || document === null) return null;
  try {
    var dialogs = document.querySelectorAll('[role="dialog"]');
    for (var i = 0; i < dialogs.length; i++) {
      if (dialogs[i].querySelector('nav button') !== null) return dialogs[i];
    }
  } catch (error) {
    /* no dialog */
  }
  return null;
}

/**
 * Click the nav row whose text carries the section label. A first-level row is
 * a button inside the panel's nav; a second sweep over every panel button keeps
 * a shell that restructures the nav working.
 * @returns true when a matching row was clicked.
 */
function ollamaCreditsPickSettingsRow(panel, label) {
  if (panel === null || panel === undefined) return false;
  try {
    var rows = panel.querySelectorAll('nav button');
    for (var i = 0; i < rows.length; i++) {
      var text = rows[i].textContent;
      if (typeof text === 'string' && text.indexOf(label) >= 0) {
        rows[i].click();
        return true;
      }
    }
    var buttons = panel.querySelectorAll('button');
    for (var j = 0; j < buttons.length; j++) {
      var other = buttons[j].textContent;
      if (typeof other === 'string' && other.indexOf(label) >= 0) {
        buttons[j].click();
        return true;
      }
    }
  } catch (error) {
    /* the panel vanished between query and click */
  }
  return false;
}

/**
 * The open menu popup's Settings item, if any. The standard shell's Account
 * menu renders into a portal as `role="menu"` with `role="menuitem"` buttons;
 * the Settings row's label is the localized `Settings` followed by its
 * shortcut. A popup whose buttons carry no menuitem role is still searched.
 */
function ollamaCreditsSettingsMenuItem() {
  if (typeof document === 'undefined' || document === null) return null;
  var candidates = [];
  try {
    var inMenus = document.querySelectorAll('[role="menu"] [role="menuitem"], [role="menu"] button, [role="menuitem"]');
    for (var i = 0; i < inMenus.length; i++) candidates.push(inMenus[i]);
    if (candidates.length === 0) {
      var menus = document.querySelectorAll('[role="menu"]');
      for (var j = 0; j < menus.length; j++) {
        var menuButtons = menus[j].querySelectorAll('button');
        for (var k = 0; k < menuButtons.length; k++) candidates.push(menuButtons[k]);
      }
    }
  } catch (error) {
    return null;
  }
  for (var m = 0; m < candidates.length; m++) {
    var node = candidates[m];
    if (!ollamaCreditsVisible(node)) continue;
    if (/^settings\b/i.test(ollamaCreditsNormalizedText(node))) return node;
  }
  return null;
}

/**
 * Open the settings panel on the Ollama Credits section (§5.2).
 *
 * The shell owns the panel's open state and exposes no service for it, so the
 * card replays the user's own path. Three shapes are handled:
 *   - a panel that is already open: only the nav row is picked (never toggled);
 *   - an account menu that is already open: its Settings item is clicked as-is;
 *   - otherwise the foot's launcher is activated; when that launcher opened the
 *     account menu popup rather than the dialog (the standard shell), the
 *     popup's Settings item is clicked exactly once and the dialog wait goes on.
 * Every step degrades silently.
 * @param label - the section's nav label.
 */
function ollamaCreditsOpenSettings(label) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  try {
    var panel = ollamaCreditsSettingsPanel();
    if (panel !== null) {
      ollamaCreditsPickSettingsRow(panel, label);
      return;
    }
    var openMenuItem = ollamaCreditsSettingsMenuItem();
    if (openMenuItem !== null) {
      ollamaCreditsClickSettingsMenuItem(openMenuItem, label);
      return;
    }
    var trigger = ollamaCreditsSettingsTrigger();
    if (trigger === null) return;
    trigger.click();
    ollamaCreditsAwaitSettings(label, 0, false);
  } catch (error) {
    /* a click must never surface an exception */
  }
}

/** Click the account menu's Settings item, then wait for the dialog. */
function ollamaCreditsClickSettingsMenuItem(item, label) {
  try {
    item.click();
  } catch (error) {
    /* the popup re-rendered between query and click */
  }
  ollamaCreditsAwaitSettings(label, 0, true);
}

/**
 * Poll for the settings panel after the launcher was activated. When the
 * launcher opened the Account menu instead of the dialog, the popup's Settings
 * item is clicked once — the menu closes and the dialog mounts on later frames
 * — and polling continues. Bounded at 60 steps so a hostile shell cannot spin.
 * @param label - the section's nav label.
 * @param tries - elapsed 50 ms steps.
 * @param menuClicked - true once the popup's Settings item was clicked.
 */
function ollamaCreditsAwaitSettings(label, tries, menuClicked) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  try {
    var panel = ollamaCreditsSettingsPanel();
    if (panel !== null) {
      ollamaCreditsPickSettingsRow(panel, label);
      return;
    }
    if (menuClicked !== true) {
      var item = ollamaCreditsSettingsMenuItem();
      if (item !== null) {
        try {
          item.click();
        } catch (error) {
          /* the popup re-rendered; later steps only wait for the dialog */
        }
        menuClicked = true;
      }
    }
    if (tries < 60) {
      window.setTimeout(function () {
        ollamaCreditsAwaitSettings(label, tries + 1, menuClicked);
      }, 50);
    }
  } catch (error) {
    /* give up quietly: the panel stays wherever it was */
  }
}

/** Thin remaining bar; the fill width is the remaining percent itself. */
function ollamaCreditsFootBar(percent, color, height) {
  var value = ollamaCreditsFiniteNumber(percent);
  var width = value === null ? '0%' : String(Math.max(0, Math.min(100, value))) + '%';
  return NS.react.createElement(
    'div',
    {
      style: {
        height: height,
        width: '100%',
        borderRadius: height,
        background: OLLAMA_CREDITS_COLORS.track,
        overflow: 'hidden'
      }
    },
    NS.react.createElement('div', {
      style: { height: '100%', width: width, background: color, borderRadius: height }
    })
  );
}

/**
 * One Session/Week row.
 * @param label - `Session` or `Week`.
 * @param windowValue - `{remainingPercent, resetsAt, resetInSec}` or null.
 * @param threshold - low threshold percent, or null.
 * @param nowMs - current epoch milliseconds (the 1 s tick).
 * @param fetchedAtMs - when the status document was received.
 * @param compact - true inside the collapsed rail layout.
 * @param key - React list key.
 */
function ollamaCreditsFootWindow(label, windowValue, threshold, nowMs, fetchedAtMs, compact, key) {
  var percent = ollamaCreditsWindowPercent(windowValue);
  var seconds = ollamaCreditsWindowSeconds(windowValue, nowMs, fetchedAtMs);
  var color = ollamaCreditsBarColor(percent, threshold);
  if (compact) {
    return NS.react.createElement(
      'div',
      { key: key, style: OLLAMA_CREDITS_FOOT_STYLES.line },
      NS.react.createElement(
        'div',
        { style: OLLAMA_CREDITS_FOOT_STYLES.lineHead },
        NS.react.createElement('span', { style: { color: OLLAMA_CREDITS_COLORS.muted, fontSize: '9px', lineHeight: '11px' } }, label.charAt(0)),
        NS.react.createElement(
          'span',
          { style: { color: OLLAMA_CREDITS_COLORS.text, fontSize: '9px', fontWeight: 600, lineHeight: '11px', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } },
          percent === null ? '—' : String(Math.round(percent))
        )
      ),
      ollamaCreditsFootBar(percent, color, '2px')
    );
  }
  var countdown = seconds === null ? 'resets unknown' : 'resets in ' + ollamaCreditsFormatCountdown(seconds);
  return NS.react.createElement(
    'div',
    { key: key, style: OLLAMA_CREDITS_FOOT_STYLES.line },
    NS.react.createElement(
      'div',
      { style: OLLAMA_CREDITS_FOOT_STYLES.lineHead },
      NS.react.createElement('span', { style: OLLAMA_CREDITS_FOOT_STYLES.label }, label),
      NS.react.createElement('span', { style: OLLAMA_CREDITS_FOOT_STYLES.value }, ollamaCreditsFormatPercent(percent))
    ),
    ollamaCreditsFootBar(percent, color, '3px'),
    NS.react.createElement('div', { style: OLLAMA_CREDITS_FOOT_STYLES.countdown }, countdown)
  );
}

/**
 * The footer line of a metered (credit) plan: purchased balance, when known.
 * Legacy plans expose no USD figure, so nothing is invented for them (§8).
 */
function ollamaCreditsFootCreditLine(included, purchased, compact, key) {
  if (included === null || included === undefined || typeof included !== 'object') return null;
  var balance = ollamaCreditsFiniteNumber(included.balanceUsd);
  var allowance = ollamaCreditsFiniteNumber(included.allowanceUsd);
  if (balance === null && allowance === null) return null;
  var percent = balance !== null && allowance !== null && allowance > 0 ? (balance / allowance) * 100 : null;
  var color = ollamaCreditsBarColor(percent, 10);
  if (compact) {
    return NS.react.createElement(
      'div',
      { key: key, style: OLLAMA_CREDITS_FOOT_STYLES.line },
      NS.react.createElement(
        'div',
        { style: OLLAMA_CREDITS_FOOT_STYLES.lineHead },
        NS.react.createElement('span', { style: { color: OLLAMA_CREDITS_COLORS.muted, fontSize: '9px', lineHeight: '11px' } }, 'C'),
        NS.react.createElement('span', { style: { color: OLLAMA_CREDITS_COLORS.text, fontSize: '9px', fontWeight: 600, lineHeight: '11px', whiteSpace: 'nowrap' } }, ollamaCreditsFormatUsd(balance))
      ),
      ollamaCreditsFootBar(percent, color, '2px')
    );
  }
  var purchasedValue = purchased !== null && purchased !== undefined && typeof purchased === 'object' ? ollamaCreditsFiniteNumber(purchased.balanceUsd) : null;
  var meta = allowance === null ? 'included credit' : 'of ' + ollamaCreditsFormatUsd(allowance) + ' included' + (purchasedValue === null ? '' : ' · ' + ollamaCreditsFormatUsd(purchasedValue) + ' purchased');
  return NS.react.createElement(
    'div',
    { key: key, style: OLLAMA_CREDITS_FOOT_STYLES.line },
    NS.react.createElement(
      'div',
      { style: OLLAMA_CREDITS_FOOT_STYLES.lineHead },
      NS.react.createElement('span', { style: OLLAMA_CREDITS_FOOT_STYLES.label }, 'Credit'),
      NS.react.createElement('span', { style: OLLAMA_CREDITS_FOOT_STYLES.value }, ollamaCreditsFormatUsd(balance))
    ),
    ollamaCreditsFootBar(percent, color, '3px'),
    NS.react.createElement('div', { style: OLLAMA_CREDITS_FOOT_STYLES.countdown }, meta)
  );
}

/** One-line summary used as the card tooltip (and the collapsed-rail legend). */
function ollamaCreditsFootTitle(payload, session, weekly) {
  var parts = [];
  if (session !== null && session !== undefined) {
    parts.push('Session ' + ollamaCreditsFormatPercent(ollamaCreditsWindowPercent(session)) + ' left');
  }
  if (weekly !== null && weekly !== undefined) {
    parts.push('Week ' + ollamaCreditsFormatPercent(ollamaCreditsWindowPercent(weekly)) + ' left');
  }
  return parts.length === 0 ? 'Ollama Credits' : 'Ollama Credits — ' + parts.join(' · ');
}

/**
 * The card body. Owns its poll loop and countdown tick; renders only from the
 * fetched status document and never reads a global store.
 * @param props - `{onOpen}` provided by the mount below.
 */
function OllamaCreditsFootCard(props) {
  var react = NS.react;
  var dataState = react.useState(null);
  var failedState = react.useState(false);
  var nowState = react.useState(function () {
    return Date.now();
  });
  var compactState = react.useState(false);
  var rootRef = react.useRef(null);
  var data = dataState[0];
  var setData = dataState[1];
  var failed = failedState[0] === true;
  var setFailed = failedState[1];
  var now = nowState[0];
  var setNow = nowState[1];
  var compact = compactState[0] === true;
  var setCompact = compactState[1];

  /* Poll `status` every 30 s while the tab is visible (§5.2); the first fetch
     runs immediately so the numbers are live within the 2 s budget (§5.4). */
  react.useEffect(function () {
    var cancelled = false;
    function load() {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      ollamaCreditsStatus().then(function (payload) {
        if (cancelled) return;
        if (payload !== null && payload !== undefined && payload.ok === true) {
          setData({ payload: payload, at: Date.now() });
          setFailed(false);
        } else {
          setFailed(true);
        }
      }, function () {
        if (!cancelled) setFailed(true);
      });
    }
    load();
    var timer = window.setInterval(load, OLLAMA_CREDITS_FOOT_POLL_MS);
    function onVisibility() {
      if (document.visibilityState === 'visible') load();
    }
    document.addEventListener('visibilitychange', onVisibility);
    return function () {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  /* The countdown moves locally: one tick per second, no network (§5.2). */
  react.useEffect(function () {
    var timer = window.setInterval(function () {
      setNow(Date.now());
    }, OLLAMA_CREDITS_TICK_MS);
    return function () {
      window.clearInterval(timer);
    };
  }, []);

  /* Rail layout detection: 56 px collapsed sidebar has no room for the full
     rows, so the card measures itself and drops to letter + percent. */
  react.useEffect(function () {
    var node = rootRef.current;
    if (node === null || node === undefined) return undefined;
    function measure() {
      try {
        var width = node.getBoundingClientRect().width;
        if (width > 0) setCompact(width < OLLAMA_CREDITS_COMPACT_WIDTH);
      } catch (error) {
        /* measurement is an optimisation only */
      }
    }
    measure();
    var observer = null;
    if (typeof ResizeObserver === 'function') {
      try {
        observer = new ResizeObserver(measure);
        observer.observe(node);
      } catch (error) {
        observer = null;
      }
    }
    return function () {
      if (observer !== null) {
        try {
          observer.disconnect();
        } catch (error) {
          /* already detached */
        }
      }
    };
  }, []);

  var payload = data !== null && data !== undefined ? data.payload : null;
  var fetchedAt = data !== null && data !== undefined ? data.at : now;
  var windows = payload !== null && payload !== undefined && payload.windows !== null && payload.windows !== undefined && typeof payload.windows === 'object' ? payload.windows : null;
  var session = windows === null ? null : windows.session;
  var weekly = windows === null ? null : windows.weekly;
  var thresholds = payload !== null && payload !== undefined && payload.thresholds !== null && payload.thresholds !== undefined && typeof payload.thresholds === 'object' ? payload.thresholds : null;
  var sessionThreshold = thresholds === null ? null : ollamaCreditsFiniteNumber(thresholds.sessionPct);
  var weeklyThreshold = thresholds === null ? null : ollamaCreditsFiniteNumber(thresholds.weeklyPct);
  var included = payload !== null && payload !== undefined && payload.included !== null && payload.included !== undefined && typeof payload.included === 'object' ? payload.included : null;
  var purchased = payload !== null && payload !== undefined && payload.purchased !== null && payload.purchased !== undefined && typeof payload.purchased === 'object' ? payload.purchased : null;
  var statusPoll = payload !== null && payload !== undefined && payload.poll !== null && payload.poll !== undefined && typeof payload.poll === 'object' ? payload.poll : null;
  var pollError = statusPoll !== null && typeof statusPoll.lastError === 'string' && statusPoll.lastError.length > 0 ? statusPoll.lastError : null;

  var children = [];
  if (payload === null) {
    children.push(NS.react.createElement('div', { key: 'title', style: OLLAMA_CREDITS_FOOT_STYLES.title }, 'Ollama Credits'));
    children.push(NS.react.createElement(
      'div',
      { key: 'quiet', style: OLLAMA_CREDITS_FOOT_STYLES.note },
      failed ? 'unavailable' : 'Loading'
    ));
  } else {
    if (!compact) {
      children.push(NS.react.createElement('div', { key: 'title', style: OLLAMA_CREDITS_FOOT_STYLES.title }, 'Ollama Credits'));
    }
    children.push(ollamaCreditsFootWindow('Session', session, sessionThreshold, now, fetchedAt, compact, 'session'));
    children.push(ollamaCreditsFootWindow('Week', weekly, weeklyThreshold, now, fetchedAt, compact, 'weekly'));
    var creditLine = ollamaCreditsFootCreditLine(included, purchased, compact, 'credit');
    if (creditLine !== null) children.push(creditLine);
    /* One quiet error line: a failed fetch, or the host's own last poll error
       (a failed poll keeps the previous numbers and reports here, §4.1). */
    var errorLine = failed ? 'unavailable' : pollError;
    if (errorLine !== null) {
      children.push(NS.react.createElement('div', { key: 'stale', style: OLLAMA_CREDITS_FOOT_STYLES.error }, errorLine));
    }
  }

  var titleText = ollamaCreditsFootTitle(payload, session, weekly);
  return NS.react.createElement(
    'button',
    {
      type: 'button',
      ref: rootRef,
      title: titleText,
      'aria-label': titleText,
      onClick: function () {
        if (props !== null && props !== undefined && typeof props.onOpen === 'function') {
          try {
            props.onOpen();
          } catch (error) {
            /* open is best effort */
          }
        }
      },
      style: {
        display: 'block',
        boxSizing: 'border-box',
        width: '100%',
        minWidth: 0,
        margin: compact ? '0 0 4px' : '0 0 6px',
        padding: compact ? '4px 5px' : '7px 9px',
        border: '1px solid ' + OLLAMA_CREDITS_COLORS.border,
        borderRadius: '8px',
        background: OLLAMA_CREDITS_COLORS.surface,
        color: OLLAMA_CREDITS_COLORS.text,
        font: 'inherit',
        textAlign: 'left',
        cursor: 'pointer',
        overflow: 'hidden'
      }
    },
    children
  );
}

/**
 * A minimal error boundary so a rendering defect degrades to a quiet line
 * instead of an uncaught React error in the sidebar foot.
 * @param component - the component to guard.
 * @param fallbackText - the quiet line rendered when it throws.
 */
function ollamaCreditsBoundary(component, fallbackText) {
  var react = NS.react;
  if (react === null || react === undefined || typeof react.Component !== 'function') return component;
  return class extends react.Component {
    componentDidCatch() {
      /* swallow: this plugin must never surface a console error */
    }
    static getDerivedStateFromError() {
      return { failed: true };
    }
    constructor(props) {
      super(props);
      this.state = { failed: false };
    }
    render() {
      if (this.state !== null && this.state !== undefined && this.state.failed === true) {
        return react.createElement(
          'div',
          { style: { color: OLLAMA_CREDITS_COLORS.muted, fontSize: '10px', lineHeight: '12px', padding: '4px 6px' } },
          typeof fallbackText === 'string' && fallbackText.length > 0 ? fallbackText : 'unavailable'
        );
      }
      return react.createElement(component, this.props);
    }
  };
}

/** The card as registered with the React root (guarded, CONTRACT.md §5.2). */
var OllamaCreditsFootGuard = ollamaCreditsBoundary(OllamaCreditsFootCard, 'unavailable');

/**
 * Mount the foot card directly above the shell's Settings row.
 *
 * Idempotent at the DOM level: an already-present container (a duplicated apply
 * or an HMR re-injection) makes this a no-op. The container is a plain div with
 * its own React root, so it can never disturb the shell's reconciliation.
 * @param options - `{onOpen}`: the card click, i.e. open the settings section.
 * @returns a disposer removing the container, its root and its observer.
 */
function ollamaCreditsMountFootCard(options) {
  var noop = function () {};
  if (typeof document === 'undefined' || document === null || typeof document.body === 'undefined' || document.body === null) return noop;
  try {
    if (document.querySelector(OLLAMA_CREDITS_FOOT_SELECTOR) !== null) return noop;
  } catch (error) {
    return noop;
  }
  var container = null;
  try {
    container = document.createElement('div');
    container.setAttribute(OLLAMA_CREDITS_FOOT_ATTR, '');
    container.style.boxSizing = 'border-box';
    container.style.display = 'block';
    container.style.width = '100%';
    container.style.minWidth = '0';
    container.style.flex = 'none';
  } catch (error) {
    return noop;
  }
  if (NS.createRoot === null || NS.createRoot === undefined) {
    /* No React root available (CONTRACT §5.1 fallback): skip the card, the
       settings section is still registered by the entry. */
    return noop;
  }
  var root = null;
  try {
    root = NS.createRoot(container);
  } catch (error) {
    return noop;
  }
  try {
    root.render(NS.react.createElement(OllamaCreditsFootGuard, {
      onOpen: options !== null && options !== undefined && typeof options.onOpen === 'function' ? options.onOpen : null
    }));
  } catch (error) {
    try {
      root.unmount();
    } catch (unmountError) {
      /* nothing was committed */
    }
    return noop;
  }

  var disposed = false;
  var observer = null;
  var frame = null;

  function place() {
    if (disposed) return;
    var foot = ollamaCreditsFootArea();
    if (foot === null) return;
    try {
      var settings = foot.querySelector('[class*="settingsArea"]');
      if (settings !== null && settings.parentNode === foot) {
        if (container.nextElementSibling !== settings) foot.insertBefore(container, settings);
        return;
      }
      if (container.parentNode !== foot) foot.appendChild(container);
    } catch (error) {
      /* the shell re-rendered mid-placement; the next mutation retries */
    }
  }

  function schedule() {
    if (disposed) return;
    if (typeof requestAnimationFrame === 'function') {
      if (frame !== null) return;
      frame = requestAnimationFrame(function () {
        frame = null;
        if (!disposed) place();
      });
      return;
    }
    frame = window.setTimeout(function () {
      frame = null;
      if (!disposed) place();
    }, 16);
  }

  /* First placement, plus two cheap retries for a shell that mounts the sidebar
     without a body-level mutation we can observe. */
  place();
  window.setTimeout(place, 0);
  window.setTimeout(place, 500);

  try {
    if (typeof MutationObserver === 'function') {
      observer = new MutationObserver(function (records) {
        var relevant = false;
        for (var i = 0; i < records.length; i++) {
          var target = records[i].target;
          /* Ignore our own React updates inside the card's subtree: only shell
             re-renders around the container need a re-seat. */
          if (target === container) continue;
          if (typeof container.contains === 'function' && container.contains(target)) continue;
          relevant = true;
          break;
        }
        if (relevant) schedule();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  } catch (error) {
    observer = null;
  }

  return function () {
    if (disposed) return;
    disposed = true;
    if (observer !== null) {
      try {
        observer.disconnect();
      } catch (error) {
        /* already disconnected */
      }
      observer = null;
    }
    if (frame !== null) {
      if (typeof cancelAnimationFrame === 'function') {
        try {
          cancelAnimationFrame(frame);
        } catch (error) {
          /* already flushed */
        }
      } else {
        try {
          window.clearTimeout(frame);
        } catch (error) {
          /* already flushed */
        }
      }
      frame = null;
    }
    try {
      root.unmount();
    } catch (error) {
      /* the root was already torn down */
    }
    try {
      if (container.parentNode !== null && container.parentNode !== undefined) container.parentNode.removeChild(container);
    } catch (error) {
      /* already detached */
    }
  };
}
