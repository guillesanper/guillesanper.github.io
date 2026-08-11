---
title: 'Tu split temporal probablemente mide otra cosa'
description: 'Cambiar una sola clave de agrupación movió el F1-macro de un detector de intrusiones de 0.2809 a 0.7721, sin tocar la garantía cronológica ni el modelo. Esta es la anatomía de un resultado publicado que era falso por un factor de ~4.'
tags: ["Machine Learning", "Security", "Python"]
pubDate: '2026-08-10'
coverImage: './cover.jpg'
---

Un corte cronológico no es anti-fuga por ser cronológico. Lo es respecto a la **unidad** sobre la
que corta. Si esa unidad agrega procesos que ocurrieron en serie, el corte deja de separar "antes"
de "después" dentro de un escenario y pasa a separar **un proceso de otro** — se convierte en un
holdout de esos procesos, y no avisa.

Este artículo mide cuánto cuesta esa confusión en un caso concreto: la cifra titular de un track de
detección de intrusiones se movió de 0.2809 a 0.7721 de F1-macro al cambiar una sola clave de
agrupación, sin tocar ni la garantía cronológica ni el modelo. El resultado publicado era falso por
un factor de ~4, y lo interesante no es que se corrigiera sino que hizo falta un tercer protocolo
para saber que lo era.

## El dataset, y por qué condiciona todo

Sentinel tiene dos tracks paralelos: eventos de log (ensemble de tres detectores, 25 features) y
flujos de red (cascada Isolation Forest → XGBoost, 78 features de CICFlowMeter). El track de flujos
se integró desde un trabajo previo sobre CICIDS2017 que reportaba F1-macro 0.9516 y que admitía en
su propia §10.1 un fallo metodológico: partición aleatoria estratificada por fila sobre una captura
continua. CICIDS2017 es tráfico real capturado durante cinco días; los flujos de una misma ráfaga de
ataque —mismo host, mismo escenario, milisegundos de diferencia— son casi idénticos. Un split
aleatorio los reparte entre train y test. `drop_duplicates()` elimina copias exactas, no
casi-duplicados. El 0.95 era una cota optimista y estaba etiquetado como tal.

Corregirlo era el objetivo de la integración. Y aquí aparece la restricción que gobierna el resto:
la distribución `MachineLearningCVE` de CICIDS2017 tiene 79 columnas y **no incluye `Timestamp`**.
El único portador de tiempo es el nombre del fichero (`Monday-WorkingHours.csv`,
`Friday-Afternoon-DDos.csv`). Las filas sí conservan el orden cronológico dentro de cada fichero, así
que el tiempo existe como *posición*, no como valor.

El loader lo materializa en tres columnas de procedencia, y las marca como veneno:

```python
LABEL_COL: Final[str] = "Label"
CAPTURE_DAY_COL: Final[str] = "capture_day"   # del nombre de fichero
ORDER_IDX_COL: Final[str] = "order_idx"       # posición monótona en orden de carga
RAW_LABEL_COL: Final[str] = "raw_label"       # etiqueta antes del colapso canónico

# Todo lo que nunca debe llegar al modelo. Lo consume get_feature_columns.
META_COLUMNS: Final[tuple[str, ...]] = (
    LABEL_COL, CAPTURE_DAY_COL, ORDER_IDX_COL, RAW_LABEL_COL,
)
```

Si `capture_day` se cuela en la matriz de features, el modelo aprende a detectar el viernes. No salta
ningún error.

## Las dos soluciones obvias no funcionan

**Corte posicional global** (primer 70 % train, último 15 % test): inútil sobre esta distribución.
En `Friday-WorkingHours-Afternoon-DDos.pcap_ISCX.csv` el último decil es 100 % BENIGN. El test no
contendría ni un solo ataque.

