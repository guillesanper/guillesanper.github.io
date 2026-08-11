import { ui, defaultLang, languages, tagLabels, type Lang, type UIKey } from './ui';

const isLang = (value: string): value is Lang => value in languages;

/** Reads the active language from the first path segment (`/es/about/` -> `es`). */
export function getLangFromUrl(url: URL): Lang {
	const first = url.pathname.split('/').filter(Boolean)[0];
	return first && isLang(first) ? first : defaultLang;
}

/**
 * Returns a translator for `lang`. Missing keys fall back to the default
 * language, and `{placeholders}` are replaced from `vars`.
 */
export function useTranslations(lang: Lang) {
	return function t(key: UIKey, vars?: Record<string, string | number>): string {
		const dict = ui[lang] as Record<string, string>;
		let value = dict[key] ?? (ui[defaultLang] as Record<string, string>)[key] ?? key;
		if (vars) {
			for (const [name, replacement] of Object.entries(vars)) {
				value = value.replaceAll(`{${name}}`, String(replacement));
			}
		}
		return value;
	};
}

/**
 * Drops the language prefix from a pathname. Keeps the trailing slash the site
 * uses for pages, but not for files like `/rss.xml`.
 */
export function stripLang(pathname: string): string {
	const segments = pathname.split('/').filter(Boolean);
	if (segments.length && isLang(segments[0])) segments.shift();
	if (!segments.length) return '/';
	const isFile = segments[segments.length - 1].includes('.');
	return '/' + segments.join('/') + (isFile ? '' : '/');
}

/** Rewrites a path so it points at the `lang` version of the same page. */
export function localizePath(path: string, lang: Lang): string {
	const base = stripLang(path);
	return lang === defaultLang ? base : `/${lang}${base === '/' ? '/' : base}`;
}

/** The equivalent of the current page in another language. */
export function alternatePath(url: URL, lang: Lang): string {
	return localizePath(url.pathname, lang);
}

/**
 * Visible label for a post tag. Slugs stay English so URLs match across
 * languages; only the label the reader sees is translated.
 */
export function translateTag(tag: string, lang: Lang): string {
	return tagLabels[lang]?.[tag] ?? tag;
}
