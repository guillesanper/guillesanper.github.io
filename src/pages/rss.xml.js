import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { SITE_TITLE } from '../consts';
import { ui, defaultLang } from '../i18n/ui';

// The feed carries the English posts; translations are reachable from the site.
export async function GET(context) {
	const posts = await getCollection('blog');
	return rss({
		title: SITE_TITLE,
		description: ui[defaultLang]['site.description'],
		site: context.site,
		items: posts.map((post) => ({
			...post.data,
			link: `/${post.id}/`,
		})),
	});
}
