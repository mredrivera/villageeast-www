// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: 'https://villageeast.toston.io',
  output: 'server',
  adapter: cloudflare({ imageService: 'passthrough' }),
  session: false,
  trailingSlash: 'never',
  security: { checkOrigin: true },
  build: { inlineStylesheets: 'never' },
  devToolbar: { enabled: false },
  // Never inline scripts: lets us ship a strict Content-Security-Policy without 'unsafe-inline'.
  vite: { build: { assetsInlineLimit: 0 } },
});
