// Place any global data in this file.
// You can import this data from anywhere in your site by using the `import` keyword.

export const SITE_TITLE = 'Guillermo Sanchez';

// The tagline and the meta description are translated: see `site.tagline` and
// `site.description` in src/i18n/ui.ts.

export const AUTHOR_NAME = 'Guillermo Sanchez';
export const AUTHOR_ROLE = 'Software Engineer · Platform & ML';

export const GITHUB_USER = 'guillesanper';
export const GITHUB_URL = `https://github.com/${GITHUB_USER}`;
export const LINKEDIN_URL = 'https://www.linkedin.com/in/guillermo-sanchez-perez-a405613a5/'; // optional
export const CONTACT_EMAIL = 'guilsa06@ucm.es';
// One PDF per language, served from public/ and built from cv/ (see cv/render.mjs).
export const CV_PATHS = {
	en: '/cv/guillermo-sanchez-cv-en.pdf',
	es: '/cv/guillermo-sanchez-cv-es.pdf'
} as const;
