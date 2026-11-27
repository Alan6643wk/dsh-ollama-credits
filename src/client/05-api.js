/**
 * dsh-ollama-credits — same-origin JSON client (CONTRACT.md §4, §5.2, §5.3).
 *
 * Every route is fetched DOCUMENT-RELATIVE through the §5.2 prefix, exactly
 * like the shell's own overview fetches, so the bundle works behind a
 * sub-path deployment. Requests carry a hard timeout and never reject with a
 * bare transport object: callers receive an Error carrying the host's message
 * whenever one was supplied.
 */

/** Join the document-relative API prefix with one route name. */
function ollamaCreditsUrl(path) {
  return OLLAMA_CREDITS_API_BASE + path;
}

/**
 * Perform one JSON request with a hard timeout.
 * @param path - route name after the §4 prefix, e.g. `status`.
 * @param options - optional fetch init overrides (method, headers, body).
 * @returns a promise resolving to the parsed JSON body (or null for an empty
 *   body), rejecting with an Error carrying `status` on any transport or HTTP
 *   failure.
 */
function ollamaCreditsRequest(path, options) {
  if (typeof fetch !== 'function') {
    return Promise.reject(new Error('fetch is unavailable'));
  }
  var init = {};
  if (options !== undefined && options !== null) {
    for (var key in options) {
      if (Object.prototype.hasOwnProperty.call(options, key)) init[key] = options[key];
    }
  }
  var timer = null;
  var controller = null;
  try {
    if (typeof AbortSignal === 'object' && AbortSignal !== null && typeof AbortSignal.timeout === 'function') {
      init.signal = AbortSignal.timeout(OLLAMA_CREDITS_FETCH_TIMEOUT_MS);
    } else if (typeof AbortController === 'function') {
      controller = new AbortController();
      init.signal = controller.signal;
      timer = setTimeout(function () {
        try {
          controller.abort();
        } catch (error) {
          /* an abort after completion is harmless */
        }
      }, OLLAMA_CREDITS_FETCH_TIMEOUT_MS);
    }
  } catch (error) {
    timer = null;
    controller = null;
  }
  function settle() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }
  return fetch(ollamaCreditsUrl(path), init).then(function (response) {
    return response.text().then(function (body) {
      var payload = null;
      if (typeof body === 'string' && body.length > 0) {
        try {
          payload = JSON.parse(body);
        } catch (error) {
          payload = null;
        }
      }
      if (response.ok !== true) {
        var message = payload !== null && payload !== undefined && typeof payload.message === 'string'
          ? payload.message
          : 'request failed (HTTP ' + String(response.status) + ')';
        var failure = new Error(message);
        failure.status = response.status;
        throw failure;
      }
      return payload;
    });
  }).then(function (payload) {
    settle();
    return payload;
  }, function (error) {
    settle();
    throw error;
  });
}

/** GET `status`: the compact facts the foot card renders (§4.2). */
function ollamaCreditsStatus() {
  return ollamaCreditsRequest('status', { method: 'GET' });
}

/** GET `overview`: the full document the settings section renders (§4.1). */
function ollamaCreditsOverview() {
  return ollamaCreditsRequest('overview', { method: 'GET' });
}

/** POST `refresh`: force one poll now; resolves with the fresh overview (§4.3). */
function ollamaCreditsRefresh() {
  return ollamaCreditsRequest('refresh', { method: 'POST' });
}

/**
 * POST `config`: persist a config patch; resolves with `{ok, config}` (§4.5).
 * @param patch - plain object of validated config fields.
 */
function ollamaCreditsSaveConfig(patch) {
  var body = patch === undefined || patch === null ? {} : patch;
  return ollamaCreditsRequest('config', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}
