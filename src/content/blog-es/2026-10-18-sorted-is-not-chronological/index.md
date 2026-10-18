---
title: 'sorted() no es cronológico: la tercera vez que mi split temporal estaba mal'
description: 'Un orden de carga de ficheros que ponía la tarde del viernes antes que la mañana movió el F1-macro de un detector de intrusiones de 0.7721 a 0.6467 y tumbó el resultado de un post que ya había publicado. El experimento de control, lo que sobrevive y una opción de muestreo que subió el titular por el motivo equivocado.'
tags: ["Machine Learning", "Security", "Python"]
pubDate: '2026-10-18'
coverImage: './cover.jpg'
---

En agosto publiqué dos posts sobre el track de flujos de Sentinel, un detector de intrusiones
entrenado sobre CICIDS2017 con una cascada Isolation Forest → XGBoost. El
[primero](/es/2026-08-10-temporal-split-measures-something-else/) mostraba que el split cronológico
que usaba había estado cortando por *herramienta* de ataque y no por tiempo. Su afirmación central
era que, del F1-macro perdido entre un split aleatorio y uno temporal, un 24 % era fuga por
casi-duplicados y **un 76 % era un artefacto de la taxonomía**. El
[segundo](/es/2026-08-11-validation-set-lies/) encontraba un bug de reporte y afirmaba, en negrita,
que esa descomposición «se sostiene entera».

No se sostiene. Este post trata de la línea de código que la rompió:

```python
csv_files = sorted(data_path.glob("*.csv"))
```

## El tiempo como posición, no como valor

La distribución de CICIDS2017 que uso no tiene columna `Timestamp`. El tiempo solo existe en dos
sitios: el nombre del fichero, que dice qué día y más o menos qué parte del día, y el orden de las
filas dentro de cada fichero, que es cronológico. El loader lo convierte en una columna de
procedencia, `order_idx`, como un offset acumulado sobre las filas en el orden en que las lee. El
split temporal ordena cada bloque por `order_idx` y corta 70/15/15 por posición.

Así que el orden en que se leen los ficheros *es* el eje del tiempo. Y se leen en orden alfabético:

```
Friday-WorkingHours-Afternoon-DDos.pcap_ISCX.csv
Friday-WorkingHours-Afternoon-PortScan.pcap_ISCX.csv
Friday-WorkingHours-Morning.pcap_ISCX.csv
...
Thursday-WorkingHours-Afternoon-Infilteration.pcap_ISCX.csv
Thursday-WorkingHours-Morning-WebAttacks.pcap_ISCX.csv
```

«Afternoon» va antes que «Morning». El jueves y el viernes, las capturas de tarde recibían valores
de `order_idx` menores que las de mañana. La docstring de `order_idx` prometía que era monótono
*dentro de un fichero*, y lo era. Entre ficheros codificaba el alfabeto en lugar del reloj, y nada
en el código pedía nunca más de lo que la docstring prometía.

## Por qué solo afectaba a BENIGN, y por qué con eso bastaba

Esto es lo que contiene cada fichero, contado sobre los CSV crudos, en orden real de captura:

| Fichero | Etiquetas crudas |
|---|---|
| `Monday-WorkingHours` | BENIGN 529.918 |
| `Tuesday-WorkingHours` | BENIGN 432.074 · FTP-Patator 7.938 · SSH-Patator 5.897 |
| `Wednesday-workingHours` | BENIGN 440.031 · DoS Hulk 231.073 · GoldenEye 10.293 · slowloris 5.796 · Slowhttptest 5.499 · Heartbleed 11 |
| `Thursday-Morning-WebAttacks` | BENIGN 168.186 · Brute Force 1.507 · XSS 652 · Sql Injection 21 |
| `Thursday-Afternoon-Infilteration` | BENIGN 288.566 · Infiltration 36 |
| `Friday-Morning` | BENIGN 189.067 · Bot 1.966 |
| `Friday-Afternoon-DDos` | BENIGN 97.718 · DDoS 128.027 |
| `Friday-Afternoon-PortScan` | BENIGN 127.537 · PortScan 158.930 |

**Ninguna etiqueta de ataque aparece en más de un fichero.** Cada bloque de ataque vive dentro de un
único fichero, donde el orden de las filas es tiempo real, así que todos los ataques se cortaban
bien pese al bug. Los bloques benignos del jueves (dos ficheros) y del viernes (tres) no: el corte
70/15/15 recorría un orden inventado, y «el último 15 % del tráfico benigno del viernes» era el final
de la captura de *mañana*.

Parece un problema acotado. No lo es, por cómo funciona la cascada. Stage 1 es un Isolation Forest
entrenado **solo con flujos benignos**, y su umbral se elige maximizando F-beta sobre un conjunto de
validación cuya parte benigna salía de esos mismos cortes mal ordenados. Todo lo que Stage 1 no
marca se reporta como BENIGN y nunca llega a Stage 2. El segundo post de agosto trataba
precisamente de cuánto gobierna ese único umbral. El bug estaba justo donde más daño podía hacer.

