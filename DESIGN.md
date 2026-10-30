# Design

The site reads as a careful engineer's notebook: quiet neutrals, one accent, and
structure that carries information. These are the rules new pages follow. The
tokens live in `src/styles/global.css` and `tailwind.config.mjs`.

## Color

| Token | Light | Dark | Role |
| :--- | :--- | :--- | :--- |
| Background | `white` | `zinc-900` | Page |
| Text | `zinc-950` | `zinc-100` | Body and headings |
| Secondary text | `zinc-600` | `zinc-300`/`400` | Ledes, captions, meta |
| Border | `zinc-200` | `zinc-700` | Cards, figure frames, dividers |
| `--accent` | `emerald-600` | `emerald-400` | Focus ring, hover underlines, selection, and in diagrams the secrets that never leave the user |
| `--diagram-*` | zinc scale | zinc scale | Diagram surface, nodes, lines and text. Plain hex only: Mermaid parses them |

The accent is never decoration. If it appears, it means something.
Technology pills are the one exception: each uses its brand color (`TechPill.astro`).

## Typography

- One family: IBM Plex Sans (400, 500, 600, 700).
- Page title `text-3xl`/`sm:text-4xl` bold; section `h2` and `h3` come from `Prose.astro`.
- Ledes `text-lg`, at most 62ch. Captions `text-sm`, at most 65ch.
- Labels in sentence case. No all-caps eyebrows.

## Layout and spacing

- Content width 1024px (`container`), 16px gutter on mobile.
- Long-form pages: content column plus a 240–280px sticky table of contents from `lg`.
- Tailwind's 4px scale; sections are separated by `mt-12` to `mt-20`.

## Shape

- Radius `rounded-xl` for cards and figures, `rounded-full` for pills.
- No shadows. Depth comes from borders and surface tone.

## Components

- **Project card** (`ProjectList.astro`): the whole card opens the project page through a
  stretched link on the title. The article and repository links sit above it.
- **Diagram** (`Diagram.astro` and ```` ```mermaid ```` fences): the lead diagram is the one
  bold element on a project page, drawn on a dotted drafting surface. Below 640px,
  left-to-right flowcharts stack top to bottom and scale to fit. Sequence diagrams keep their
  size and scroll.
- **Tradeoffs** (`Tradeoffs.astro`): under each design decision, two columns, "Considered
  instead" and "What it costs", separated from the text by a hairline.
- **Arrow link** (`.arrow-link`): secondary navigation; the arrow nudges toward where it goes.

## Motion

One entrance on the home hero (`.rise`). Elsewhere, motion only answers the reader: hover
nudges, the theme switch. Everything respects `prefers-reduced-motion`.
