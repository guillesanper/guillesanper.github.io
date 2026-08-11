import { getCollection } from 'astro:content';
import { slugify } from '@src/utils';
import { getPostsFor, type BlogPost, type ResolvedPost } from './posts';
import type { Lang } from './ui';

/**
 * Tag routes. Slugs come from the English `blog` collection so a tag URL points
 * at the same tag in every language; both `/tags/[tag]/` and `/es/tags/[tag]/`
 * use this.
 */
export async function getTagPaths() {
	const allPosts = (await getCollection('blog')) as BlogPost[];
	const tags = new Set(
		allPosts
			.flatMap((post) => post.data.tags ?? [])
			.filter(Boolean)
			.map((tag) => slugify(tag))
	);
	return [...tags].map((tag) => ({ params: { tag } }));
}

/**
 * Post routes for one language. Ids come from the English collection, so every
 * post exists under both `/` and `/es/`; the entry passed through is the
 * translation when there is one (see getPostsFor).
 */
export async function getPostPathsFor(lang: Lang) {
	const posts = await getPostsFor(lang);
	return posts.map((post: ResolvedPost) => ({
		params: { slug: post.id },
		props: { post }
	}));
}