## El experimento de control

El arreglo son tres líneas: una tupla canónica `CAPTURE_FILE_ORDER`, una clave de ordenación que la
usa y el orden resuelto escrito en el log del run, para que se pueda auditar sin leer el código:

```python
csv_files = sorted(
    data_path.glob("*.csv"),
    key=lambda p: (capture_file_rank(p.name), p.name),
)
logger.info(
    "cicids_load_started",
    n_files=len(csv_files),
    data_path=str(data_path),
    file_order=[p.name for p in csv_files],
)
```

Pero movió el titular, y un arreglo que mueve el titular hay que atribuirlo, no solo afirmarlo. Así
que el control es el código *actual* con `capture_file_rank` neutralizado, de forma que la
ordenación vuelve al alfabeto:

| Run | Accuracy | F1-macro | F1-weighted | Stage 1 test P / R / FPR |
|---|---|---|---|---|
| Publicado en agosto | 0.9612 | **0.7721** | 0.9597 | 0.250 / 0.804 / 0.491 |
| Control: código actual, orden alfabético | 0.9612 | **0.7721** | 0.9597 | 0.250 / 0.804 / 0.491 |
| Código actual, orden de captura | 0.9194 | **0.6467** | 0.9052 | 0.335 / 0.560 / 0.226 |

El control reproduce agosto hasta el último decimal publicado. Eso cierra dos cosas a la vez: los
runs de agosto eran reproducibles, y el movimiento tiene una sola causa. El umbral del Isolation
Forest baja de 0.0911 a 0.0655, y el recall de Stage 1 en test de 0.804 a 0.560.

Hay un segundo canal, más pequeño, y prefiero decirlo a esconderlo. Leer los ficheros en otro orden
también cambia qué filas saca `groupby().sample()`. La fila del split aleatorio acota ese efecto,
porque un split aleatorio no tiene corte temporal, y aun así su F1-macro se mueve +0.0256
(0.9197 → 0.9453). El canal que importa es el primero, pero el segundo no es cero, y no los he
separado más fino que eso.

## Qué queda de la descomposición

```
Agosto, order_idx alfabético
F1-macro   random 0.9197  →  sub-label 0.7721  →  class 0.2973
           └──── 0.1476 ────┘└──────── 0.4748 ────────┘
              fuga (23,7 %)    artefacto taxonomía × tiempo (76,3 %)

order_idx en orden de captura
F1-macro   random 0.9453  →  sub-label 0.6467  →  class 0.6547
           └──── 0.2986 ────┘└──────── −0.0080 ────────┘
                protocolo       artefacto ya no medible
```

El artefacto de taxonomía nunca fue un efecto directo sobre el clasificador. Su única vía era el
umbral compartido de Stage 1: bloquear por clase canónica cambiaba lo que contenía validación, eso
movía el umbral, y el umbral movía todas las clases. Con el orden de captura corregido, los dos
protocolos aterrizan en umbrales casi iguales (recall de Stage 1 de 0.560 frente a 0.573). Cuando
el mediador deja de moverse, el efecto desaparece. `class` incluso acaba 0.008 *por encima* de
`sub-label`, y `BruteForce` puntúa ahora mejor bajo el protocolo que deja fuera una herramienta
entera (0.969) que bajo el que no (0.934).

Lo que sobrevive de agosto es el hecho del dataset, no la métrica. Con la clave `class`, el test de
martes sigue siendo 100 % SSH-Patator, y el 35 % del de miércoles sigue siendo GoldenEye y
Heartbleed. Es una mala propiedad para un split. Simplemente resultó no costar 0.475 de F1-macro.

Los 0.2986 que quedan entre aleatorio y temporal tampoco son «fuga» sin más. Con el split aleatorio,
Stage 1 marca al menos el 95 % de cada clase de ataque. Con el temporal marca el 11 % de `Scan` y
nada de `Botnet`. Una parte del hueco son casi-duplicados que Stage 2 memorizaba. Otra es un umbral
de Stage 1 que no transfiere hacia delante en el tiempo. No separo las dos, y no voy a fingir que un
número lo hace.

La cifra más importante también cambió. El recall de Stage 1 es el techo de toda la cascada, así
que su complemento es la fracción de ataques que **no se pueden recuperar por diseño**. Era el
19,6 % cuando publiqué el segundo post. Con los ficheros en orden de captura es el **44,0 %**.

## La opción que subió el titular por el motivo equivocado

Con 200.000 flujos muestreados, a Botnet le quedan 108 filas de entrenamiento y 24 de test, y sobre
24 filas un 0.00 y un 0.50 son la misma medida. Así que añadí un suelo de muestreo:
`--class-sample-floor 2000` da a cada clase al menos 2.000 filas, o todas las que tenga, y reparte
el resto del presupuesto proporcionalmente.

