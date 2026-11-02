import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwind from "@astrojs/tailwind";
import { autoNewTabExternalLinks } from './src/autoNewTabExternalLinks';
import { remarkMermaid } from './src/remarkMermaid';

import partytown from "@astrojs/partytown";

// The single source of truth for the public origin. `canonical`, the `hreflang`
// alternates, the sitemap, robots.txt, the RSS feed and every `og:`/`twitter:`
// URL are built from it, so changing it here changes all of them.
// TODO: if you move to a custom domain, this is the only line to edit.
const SITE_URL = 'https://guillesanper.github.io';

// https://astro.build/config
export default defineConfig({
  site: SITE_URL,
  i18n: {
    locales: ['en', 'es'],
    defaultLocale: 'en',
    routing: {
      prefixDefaultLocale: false
    }
  },
  integrations: [
    mdx(),
    sitemap({
      i18n: {
        defaultLocale: 'en',
        locales: { en: 'en', es: 'es' }
      }
    }),
    tailwind(),
    partytown()
  ],
  markdown: {
    extendDefaultPlugins: true,
    // ```mermaid fences become diagram figures, rendered in the browser on
    // the pages that have them (see src/components/Diagram.astro).
    remarkPlugins: [remarkMermaid],
    // Links in post bodies that point outside the site open in a new tab. The
    // domain must be the production one: with 'localhost:4321' every absolute
    // self-link in a post would be misread as external.
    rehypePlugins: [[autoNewTabExternalLinks, {
      domain: new URL(SITE_URL).host
    }]]
  }
});