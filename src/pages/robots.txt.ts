import type { APIRoute } from 'astro';

/**
 * Generated rather than kept in `public/` so the sitemap URL always tracks
 * `site` in astro.config.mjs instead of being a second copy of the domain that
 * can silently go stale.
 */
export const GET: APIRoute = ({ site }) => {
	const body = [
		'User-agent: *',
		'Allow: /',
		'',
		`Sitemap: ${new URL('sitemap-index.xml', site).toString()}`,
		''
	].join('\n');

	return new Response(body, {
		headers: { 'Content-Type': 'text/plain; charset=utf-8' }
	});
};
