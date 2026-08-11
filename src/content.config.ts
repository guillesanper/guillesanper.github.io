import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders'; // Not available with legacy API

const postSchema = ({ image }: { image: any }) => z.object({
	title: z.string(),
	seoTitle: z.string().optional(),
	description: z.string(),
	// Transform string to Date object
	pubDate: z.coerce.date(),
	updatedDate: z.coerce.date().optional(),
	tags: z.array(z.string()).optional(),
	coverImage: image().optional()
});

const blog = defineCollection({
	// `!**/_*` keeps notes like _README.md out of the collection.
	loader: glob({ pattern: ["**/*.md", "!**/_*"], base: "./src/content/blog" }),
	schema: postSchema
});

// Spanish translations. An entry here overrides the English post with the same
// id; posts without a translation fall back to English (see getPostsFor in
// src/i18n/posts.ts).
const blogEs = defineCollection({
	// `!**/_*` keeps notes like _README.md out of the collection.
	loader: glob({ pattern: ["**/*.md", "!**/_*"], base: "./src/content/blog-es" }),
	schema: postSchema
});

export const collections = { blog, blogEs };