**Holdout por día** ("reservamos el viernes"): mata el entrenamiento. En CICIDS2017 cada clase vive
en exactamente un día — martes es BruteForce, miércoles DoS, jueves por la mañana WebAttack, viernes
Bot, PortScan y DDoS. Reservar el viernes deja DDoS, Scan y Botnet con **cero muestras de
entrenamiento**. Es un protocolo válido para una pregunta distinta ("¿generaliza a un día no
visto?"), y se conserva como tal, pero no puede ser el protocolo de referencia.

Lo que se implementó es una **partición por bloque**: dentro de cada bloque las filas se ordenan por
`order_idx` y se cortan 70/15/15 por posición. Ningún flujo de test precede a uno de train dentro de
su propio escenario, todas las clases sobreviven en las tres particiones, y los casi-duplicados de
una ráfaga se quedan contiguos.

Queda una decisión, y es toda la sustancia del asunto: **qué es un bloque**.

## El resultado que parecía la conclusión

La primera versión definía el bloque como `(capture_day, clase canónica)`. Los números:

| Split | Accuracy | F1-macro |
|---|---|---|
| `random` | 0.9934 | **0.9166** |
| `temporal` | 0.8783 | **0.2809** |

y la lectura que se publicó fue:

> La caída de 0.9166 a 0.2809 en F1-macro no es una regresión: es la magnitud de la fuga.

Es una frase con forma de conclusión: cuantifica exactamente lo que el trabajo previo admitía no
haber controlado. Fue el resultado más citado de la rama durante semanas.

Es falsa por un factor de ~4.

## Por qué era falsa

`ATTACK_GROUPS` colapsa 15 etiquetas crudas de CICIDS2017 en 8 clases canónicas. Es una decisión de
**reporte** perfectamente razonable: nadie quiere una matriz de confusión de 15×15 donde tres celdas
tienen 20 muestras. El problema es que las herramientas colapsadas juntas **corrieron
secuencialmente dentro del mismo día de captura**. El miércoles va Hulk → slowloris → Slowhttptest →
GoldenEye, todas etiquetadas `DoS`. El martes va FTP-Patator → SSH-Patator, ambas `BruteForce`.

Cortar por posición dentro de un bloque así no separa fases de un escenario: separa herramientas.
Composición real de cada bloque bajo el corte 70/15/15, medida sobre el dataset completo (2.520.798
filas tras limpieza, sin muestrear):

| Bloque | Herram. | train (primer 70 %) | test (último 15 %) |
|---|---|---|---|
| `wednesday/DoS` | 5 | Hulk 125.016 · slowloris 5.385 · Slowhttptest 5.228 | Hulk 18.767 · **GoldenEye 10.286** · **Heartbleed 11** |
| `thursday/WebAttack` | 3 | Brute Force 1.470 · XSS 30 | **XSS 301** · **Sql Injection 21** |
| `tuesday/BruteForce` | 2 | FTP-Patator 5.931 · SSH-Patator 474 | **SSH-Patator 1.373 (100 %)** |
| `friday/DDoS` | 1 | DDoS 89.609 | DDoS 19.203 |
| `friday/Scan` | 1 | PortScan 63.485 | PortScan 13.605 |
| `friday/Botnet` | 1 | Bot 1.363 | Bot 293 |
| `thursday/Infiltration` | 1 | Infiltration 25 | Infiltration 6 |

En las tres primeras filas el test no mide lo mismo que el train:

- **`wednesday/DoS`**: el 35,4 % del test son GoldenEye y Heartbleed, que no aparecen **ni una vez**
  en train.
- **`thursday/WebAttack`**: Sql Injection no aparece en train; XSS aparece 30 veces contra 301 en
  test. El clasificador ve el 9 % de la evidencia que se le exige reproducir.
- **`tuesday/BruteForce`**: el test es **íntegramente** SSH-Patator, contra 474 filas de SSH-Patator
  en un train de 6.405.

Eso no es una partición anti-fuga. Es un holdout de herramienta de ataque no vista, disfrazado de
partición anti-fuga. Es una pregunta legítima y difícil — probablemente más difícil que la que se
quería contestar — pero es **otra pregunta**, y nadie la había elegido.

## El experimento que aísla el factor

Un tercer protocolo, con exactamente la misma garantía cronológica, cambiando solo la clave del
bloque: `(capture_day, etiqueta cruda)` en lugar de `(capture_day, clase canónica)`. Cada
herramienta se corta sobre su propia línea temporal. La firma completa cabe en dos ramas:

```python
def _resolve_block_columns(df: pd.DataFrame, temporal_block: str) -> list[str]:
    """Elige las columnas que definen un bloque temporal."""
    if temporal_block == "class":
        return [CAPTURE_DAY_COL, LABEL_COL]

    if RAW_LABEL_COL not in df.columns:
        logger.warning("temporal_block_fallback_to_class", requested=temporal_block)
        return [CAPTURE_DAY_COL, LABEL_COL]

    return [CAPTURE_DAY_COL, RAW_LABEL_COL]
```

Tres líneas de decisión. Resultados sobre 200.000 flujos muestreados, pipeline `xgb`, sin tuning:

| Protocolo | Accuracy | F1-macro | F1-weighted | Stage 1 P / R / FPR (test) |
|---|---|---|---|---|
| `--split random` | 0.9944 | **0.9197** | 0.9945 | 0.251 / 0.979 / 0.593 |
| `temporal --temporal-block sub-label` *(nuevo default)* | 0.9612 | **0.7721** | 0.9597 | 0.250 / 0.804 / 0.491 |
| `temporal --temporal-block class` *(default anterior)* | 0.8807 | **0.2973** | 0.8483 | 0.679 / 0.393 / 0.038 |

*(Las cifras `random`/`class` de esta tabla difieren en el tercer decimal de las publicadas
originalmente —0.9166 y 0.2809— porque se remidieron después de sacar `Infiltration` de la clase
`Scan`, un arreglo adyacente encontrado en la misma revisión. El argumento no depende de esa
diferencia.)*

La descomposición:

```
F1-macro   random 0.9197  →  sub-label 0.7721  →  class 0.2973
           └──── 0.1476 ────┘└──────── 0.4748 ────────┘
              fuga (23,7 %)    artefacto taxonomía × tiempo (76,3 %)
```

**La fuga por casi-duplicados vale 0.148 de F1-macro, no 0.622.** El 76 % restante lo produce una
decisión de taxonomía que se coló en la definición de la partición.

Conviene decirlo explícitamente porque el cambio va en la dirección incómoda: **la corrección mejora
el número titular**, de 0.28 a 0.77. Un resultado que mejora al arreglar el protocolo exige más
justificación que uno que empeora, no menos, porque el sesgo del que revisa juega a favor. La
justificación es esta: los dos protocolos temporales tienen la misma garantía cronológica y la misma
prohibición de que un flujo de test preceda a uno de train dentro de su escenario. Lo único que
cambia es que bajo `sub-label` ninguna herramienta queda íntegramente fuera de train. Si la caída a
0.28 fuese fuga, `sub-label` —que elimina exactamente la misma fuga— caería igual. No cae.

## El artefacto no se queda donde debería

Este es el hallazgo que no esperábamos y el que más justifica el cambio de default.

`Scan` y `DDoS` tienen **una sola herramienta** cada una. Su bloque se parte **idénticamente, bit a
bit**, bajo los dos protocolos: `(friday, Scan)` y `(friday, PortScan)` son el mismo conjunto de
filas en el mismo orden. Y aun así:

| Clase | Herram. | Soporte (test) | `random` | `sub-label` | `class` |
|---|---|---|---|---|---|
| BENIGN | — | 24.936 | 1.00 | 0.98 | 0.94 |
| Botnet | 1 | 24 | 0.54 | **0.00** | **0.00** |
| BruteForce | 2 | 110 | 0.98 | 0.98 | **0.00** |
| DDoS | 1 | 1.524 | 0.99 | 0.98 | 0.63 |
| DoS | 5 | 2.308 | 0.98 | 0.84 | 0.44 |
| Scan | 1 | 1.080 | 0.99 | 0.80 | **0.01** |
| WebAttack | 3 | 26 | 0.96 | 0.83 | 0.06 |

`Scan` cae de 0.80 a 0.01 y `DDoS` de 0.98 a 0.63 al cambiar una clave de bloqueo que no toca ni una
de sus filas.

La vía es el **punto de operación compartido de Stage 1**. La arquitectura es una cascada: un
Isolation Forest entrenado solo sobre flujos BENIGN decide si un flujo es anómalo, y un XGBoost
nombra la familia de ataque viendo únicamente lo que Stage 1 marcó. El umbral del Isolation Forest
se elige maximizando F-beta sobre validación — y la composición de validación la fija **la misma
clave de bloqueo**. Bajo `class`, la validación contiene herramientas que el forest nunca vio, la
búsqueda aterriza en un umbral radicalmente más conservador, y el resultado se paga en todas partes:

| Protocolo | Stage 1 recall (test) | Stage 1 FPR (test) |
|---|---|---|
| `sub-label` | 0.804 | 0.491 |
| `class` | **0.393** | 0.038 |

Con `class`, el **61 % de los ataques no supera Stage 1** y por tanto nunca llega a Stage 2. Ningún
acierto de Stage 2 puede recuperarlos. Las clases de una sola herramienta pagan la factura igual que
las demás.

La moraleja generaliza más allá de este dataset: **en una cascada, contaminar la validación de tres
clases mueve el punto de operación de las siete**. Las métricas por clase de una arquitectura de dos
etapas no son variables independientes, aunque el `classification_report` las imprima en filas
separadas.

## Por qué ese F1-macro no era un agregado coherente en ningún caso

Aunque el protocolo `class` midiera lo que se pretendía, el número seguiría sin poder promediarse.
`class` solo exige generalizar a herramienta nueva **en las clases que tienen más de una**:

- `BruteForce`, `DoS` y `WebAttack` responden a "¿generaliza a una herramienta no vista?".
- `Botnet`, `DDoS` y `Scan` tienen una sola herramienta y responden a "¿detecta lo que ya vio?".

Promediar las seis produce un número que no contesta ninguna de las dos preguntas. Por eso el
protocolo se conserva —se ejecuta con una opción, `--temporal-block class`, y su resultado sigue
publicado— pero se reporta aparte y nunca como titular. No se ha borrado un mal número: se ha
etiquetado.

## Dónde el veredicto duro se sostiene entero

`Botnet` cae **0.54 → 0.00 en los dos protocolos temporales**.

Tiene una sola sub-etiqueta (`Bot`), un solo día y ~1.950 filas. Su bloque se parte idénticamente
bajo ambas claves, así que aquí no cabe confusión con la novedad: el modelo pasa de 0.54 a cero en
cuanto los casi-duplicados dejan de cruzar la frontera train/test. **Ese 0.54 era memorización
pura.** Con la muestra de 200.000 flujos le quedan 108 filas de entrenamiento y 24 de test; no hay
con qué aprender la clase una vez que no se puede memorizar.

Es el único punto donde la lectura dura original se sostiene sin matices, y sigue roto hoy. El punto
débil real del diseño está ahí —en las clases minoritarias concentradas en un solo día— no en un
F1-macro global de 0.28. Corregir la partición no arregló Botnet; lo dejó a la vista sin el ruido de
alrededor.

## Cómo hacerlo auditable

El arreglo estructural cabe en una idea: **conservar la etiqueta cruda como columna de procedencia**,
desacoplando la decisión de *reporte* (colapsar 15 etiquetas en 8 clases) de la decisión de
*partición* (qué es un bloque). El colapso sigue existiendo para las métricas; ya no gobierna el
corte.

Lo segundo es emitir el reparto por sub-etiqueta en el log del run, no solo el reparto por clase:

```
split_class_distribution     label=BruteForce   train=6405 val=1373 test=1373
split_sublabel_distribution  label=FTP-Patator  train=5931 val=1272 test=0      ← warning
split_sublabel_distribution  label=SSH-Patator  train=474  val=101  test=1373
```

La primera línea parece perfectamente sana. Las dos de debajo, con `FTP-Patator test=0`, son las que
delatan que el corte holdeó una herramienta entera. El logger emite `warning` en lugar de `info` en
cuanto alguna partición queda a cero, así que el problema aparece en el nivel de log por defecto sin
que nadie tenga que ir a buscarlo.
