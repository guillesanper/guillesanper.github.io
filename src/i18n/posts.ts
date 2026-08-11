import { getCollection, type CollectionEntry } from 'astro:content';
import { defaultLang, type Lang } from './ui';

export type BlogPost = CollectionEntry<'blog'>;

/** A post resolved for a language, plus whether it fell back to English. */
export type ResolvedPost = {
	/** Always the English id: it is what the URL slug is built from. */
	id: string;
	entry: BlogPost;
	/** True when the reader asked for a language this post has no translation in. */
	isFallback: boolean;
};

/**
 * The `blog` collection is the source of truth for which posts exist and for
 * their URLs. `blogEs` holds translations keyed by the same id; anything without
 * a translation is served in English.
 */
async function translationsFor(lang: Lang): Promise<Map<string, BlogPost>> {
	if (lang === defaultLang) return new Map();
	const entries = (await getCollection('blogEs')) as unknown as BlogPost[];
	return new Map(entries.map((entry) => [entry.id, entry]));
}

/** Every post in `lang`, newest first, falling back to English where needed. */
export async function getPostsFor(lang: Lang): Promise<ResolvedPost[]> {
	const [english, translated] = await Promise.all([getCollection('blog'), translationsFor(lang)]);
	return (english as BlogPost[])
		.map((entry) => {
			const match = translated.get(entry.id);
			return { id: entry.id, entry: match ?? entry, isFallback: !match && lang !== defaultLang };
		})
		.sort((a, b) => b.entry.data.pubDate.valueOf() - a.entry.data.pubDate.valueOf());
}

/** A single post by id, resolved for `lang`. */
export async function getPostFor(id: string, lang: Lang): Promise<ResolvedPost | undefined> {
	const posts = await getPostsFor(lang);
	return posts.find((post) => post.id === id);
}

/** Convenience for components that only need the entries. */
export const entriesOf = (posts: ResolvedPost[]): BlogPost[] => posts.map((post) => post.entry);
