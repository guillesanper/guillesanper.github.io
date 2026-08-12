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
    name: 'Network Intrusion Detection Cascade',
    description:
      'Two-stage detector over CICIDS2017: an Isolation Forest filters benign traffic before an XGBoost classifier and a NumPy neural network label the rest. 0.95 F1-macro at 41% of the single-model inference cost.',
    demoLink: `${GITHUB_URL}`,
    postLink: '/2025-11-10-intrusion-detection-cascade/',
    tags: ['Terraform', 'Python', 'Kubernetes', 'Google Cloud'],
    i18n: {
      es: {
        name: 'Cascada de detección de intrusiones en red',
        description:
          'Detector en dos etapas sobre CICIDS2017: un Isolation Forest filtra el tráfico benigno antes de que un clasificador XGBoost y una red neuronal en NumPy etiqueten el resto. F1-macro de 0,95 con un 41% del coste de inferencia de un modelo único.'
      }
    }
  },
  {
    name: 'Reactor Anomaly Alerting',
    description:
      'ML alert generation on top of a physics simulation of a pressurised water reactor. Regime-aware anomaly detection, with severity derived from proximity to safety limits rather than raw anomaly score.',
    demoLink: `${GITHUB_URL}`,
    postLink: '/2026-05-12-reactor-anomaly-alerts/',
    tags: ['Python', 'Terraform', 'Kubernetes', 'Google Cloud', 'Docker', 'Kafka', 'FastAPI'],
    i18n: {
      es: {
        name: 'Alertas de anomalías en un reactor',
        description:
          'Generación de alertas por ML sobre una simulación física de un reactor de agua a presión. Detección de anomalías consciente del régimen de operación, con una severidad derivada de la proximidad a los límites de seguridad y no de la puntuación bruta de anomalía.'
      }
    }
  },
  {
    name: 'Password Manager',
    description:
      'Self-hosted password and file manager where the server cannot read what it stores: the master password becomes keys in the browser via Argon2id and HKDF, and the server only ever holds an Argon2 verifier, a wrapped vault key and opaque AES-256-GCM blobs. Rotating the master password rewraps 32 bytes instead of re-encrypting the vault, and the security analysis that used to decrypt every entry server-side now runs client-side over a k-anonymity proxy.',
    demoLink: `${GITHUB_URL}`,
    postLink: '/2026-07-25-password-manager-zero-knowledge/',
    tags: ['Django', 'TypeScript', 'PostgreSQL', 'Redis', 'Docker', 'MinIO', 'Nginx'],
    i18n: {
      es: {
        name: 'Gestor de contraseñas',
        description:
          'Gestor de contraseñas y ficheros autoalojado donde el servidor no puede leer lo que almacena: la contraseña maestra se convierte en claves dentro del navegador mediante Argon2id y HKDF, y el servidor solo llega a guardar un verificador Argon2, una clave de bóveda envuelta y blobs opacos AES-256-GCM. Rotar la contraseña maestra reenvuelve 32 bytes en lugar de recifrar la bóveda, y el análisis de seguridad que antes descifraba cada entrada en el servidor ahora se ejecuta en el cliente sobre un proxy de k-anonimato.'
      }
    }
  },
  {
    name: 'DataMap',
    description:
      'Data migration platform that introspects PostgreSQL, MySQL, SQL Server and Oracle schemas, maps tables and columns through a graph UI, and generates the corresponding INSERT INTO ... SELECT scripts. Migration order comes from a topological sort over the foreign-key graph that fails explicitly on circular dependencies, and schema entities are keyed by SHA-256 hash so a renamed source table errors out instead of producing silently wrong SQL.',
    demoLink: `${GITHUB_URL}`,
    postLink: '/2026-03-08-encrypted-database-connectors/',
    tags: ['FastAPI', 'TypeScript', 'Docker', 'Redis', 'PostgreSQL'],
    i18n: {
      es: {
        description:
          'Plataforma de migración de datos que inspecciona esquemas de PostgreSQL, MySQL, SQL Server y Oracle, mapea tablas y columnas mediante una interfaz de grafo, y genera los scripts INSERT INTO ... SELECT correspondientes. El orden de migración sale de un orden topológico sobre el grafo de claves foráneas que falla de forma explícita ante dependencias circulares, y las entidades del esquema se identifican por hash SHA-256, de modo que una tabla de origen renombrada da error en lugar de producir SQL silenciosamente incorrecto.'
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
