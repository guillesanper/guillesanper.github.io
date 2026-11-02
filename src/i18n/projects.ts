import { getCollection, type CollectionEntry } from 'astro:content';
import { projects, localizeProjects, type Project } from '@src/pages/projects/projects';
import { defaultLang, type Lang } from './ui';

export type ProjectEntry = CollectionEntry<'projects'>;

/** A project page resolved for a language: card data plus the long-form entry. */
export type ResolvedProjectPage = {
	project: Project;
	entry: ProjectEntry;
	/** True when the reader asked for a language this page has no translation in. */
	isFallback: boolean;
};

/** Slugs that have a project page. The English collection decides, as for posts. */
export async function getProjectPageSlugs(): Promise<Set<string>> {
	const entries = await getCollection('projects');
	return new Set(entries.map((entry) => entry.id));
}

/** Every project page in `lang`, in the order of the projects list. */
export async function getProjectPagesFor(lang: Lang): Promise<ResolvedProjectPage[]> {
	const [english, translated] = await Promise.all([
		getCollection('projects'),
		lang === defaultLang ? Promise.resolve([]) : getCollection('projectsEs')
	]);
	const englishById = new Map(english.map((entry) => [entry.id, entry]));
	const translatedById = new Map(
		(translated as unknown as ProjectEntry[]).map((entry) => [entry.id, entry])
	);

	return localizeProjects(projects, lang).flatMap((project) => {
		const entry = englishById.get(project.slug);
		if (!entry) return [];
		const match = translatedById.get(project.slug);
		return [{ project, entry: match ?? entry, isFallback: !match && lang !== defaultLang }];
	});
}

/** Static paths for `/projects/[slug]/` in one language. */
export async function getProjectPathsFor(lang: Lang) {
	const pages = await getProjectPagesFor(lang);
	return pages.map((page) => ({ params: { slug: page.project.slug }, props: { page } }));
}
