# Iconos de tecnología

Cada archivo `<slug>.astro` es un componente que hace spread de `{...Astro.props}`
sobre un `<svg>`, para que `TechPill` pueda pasarle `width`/`height`/`stroke-width`.

Los archivos marcados como PLACEHOLDER en su frontmatter son provisionales: un
cuadrado redondeado neutro. Para sustituirlos por el logo oficial:

1. Descarga el SVG (simple-icons, el press kit de la marca, etc.).
2. Pega el contenido conservando `{...Astro.props}` en el `<svg>` raíz y un
   `viewBox` correcto.
3. Quita `width`/`height` fijos del SVG original — los inyecta `TechPill`.
4. Deja los `fill` de marca tal cual si el logo es multicolor (como `react.astro`),
   o pon `fill="currentColor"` si es monocromo y quieres que herede el color de la
   píldora.
5. Borra la línea `// PLACEHOLDER` del frontmatter.

El color de la píldora se define aparte, en el registro `TECH` de
`src/components/TechPill.astro`.
