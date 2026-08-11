# Traducciones al español

Este directorio contiene las versiones en español de los posts de `src/content/blog/`.
El prefijo `_` de este fichero hace que el loader de Astro lo ignore.

**La regla es una sola:** el fichero traducido debe vivir en la misma ruta relativa que el
original. Por ejemplo, la traducción de

```
src/content/blog/2026-07-25-password-manager-zero-knowledge/index.md
```

va en

```
src/content/blog-es/2026-07-25-password-manager-zero-knowledge/index.md
```

Copia el frontmatter del original y traduce `title`, `description` y `seoTitle`. Deja `pubDate`,
`updatedDate` y `tags` **idénticos** al original: `pubDate` mantiene el orden cronológico entre
idiomas, y los `tags` se traducen solos al mostrarlos desde `tagLabels` en `src/i18n/ui.ts` — si
los cambias aquí, romperás las URLs de `/es/tags/…`.

Los posts que todavía no estén traducidos se sirven en inglés bajo `/es/`, con un aviso encima
del artículo. No hay que tocar código para publicar una traducción: basta con añadir el fichero.
