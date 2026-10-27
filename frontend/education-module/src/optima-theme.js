const keys = ['canvas', 'surface', 'surface-muted', 'text', 'text-soft', 'muted', 'line', 'line-strong', 'accent', 'accent-hover', 'accent-soft', 'action-bg', 'action-text', 'font-body'];

function apply(theme, tokens) {
  document.documentElement.dataset.theme = theme === 'dark' ? 'dark' : 'light';
  for (const key of keys) {
    if (typeof tokens?.[key] === 'string' && tokens[key]) {
      document.documentElement.style.setProperty('--optima-' + key, tokens[key]);
    }
  }
}

if (window.parent !== window) {
  try {
    const root = window.parent.document.documentElement;
    const styles = window.parent.getComputedStyle(root);
    apply(root.dataset.theme, Object.fromEntries(keys.map(key => [key, styles.getPropertyValue('--' + key).trim()])));
  } catch { /* Standalone preview uses the local defaults. */ }
  window.addEventListener('message', event => {
    if (event.origin !== window.location.origin || event.source !== window.parent || event.data?.type !== 'optima-education-theme') return;
    apply(event.data.theme, event.data.tokens);
  });
}
