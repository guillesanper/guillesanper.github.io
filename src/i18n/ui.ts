// Every user-facing string on the site lives here, keyed by language.
// `en` is the source of truth: it defines the key set, and any key missing
// from another language falls back to it (see `useTranslations` in ./utils).

export const languages = {
	en: 'English',
	es: 'Español'
} as const;

export const defaultLang = 'en';

export type Lang = keyof typeof languages;

/** Every language the site ships, in display order. */
export const allLangs = Object.keys(languages) as Lang[];

/** Short label shown in the header language selector. */
export const langShortLabel: Record<Lang, string> = {
	en: 'EN',
	es: 'ES'
};

/** BCP 47 tag used for <html lang>, dates and hreflang. */
export const langLocale: Record<Lang, string> = {
	en: 'en',
	es: 'es'
};

/** Open Graph wants `language_TERRITORY`, not the bare BCP 47 tag. */
export const ogLocale: Record<Lang, string> = {
	en: 'en_US',
	es: 'es_ES'
};

export const ui = {
	en: {
		'site.tagline': 'Infrastructure, ML and secure systems',
		'site.description':
			'Guillermo Sanchez - final-year Software Engineering student in Madrid. Notes on infrastructure, machine learning systems and building security into software rather than bolting it on.',
		/** Alt text for the social preview image. */
		'seo.imageAlt': 'Guillermo Sanchez',

		'nav.home': 'Home',
		'nav.about': 'About',
		'nav.posts': 'Posts',
		'nav.projects': 'Projects',
		'nav.tags': 'Tags',

		'header.github': 'Github logo',
		'header.theme': 'Theme mode',
		'header.language': 'Change language',

		'footer.contact': 'Contact',
		'footer.github': 'GitHub',

		'home.intro1':
			"Final-year Software Engineering student in Madrid. I build ML systems, infrastructure tooling, and applications where the security model is decided before the first line of code - not added afterwards.",
		'home.intro2':
			'Currently looking for software engineering roles on security products, backend or infrastructure.',
		'home.moreAboutMe': 'More about me',
		'home.recentPosts': 'Recent Posts',
		'home.myProjects': 'My Projects',
		'home.allPosts': 'All posts',
		'home.allProjects': 'All projects',
		'home.ctaContact': 'Contact me',
		'contact.menu': 'Contact options',
		'contact.copy': 'Copy address',
		'contact.copied': 'Copied!',
		'contact.compose': 'Open mail app',
		'contact.linkedin': 'LinkedIn',
		'contact.cv': 'CV',
		'contact.cvMenu': 'CV language',
		'home.ctaGithub': 'GitHub',

		'about.seoTitle': 'About Me',
		'about.seoDescription':
			'Guillermo Sanchez - final-year Software Engineering student in Madrid, building infrastructure, ML systems and security-integrated software.',
		'about.heading': 'About me',
		'about.p1':
			"I'm a final-year Software Engineering student in Madrid. I work mainly in Java, C++ and Python, on top of Linux, Docker, CI pipelines and Google Cloud. I'm currently finishing my bachelor's thesis on music similarity with Siamese networks. Security isn't part of my degree, but I've learned it on my own because almost everything I build ends up needing it. I start from how a system can fail, and afterwards I measure whether it did, even when that means correcting my own conclusions. I'm looking for a software engineering role building security products, backend or infrastructure systems that run in production.",
		'about.workHeading': 'What I work with',
		'about.workBody':
			"I choose the tool for the part of the problem I'm worried about. Python for anything ML — NumPy, scikit-learn, XGBoost, pandas — with FastAPI when a model has to sit behind an endpoint; I implement neural networks by hand in NumPy when I need to understand exactly what the gradients are doing, and use a framework when I don't. TypeScript and React when the complexity lives in the browser, Django or Node when it lives in an API over data, Java and Spring when a stricter type system earns its keep, C++ when the cost per operation is what matters. Underneath all of it: Linux, Docker, CI pipelines, SQL and the connector layer around it, deployed on Google Cloud.",
		'about.approachHeading': 'How I approach a problem',
		'about.approachBody':
			'I start from the failure modes. In the intrusion detection cascade, that meant weighing the cost of a false negative against that of a false positive and letting the answer drive the architecture, rather than optimising for accuracy on a benchmark. In the password manager, it meant assuming the database was already compromised, recognising that the initial design did not survive that assumption, and moving key derivation into the browser so that it did. The other half is measuring afterwards: in the intrusion detector, it was a control experiment, not intuition, that showed which of my own published numbers had been answering the wrong question.',
		'about.learningHeading': "What I'm learning now",
		'about.learningBody':
			'Infrastructure as code, Kubernetes and the operational side of running ML systems rather than only training them — observability, reproducible builds, and how a pipeline behaves at 3am when nobody is watching it. I document the parts I had to work out myself on the',
		'about.learningBlogLink': 'blog',

		'posts.title': 'All posts',
		'posts.description':
			'Write-ups on the systems I build: machine learning pipelines, applied cryptography, and infrastructure.',
		'posts.searchLabel': 'Search posts',
		'posts.searchPlaceholder': 'Search by title, description or tag…',
		'posts.searchClear': 'Clear search',
		'posts.showingCount': 'Showing {count} of {total} posts',
		'posts.noResults': 'No posts match “{query}”.',

		'projects.title': 'Projects',
		'projects.description':
			'Things I have built end to end. Each one has a write-up on the decisions behind it.',
		'projects.article': 'Article',
		'projects.demo': 'Demo',
		'project.back': 'All projects',
		'project.source': 'Source code',
		'project.article': 'Related article',
		'project.considered': 'Considered instead',
		'project.cost': 'What it costs',
		'project.onlyInEnglish': 'This project page is only available in English.',
		'project.details': 'How it works',

		'tags.title': 'All Tags',
		'tags.description':
			'Post tags: concise keywords categorizing content for easy navigation and improved searchability',
		'tags.taggedWith': 'All Posts Tagged with {tag}',
		/** Kept distinct from the heading: a meta description that merely repeats
		    the <h1> is dead weight, and every tag page would look alike. */
		'tags.metaDescription':
			'Every post tagged {tag}: notes on infrastructure, machine learning systems and secure software design.',

		'post.updatedOn': 'Updated on',
		'post.publishedOn': 'Published on',
		'post.onlyInEnglish': 'This post is only available in English.',
		'post.readingTime': '{minutes} min read',
		'post.featured': 'Latest',

		'toc.onThisPage': 'On This Page',

		'author.heading': 'About the Author',
		'author.bio1':
			'Guillermo is a final-year Software Engineering student in Madrid. He builds ML systems, infrastructure tooling and applications where the security model is decided before the first line of code.',
		'author.bio2':
			'He is looking for software engineering roles on security products, backend or infrastructure. Reach him at',

		'notFound.seoTitle': '404 Page Not Found',
		'notFound.seoDescription': '404 Page Not Found',
		'notFound.heading': 'Page Not Found',
		'notFound.body':
			"The page you're looking for is either moved or no longer exists. Please contact the site owner that linked you to the original URL and let them know their link is broken.",
		'notFound.imageAlt': '404 Page Not Found'
	},
	es: {
		'site.tagline': 'Infraestructura, ML y sistemas seguros',
		'site.description':
			'Guillermo Sanchez - estudiante de último año de Ingeniería del Software en Madrid. Notas sobre infraestructura, sistemas de machine learning y cómo integrar la seguridad en el software en lugar de añadirla al final.',
		'seo.imageAlt': 'Guillermo Sanchez',

		'nav.home': 'Inicio',
		'nav.about': 'Sobre mí',
		'nav.posts': 'Artículos',
		'nav.projects': 'Proyectos',
		'nav.tags': 'Etiquetas',

		'header.github': 'Logo de Github',
		'header.theme': 'Modo de color',
		'header.language': 'Cambiar de idioma',

		'footer.contact': 'Contacto',
		'footer.github': 'GitHub',

		'home.intro1':
			'Estudiante de último año de Ingeniería del Software en Madrid. Construyo sistemas de ML, herramientas de infraestructura y aplicaciones donde el modelo de seguridad se decide antes de la primera línea de código, no se añade después.',
		'home.intro2':
			'Actualmente busco puestos de ingeniería de software en productos de seguridad, backend o infraestructura.',
		'home.moreAboutMe': 'Más sobre mí',
		'home.recentPosts': 'Artículos recientes',
		'home.myProjects': 'Mis proyectos',
		'home.allPosts': 'Todos los artículos',
		'home.allProjects': 'Todos los proyectos',
		'home.ctaContact': 'Contáctame',
		'contact.menu': 'Opciones de contacto',
		'contact.copy': 'Copiar dirección',
		'contact.copied': '¡Copiado!',
		'contact.compose': 'Abrir app de correo',
		'contact.linkedin': 'LinkedIn',
		'contact.cv': 'Currículum',
		'contact.cvMenu': 'Idioma del currículum',
		'home.ctaGithub': 'GitHub',

		'about.seoTitle': 'Sobre mí',
		'about.seoDescription':
			'Guillermo Sanchez - estudiante de último año de Ingeniería del Software en Madrid. Construyo infraestructura, sistemas de ML y software con la seguridad integrada.',
		'about.heading': 'Sobre mí',
		'about.p1':
			'Soy estudiante de último año de Ingeniería del Software en Madrid. Trabajo sobre todo con Java, C++ y Python, sobre Linux, Docker, pipelines de CI y Google Cloud. Ahora mismo estoy terminando mi TFG sobre similitud musical con redes siamesas. La seguridad no forma parte de mi carrera, pero la he aprendido por mi cuenta porque casi todo lo que construyo acaba necesitándola. Empiezo por cómo puede fallar un sistema y después mido si lo hace, aunque eso suponga corregir mis propias conclusiones. Busco un puesto de ingeniería de software construyendo productos de seguridad, backend o sistemas de infraestructura en producción.',
		'about.workHeading': 'Con qué trabajo',
		'about.workBody':
			'Elijo la herramienta según la parte del problema que me preocupa. Python para todo lo de ML — NumPy, scikit-learn, XGBoost, pandas — con FastAPI cuando un modelo tiene que quedar detrás de un endpoint; implemento redes neuronales a mano en NumPy cuando necesito entender exactamente qué están haciendo los gradientes, y recurro a un framework cuando no. TypeScript y React cuando la complejidad está en el navegador, Django o Node cuando está en una API sobre datos, Java y Spring cuando compensa un sistema de tipos más estricto, C++ cuando lo que importa es el coste por operación. Debajo de todo: Linux, Docker, pipelines de CI, SQL y la capa de conectores que lo rodea, desplegado en Google Cloud.',
		'about.approachHeading': 'Cómo abordo un problema',
		'about.approachBody':
			'Empiezo por los modos de fallo. En la cascada de detección de intrusiones eso significó sopesar el coste de un falso negativo frente al de un falso positivo y dejar que esa respuesta guiara la arquitectura, en lugar de optimizar la precisión sobre un benchmark. En el gestor de contraseñas significó asumir que la base de datos ya estaba comprometida, reconocer que el diseño inicial no sobrevivía a esa suposición y mover la derivación de claves al navegador para que sí lo hiciera. La otra mitad es medir después: en el detector de intrusiones fue un experimento de control, no la intuición, lo que mostró cuáles de mis propias cifras publicadas respondían a la pregunta equivocada.',
		'about.learningHeading': 'Qué estoy aprendiendo ahora',
		'about.learningBody':
			'Infraestructura como código, Kubernetes y el lado operativo de ejecutar sistemas de ML en lugar de solo entrenarlos — observabilidad, builds reproducibles y cómo se comporta un pipeline a las 3 de la mañana cuando nadie lo está mirando. Documento las partes que tuve que resolver yo mismo en el',
		'about.learningBlogLink': 'blog',

		'posts.title': 'Todos los artículos',
		'posts.description':
			'Artículos sobre los sistemas que construyo: pipelines de machine learning, criptografía aplicada e infraestructura.',
		'posts.searchLabel': 'Buscar artículos',
		'posts.searchPlaceholder': 'Busca por título, descripción o etiqueta…',
		'posts.searchClear': 'Borrar búsqueda',
		'posts.showingCount': 'Mostrando {count} de {total} artículos',
		'posts.noResults': 'Ningún artículo coincide con «{query}».',

		'projects.title': 'Proyectos',
		'projects.description':
			'Cosas que he construido de principio a fin. Cada una tiene un artículo con las decisiones que hay detrás.',
		'projects.article': 'Artículo',
		'projects.demo': 'Demo',
		'project.back': 'Todos los proyectos',
		'project.source': 'Código fuente',
		'project.article': 'Artículo relacionado',
		'project.considered': 'Alternativa descartada',
		'project.cost': 'Lo que cuesta',
		'project.onlyInEnglish': 'La página de este proyecto solo está disponible en inglés.',
		'project.details': 'Cómo funciona',

		'tags.title': 'Todas las etiquetas',
		'tags.description':
			'Etiquetas de los artículos: palabras clave que categorizan el contenido para navegar y buscar con facilidad.',
		'tags.taggedWith': 'Todos los artículos etiquetados con {tag}',
		'tags.metaDescription':
			'Todos los artículos etiquetados con {tag}: notas sobre infraestructura, sistemas de machine learning y diseño de software seguro.',

		'post.updatedOn': 'Actualizado el',
		'post.publishedOn': 'Publicado el',
		'post.onlyInEnglish': 'Este artículo solo está disponible en inglés.',
		'post.readingTime': '{minutes} min de lectura',
		'post.featured': 'Lo último',

		'toc.onThisPage': 'En esta página',

		'author.heading': 'Sobre el autor',
		'author.bio1':
			'Guillermo es estudiante de último año de Ingeniería del Software en Madrid. Construye sistemas de ML, herramientas de infraestructura y aplicaciones donde el modelo de seguridad se decide antes de la primera línea de código.',
		'author.bio2':
			'Busca puestos de ingeniería de software en productos de seguridad, backend o infraestructura. Puedes escribirle a',

		'notFound.seoTitle': '404 Página no encontrada',
		'notFound.seoDescription': '404 Página no encontrada',
		'notFound.heading': 'Página no encontrada',
		'notFound.body':
			'La página que buscas se ha movido o ya no existe. Ponte en contacto con quien te enlazó a la URL original y avísale de que su enlace está roto.',
		'notFound.imageAlt': '404 Página no encontrada'
	}
} as const satisfies Record<Lang, Record<string, string>>;

export type UIKey = keyof (typeof ui)[typeof defaultLang];

/**
 * Display labels for post tags. Tag *slugs* stay English so URLs are stable
 * across languages; only what the reader sees is translated. Tags missing here
 * render as-is (proper nouns like Python or Django need no translation).
 */
export const tagLabels: Record<Lang, Record<string, string>> = {
	en: {},
	es: {
		Security: 'Seguridad',
		Databases: 'Bases de datos',
		Architecture: 'Arquitectura',
		Simulation: 'Simulación',
		Career: 'Carrera profesional',
		Engineering: 'Ingeniería',
		Cryptography: 'Criptografía'
	}
};
