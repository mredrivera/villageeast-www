// Ambient declaration (this file must stay free of imports/exports).
declare module 'cloudflare:workers' {
  /** Runtime bindings and variables; given a precise type in src/lib/env.ts. */
  export const env: Record<string, unknown>;
}
