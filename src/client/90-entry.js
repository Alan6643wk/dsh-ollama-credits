/**
 * dsh-ollama-credits — client entry (CONTRACT.md §5.1).
 *
 * The last module in filename order, so every helper above it exists by the
 * time the loader reads these exports. `apply` seats the two surfaces:
 *
 *   1. the sidebar foot card (a plain div with its own React root, see
 *      20-foot-card.js), disposed through `ctx.effect`;
 *   2. the `settings.section` registration (§5.3), through the slot service's
 *      own `inject`, so a missing or late slot service simply leaves the
 *      declaration pending instead of throwing.
 *
 * The client bundle degrades without optional services: `slots` is the only
 * required one, and even a null React root only costs the foot card.
 */

/** Required client services (§5.1). */
var OLLAMA_CREDITS_INJECT = ['slots'];

/**
 * Client plugin body.
 * @param ctx - client root context carrying `slots`.
 */
function apply(ctx) {
  try {
    if (ctx === undefined || ctx === null) return;

    /* Foot card: mount at most once per page (the data attribute is the DOM
       level guard) and hand its disposer to the plugin's effect scope. */
    var disposeFootCard = ollamaCreditsMountFootCard({
      onOpen: function () {
        ollamaCreditsOpenSettings(OLLAMA_CREDITS_SECTION_LABEL);
      }
    });
    if (typeof ctx.effect === 'function') {
      ctx.effect(function () {
        return function () {
          try {
            disposeFootCard();
          } catch (error) {
            /* the container was already gone */
          }
        };
      }, 'dsh-ollama-credits: sidebar foot card');
    }

    /* Settings section: register through the slot service. The registration
       options carry the nav identity; `inject` returns the component props
       (empty: the component self-fetches). */
    var slots = ctx.slots;
    if (slots === undefined || slots === null || typeof slots.inject !== 'function' || typeof slots.register !== 'function') return;
    slots.inject(OLLAMA_CREDITS_SECTION_SLOT, function () {
      try {
        var unregister = slots.register({
          name: OLLAMA_CREDITS_SECTION_SLOT,
          id: OLLAMA_CREDITS_SECTION_ID,
          order: OLLAMA_CREDITS_SECTION_ORDER,
          label: function () {
            return OLLAMA_CREDITS_SECTION_LABEL;
          },
          inject: function () {
            return {};
          }
        }, OllamaCreditsSectionGuard);
        return function () {
          unregister();
        };
      } catch (error) {
        /* A slot contract mismatch must not break the client plugin. */
        return function () {};
      }
    });
  } catch (error) {
    /* apply never throws out of a client plugin (CONTRACT.md §5.2). */
  }
}

module.exports.apply = apply;
module.exports.inject = OLLAMA_CREDITS_INJECT;
