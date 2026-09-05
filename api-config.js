// Public API origin, not a secret. Local development keeps its own browser data.
export const apiOrigin = globalThis.location?.hostname === 'blazzer10200.github.io'
  ? 'https://bandbook-blazzer10200.rebelwarrior2004.chatgpt.site' : '';
export const apiUrl = path => apiOrigin + path;
