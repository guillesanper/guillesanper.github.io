/**
 * Shared SEO types.
 *
 * Kept in a plain module rather than exported from BaseHead.astro: BaseHead
 * renders StructuredData, so a type living there would make the two `.astro`
 * files import each other and Vite fails to resolve the cycle at runtime.
 */

/** Post metadata that turns a page into an `og:type=article`. */
export interface ArticleMeta {
	publishedTime: Date;
	modifiedTime?: Date;
	tags?: string[];
}
