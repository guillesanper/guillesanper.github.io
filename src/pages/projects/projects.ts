import { GITHUB_URL } from "../../consts";
import { defaultLang, type Lang } from "../../i18n/ui";

export interface Project {
  name: string;
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
    name: 'Network Intrusion Detection Cascade',
    description:
      'Two-stage detector over CICIDS2017: an Isolation Forest tuned for recall filters benign traffic before XGBoost, or a neural network written from scratch in NumPy, names the attack. 0.95 F1-macro under a random split, which later work showed to be optimistic.',
    demoLink: `${GITHUB_URL}/Proyecto-Aprendizaje-Automatico`,
    postLink: '/2025-11-10-intrusion-detection-cascade/',
    tags: ['Python', 'XGBoost', 'NumPy'],
    i18n: {
      es: {
        name: 'Cascada de detección de intrusiones en red',
        description:
          'Detector en dos etapas sobre CICIDS2017: un Isolation Forest ajustado por recall filtra el tráfico benigno antes de que XGBoost, o una red neuronal escrita desde cero en NumPy, nombre el ataque. F1-macro de 0,95 con un split aleatorio, que el trabajo posterior demostró optimista.'
      }
    }
  },
  {
    name: 'FlappyBirdNEAT',
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
    name: 'Music Similarity Graphs',
    description:
      'Bachelor\'s thesis in progress: do differences between audio representations (MFCC, MERT) produce significantly different song-similarity graphs? Paired bootstrap evaluation against a random baseline, on a problem with no ground truth.',
    demoLink: `${GITHUB_URL}/music-similarity-ai`,
    tags: ['Python', 'PyTorch'],
    i18n: {
      es: {
        name: 'Grafos de similitud musical',
        description:
          'TFG en curso: ¿producen las diferencias entre representaciones de audio (MFCC, MERT) grafos de similitud entre canciones significativamente distintos? Evaluación con bootstrap pareado frente a un baseline aleatorio, sobre un problema sin verdad de referencia.'
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
