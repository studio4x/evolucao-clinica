// Fix for "Cannot set property fetch of #<Window> which has only a getter"
// This error occurs when a script (like Google APIs) tries to overwrite fetch
// in an environment where fetch is defined as a read-only getter (like some iframes).
(function() {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'fetch');
    // If it's a getter-only property and is configurable, we add a setter to prevent the TypeError
    if (descriptor && descriptor.get && !descriptor.set && descriptor.configurable !== false) {
      const originalFetch = window.fetch;
      Object.defineProperty(window, 'fetch', {
        get: function() { return originalFetch; },
        set: function(v) { 
          console.warn('Intercepted attempt to overwrite window.fetch. Original fetch preserved.');
        },
        configurable: true,
        enumerable: true
      });
    }
  } catch (e) {
    // If we can't redefine it, we just hope for the best
  }
})();