El titular subió, de 0.6467 a **0.7893**. Sería fácil contarlo como «arreglé las clases raras». Esto
es lo que se movió de verdad:

| Clase | filas de train, sin suelo → con suelo | F1, sin suelo → con suelo | Recall de Stage 1, sin suelo → con suelo |
|---|---|---|---|
| Botnet | 108 → 1.363 | 0.000 → **0.000** | 0.000 → 1.000 |
| Scan | 5.037 → **4.913** | 0.201 → **0.792** | 0.113 → 0.667 |
| DDoS | 7.109 → **6.934** | 0.886 → 0.956 | 0.796 → 0.921 |
| DoS | 10.758 → **10.495** | 0.732 → 0.847 | 0.594 → 0.754 |

`Scan`, `DDoS` y `DoS` mejoraron **con menos filas de entrenamiento que antes**. No aprendieron nada
nuevo. El suelo añade 4.897 filas de ataque, restadas sobre todo a BENIGN, y eso cambia la
proporción benigno:ataque que ve la búsqueda F-beta. El umbral de Stage 1 sube de 0.0655 a 0.0885,
y el recall de Stage 1 de 0.560 a 0.819. Casi toda la ganancia es eso. La clase para la que se
construyó el suelo es la única que no se movió.

Es el mismo acoplamiento por tercera vez: cualquier cosa que cambie la composición de validación
mueve el umbral único, y el umbral único lo mueve todo. Por eso el suelo viene **desactivado por
defecto**. No es una opción de muestreo. Es un cambio del punto de operación con apariencia de
opción de muestreo.

## Botnet, ya sin excusas

Lo que el suelo sí compra es una respuesta para Botnet:

| Run | Botnet train | Botnet test | Recall de Stage 1 en Botnet | F1 de Stage 2 en Botnet |
|---|---|---|---|---|
| temporal, sin suelo | 108 | 24 | 0.000 | 0.000 |
| temporal, suelo 2.000 | 1.363 | 293 | **1.000** | **0.000** |
| aleatorio, suelo 2.000 | 1.364 | 292 | 1.000 | 0.973 |

Con 12,6× más datos de entrenamiento, y con Stage 1 entregando a Stage 2 todos y cada uno de los
flujos de test de Botnet, Stage 2 sigue en 0.00 con el split temporal, y en 0.97 con el aleatorio y
el mismo volumen de datos. Lo que falta no es soporte. Un botnet capturado una sola mañana con una
sola herramienta, cortado cronológicamente, no deja nada en su primer 70 % que transfiera a su
último 15 %. El suelo no arregla Botnet. Retira la última objeción metodológica al cero.

## El mismo error, un nivel más abajo

Al verificar todo esto encontré dos más de la misma familia. La búsqueda de hiperparámetros de
Stage 2 partía su train con `StratifiedKFold(shuffle=True)`, reintroduciendo dentro del train
exactamente la fuga que el split temporal existe para eliminar. Nunca tocó una métrica publicada,
porque todos los runs de referencia usaban `--skip-tuning`, pero sesgaba qué hiperparámetros
ganaban. Ahora es una partición de ventana expansiva por bloque (`ml/flow/cv.py`): el fold *k*
entrena con los *k* primeros trozos de cada bloque y valida con el siguiente.

Y el scorer, `scoring="f1_macro"`, promediaba sobre las clases presentes *en ese fold*. Con folds
estratificados todas las clases están siempre, así que nunca importó. Con folds cronológicos, que
falte una clase pasa de imposible a rutinario, y las puntuaciones entre candidatos dejan de ser
comparables. Es el mismo valor por defecto (`labels=None`) que ya había mordido al `f1_macro` del
titular un nivel más arriba, en un módulo escrito meses antes. El conjunto sobre el que se promedia
un macro es una decisión, y omitirla es tomarla mal.

## Lo que me llevo

Tres errores en un mismo track, todos de la misma familia: un cálculo honesto sobre un conjunto que
no era el que yo creía. El split cortaba por herramienta en lugar de por tiempo. El reporte leía
validación como si fuera test. El eje del tiempo era el alfabeto. En los tres casos la corrección
empeoró el número, y en los tres lo único que lo detectó fue un experimento de control que cambiaba
exactamente un factor.

La lección generalizable es la del tercero. **Cuando el tiempo es una posición y no un valor, el
orden en que lees los datos es un dato.** Tiene que estar en el log del run junto a las métricas,
donde un lector pueda comprobarlo sin abrir el código. Por eso `file_order` está ahora en
`cicids_load_started`: si lo hubiera registrado en agosto, el problema habría sido visible antes de
publicar los posts.

El registro completo, con cada run y los comandos para reproducirlos, está en
[`docs/ml/PARTICION-TEMPORAL.md`](https://github.com/guillesanper/sentinel-platform/blob/temporal-fix/docs/ml/PARTICION-TEMPORAL.md).
