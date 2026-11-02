# guillesanper.github.io

Personal portfolio and blog of **Guillermo Sanchez** — Software Engineer, Platform & ML.

**Live site: [guillesanper.github.io](https://guillesanper.github.io)**

Built with [Astro](https://astro.build) as a fully static site, with no UI framework: the
shipped JavaScript is only what the pages actually need.

## Stack

| | |
| :--- | :--- |
| Framework | Astro 5 (static output) |
| Styling | Tailwind CSS + `@tailwindcss/typography` |
| Content | Markdown / MDX content collections |
| SEO | `@astrojs/sitemap`, generated `robots.txt`, RSS feed, canonical + `hreflang` tags |
| Analytics | Google Analytics via `@astrojs/partytown` (off unless configured) |
| Package manager | pnpm |

## Local development

Requires Node (see [`.nvmrc`](.nvmrc)) and pnpm (see the `packageManager` field in
[`package.json`](package.json)).

```bash
pnpm install
pnpm dev
```

| Command | Action |
| :--- | :--- |
| `pnpm install` | Install dependencies |
| `pnpm dev` | Start the dev server at `localhost:4321` |
| `pnpm build` | Type-check (`astro check`) and build to `./dist/` |
| `pnpm preview` | Serve the production build locally |

## Internationalisation

The site is bilingual, using Astro's native i18n with `prefixDefaultLocale: false`:

- **English** — the default locale, served from the root: `/`, `/blog/`, `/projects/`
- **Spanish** — served under a prefix: `/es/`, `/es/blog/`, `/es/projects/`

UI strings live in [`src/i18n/ui.ts`](src/i18n/ui.ts). Posts and projects carry per-language
overrides in their own frontmatter and data. A small client-side script routes first-time
visitors to their preferred language and remembers the choice in `localStorage`; the 404 page
opts out of that redirect on purpose.

## Project pages

Every project card can open a page at `/projects/<slug>/` with an architecture diagram, how
the system works and the design decisions behind it.

- Card data (name, summary, tags, links) stays in
  [`src/pages/projects/projects.ts`](src/pages/projects/projects.ts), including its `slug`.
- The page is `src/content/projects/<slug>.mdx`. Its frontmatter holds the header diagram
  (`diagram`, Mermaid source) and `diagramCaption`. A project with no file keeps linking
  straight to its repository.
- In the body, a ```` ```mermaid ```` fence becomes a diagram (`caption="..."` in the fence
  adds a caption), and `<Tradeoffs>` records what a decision gave up.
- Spanish goes in `src/content/projects-es/<slug>.mdx`; without one, `/es/` serves the
  English page with a notice.

Diagrams render in the browser, and Mermaid is only downloaded on pages that have one. The
visual rules are in [`DESIGN.md`](DESIGN.md).

## Configuration

The public origin is defined **once**, as `SITE_URL` in
[`astro.config.mjs`](astro.config.mjs). Canonical URLs, `hreflang` alternates, the sitemap,
`robots.txt`, the RSS feed and every `og:` / `twitter:` tag derive from it. Moving to a custom
domain means editing that one line.

Site-wide details — name, role, contact email, social links — live in
[`src/consts.ts`](src/consts.ts).

### CV

The CV exists in English and Spanish and is offered from the contact menu on the home page.
Its source is plain HTML in [`cv/`](cv/); after editing it, regenerate both PDFs in
`public/cv/` with `node cv/render.mjs` (needs Playwright with Chromium) and commit them.

### Environment variables

All optional; the site builds and runs with every one of them unset, which is the default.
Copy [`.env.example`](.env.example) to `.env` to enable them locally. They are read at build
time, so the names must match exactly — there is no `PUBLIC_` prefix.

| Variable | Enables |
| :--- | :--- |
| `GTAG_MEASUREMENT_ID` | Google Analytics |

In CI it is supplied as a GitHub Actions secret; see the `env:` block in
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

## Deployment

Every push to `main` triggers [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml),
which builds the site on a runner and publishes `dist/` to GitHub Pages. The build output is
never committed — Pages is configured with **GitHub Actions** as its source, so the artifact
is served as-is and Astro's `_astro/` directory is not filtered by Jekyll.

## Licence

Source code released under the [MIT Licence](LICENCE). Site content — blog posts, project
write-ups and images — © Guillermo Sanchez.
