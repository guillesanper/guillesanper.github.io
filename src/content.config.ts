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

// Project pages. Card data (name, summary, tags, links) stays in
// src/pages/projects/projects.ts; an entry here, keyed by the project's
// `slug`, adds the long-form page at /projects/<slug>/. `projectsEs` works
// like `blogEs`: a missing translation falls back to English.
const projectSchema = z.object({
	/** Mermaid source for the diagram at the top of the page. */
	diagram: z.string(),
	/** One or two sentences on how to read that diagram. */
	diagramCaption: z.string(),
	updatedDate: z.coerce.date()
});

const projects = defineCollection({
	loader: glob({ pattern: ["**/*.mdx", "!**/_*"], base: "./src/content/projects" }),
	schema: projectSchema
});

const projectsEs = defineCollection({
	loader: glob({ pattern: ["**/*.mdx", "!**/_*"], base: "./src/content/projects-es" }),
	schema: projectSchema
});

export const collections = { blog, blogEs, projects, projectsEs };
