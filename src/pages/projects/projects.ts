import { GITHUB_URL } from "../../consts";
import { defaultLang, type Lang } from "../../i18n/ui";

export interface Project {
  name: string;
  /** URL segment of the project page, `/projects/<slug>/`. The page exists
   *  only once src/content/projects/<slug>.mdx does. */
  slug: string;
  demoLink: string;
  tags?: string[],
  description?: string;
  postLink?: string;
  demoLinkRel?: string;
  /** Per-language overrides for the reader-facing fields. */
  i18n?: Partial<Record<Lang, { name?: string; description?: string }>>;
  [key: string]: any;
}

export const projects: Project[] = [
  {
    name: 'Sentinel',
    slug: 'sentinel',
    description:
      'Intrusion detection platform on GKE with two tracks: log events and CICIDS2017 network flows through an Isolation Forest → XGBoost cascade. Terraform modules for VPC, IAM and the cluster, kustomize overlays, default-deny network policies, and training as Kubernetes Jobs. The flow track is where a chronological split exposed two of my own published numbers as wrong.',
    demoLink: `${GITHUB_URL}/sentinel-platform`,
    postLink: '/2026-08-10-temporal-split-measures-something-else/',
    tags: ['Python', 'Terraform', 'Kubernetes', 'Google Cloud', 'FastAPI', 'Docker'],
    i18n: {
      es: {
        description:
          'Plataforma de detección de intrusiones sobre GKE con dos tracks: eventos de log y flujos de red de CICIDS2017 a través de una cascada Isolation Forest → XGBoost. Módulos de Terraform para VPC, IAM y el clúster, overlays de kustomize, network policies con denegación por defecto y entrenamiento como Jobs de Kubernetes. El track de flujos es donde un split cronológico demostró que dos de mis propias cifras publicadas estaban mal.'
      }
    }
  },
  {
    name: 'Password Manager',
    slug: 'password-manager',
    description:
      'Self-hosted password and file manager where the server cannot read what it stores. The master password becomes keys in the browser (Argon2id + HKDF), the server holds only a verifier and AES-256-GCM blobs bound to their row, and rotating the password rewraps 32 bytes instead of re-encrypting the vault.',
    demoLink: `${GITHUB_URL}/django-password-manager`,
    postLink: '/2026-07-25-password-manager-zero-knowledge/',
    tags: ['Django', 'TypeScript', 'PostgreSQL', 'Redis', 'Docker', 'MinIO', 'Nginx'],
    i18n: {
      es: {
        name: 'Gestor de contraseñas',
        description:
          'Gestor de contraseñas y ficheros autoalojado donde el servidor no puede leer lo que almacena. La contraseña maestra se convierte en claves dentro del navegador (Argon2id + HKDF), el servidor solo guarda un verificador y blobs AES-256-GCM ligados a su fila, y rotar la contraseña reenvuelve 32 bytes en lugar de recifrar la bóveda.'
      }
    }
  },
  {
    name: 'DataMap',
    slug: 'datamap',
    description:
      'Data migration platform that introspects PostgreSQL, MySQL, SQL Server and Oracle schemas through their catalogs, maps tables and columns in a graph UI, and generates INSERT INTO ... SELECT scripts. Migration order comes from a topological sort over the foreign-key graph that fails explicitly on cycles.',
    demoLink: `${GITHUB_URL}/datamaper-migration-assistant`,
    postLink: '/2026-03-08-encrypted-database-connectors/',
    tags: ['FastAPI', 'TypeScript', 'Docker', 'Redis', 'PostgreSQL'],
    i18n: {
      es: {
        description:
          'Plataforma de migración de datos que inspecciona esquemas de PostgreSQL, MySQL, SQL Server y Oracle a través de sus catálogos, mapea tablas y columnas en una interfaz de grafo y genera scripts INSERT INTO ... SELECT. El orden de migración sale de un orden topológico sobre el grafo de claves foráneas que falla de forma explícita ante ciclos.'
      }
    }
  },
  {
    name: 'ReactorGuard',
    slug: 'reactorguard',
    description:
      'Anomaly detection for a simulated pressurised water reactor. An energy-conserving point-kinetics model generates labelled process and instrument faults, and sensor-fault detectors run on a Kafka stream. GKE and Kafka are defined in Terraform and Strimzi. The ML alerting layer is the next phase.',
    demoLink: `${GITHUB_URL}/ReactorGuard`,
    postLink: '/2026-05-12-reactor-anomaly-alerts/',
    tags: ['Python', 'Kafka', 'Kubernetes', 'Terraform', 'Google Cloud', 'Docker'],
    i18n: {
      es: {
        description:
          'Detección de anomalías para un reactor de agua a presión simulado. Un modelo de cinética puntual que conserva la energía genera fallos de proceso y de instrumento etiquetados, y los detectores de fallos de sensor corren sobre un stream de Kafka. GKE y Kafka están definidos con Terraform y Strimzi. La capa de alertas por ML es la siguiente fase.'
      }
    }
  },
  {
    name: 'FlappyBirdNEAT',
    slug: 'flappybird-neat',
    description:
      'Neuroevolution lab in Java with no ML libraries: a fixed-topology genetic algorithm and full NEAT, compared across 30 paired seeds with corrected statistics. NEAT solves 26/30 runs against 20/30 for the best GA, and training gives bit-identical results on 1 or 8 threads.',
    demoLink: `${GITHUB_URL}/FlappyBirdNeat`,
    tags: ['Java', 'JavaFX'],
    i18n: {
      es: {
        description:
          'Laboratorio de neuroevolución en Java sin librerías de ML: un algoritmo genético de topología fija y NEAT completo, comparados sobre 30 semillas pareadas con estadística corregida. NEAT resuelve 26 de 30 ejecuciones frente a 20 de 30 del mejor GA, y el entrenamiento da resultados idénticos bit a bit con 1 u 8 hilos.'
      }
    }
  },
  {
    name: 'Music Similarity with Siamese Networks',
    slug: 'music-similarity',
    description:
      'Bachelor\'s thesis in progress, in a team of two. Siamese networks trained with contrastive and triplet losses learn song embeddings from log-mel spectrograms, MERT embeddings and acoustic descriptors, and are compared against classical classifiers, MFCC and MERT. The resulting similarity graphs are evaluated on FMA and MagnaTagATune with Recall@K, MAP and nDCG, using paired bootstrap confidence intervals with Holm correction.',
    demoLink: `${GITHUB_URL}/music-similarity-ai`,
    tags: ['Python', 'PyTorch'],
    i18n: {
      es: {
        name: 'Similitud musical con redes siamesas',
        description:
          'TFG en curso, en equipo de dos. Redes siamesas entrenadas con pérdida contrastiva y triplet aprenden embeddings de canciones a partir de espectrogramas log-mel, embeddings de MERT y descriptores acústicos, y se comparan con clasificadores clásicos, MFCC y MERT. Los grafos de similitud resultantes se evalúan en FMA y MagnaTagATune con Recall@K, MAP y nDCG, con intervalos de confianza por bootstrap pareado y corrección de Holm.'
      }
    }
  }
]

/**
 * Resolves each project's reader-facing fields for `lang`, falling back to the
 * default language. Returns plain `Project` objects so `ProjectList` needs no
 * knowledge of translations.
 */
export function localizeProjects(items: Project[], lang: Lang): Project[] {
  if (lang === defaultLang) return items;
  return items.map(({ i18n, ...project }) => {
    const overrides = i18n?.[lang] ?? {};
    return {
      ...project,
      name: overrides.name ?? project.name,
      description: overrides.description ?? project.description
    };
  });
}
