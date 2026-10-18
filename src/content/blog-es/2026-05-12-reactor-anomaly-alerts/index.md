---
title: 'Generación de alertas para un reactor nuclear simulado: primero, la verdad de referencia'
description: 'Antes de que una capa de ML decida qué merece despertar a alguien, hacen falta datos donde se conoce la respuesta correcta. Una simulación física de un reactor de agua a presión, detectores de fallos de instrumento sobre un stream de Kafka y el diseño de alertas que viene después.'
tags: ["Machine Learning", "Simulation", "Python"]
pubDate: '2026-05-12'
updatedDate: '2026-10-18'
coverImage: './cover.jpg'
---

> **Corrección.** Una versión anterior de este post describía un clasificador de régimen, modelos de anomalía por régimen y una política de alertas como si estuvieran construidos. Todavía no lo están. Son el diseño de la siguiente fase. Esta versión describe lo que hay hoy en el repositorio y marca el resto como previsto.

ReactorGuard debe acabar teniendo una capa de machine learning que decida cuándo el estado de un reactor merece una alerta. No empieza por ahí. No se puede evaluar un detector sin datos en los que se sepa qué muestras son fallos, y los datos reales de fallos en reactores ni son públicos ni abundan. Así que hasta ahora el trabajo ha ido a tres cosas: un stream de lecturas de sensores, detectores de instrumentos averiados y una simulación física que genera fallos a demanda con la respuesta correcta adjunta.

## Primero los fallos de instrumento, sobre un proceso real

Antes de simular nada, el pipeline corrió sobre el Tennessee Eastman Process (TEP), un benchmark de planta química con 52 canales de sensores y ejecuciones con fallos etiquetados. Las lecturas pasan por Kafka (Strimzi sobre GKE, con un montaje local en Docker que de momento es lo verificado), y un consumidor de validación ejecuta cinco detectores sobre cada lectura: valor bloqueado, tasa de cambio, fuera de rango, correlación cruzada y un detector de deriva basado en Kalman. Cada fallo detectado se convierte en un evento en el topic `anomaly-alerts`.

Dos decisiones de diseño hicieron la mayor parte del trabajo.

**Ningún detector lee el flag `quality`.** `quality` dice si el transmisor es fiable, que es justo lo que el validador está decidiendo. Leerlo como entrada haría circular la evaluación. El validador lo escribe y nunca lo lee.

**Los umbrales son fracciones de la banda de alarma de cada canal, no unidades de ingeniería.** Un umbral absoluto compartido por 52 canales medidos en kg/s, bar y mol% significa algo distinto en cada uno.

Medido sobre TEP con fallos inyectados:

| Detector | Precisión | Recall | Tasa de falsos positivos |
| --- | --- | --- | --- |
| bloqueo | 1,000 | 0,814 | 0,0000 |
| fuera de rango | 1,000 | 1,000 | 0,0000 |
| pico de ruido | 1,000 | 0,778 | 0,0000 |
| deriva | 0,993 | 0,930 | 0,0001 |

El hallazgo más útil fue negativo. TEP muestrea cada 180 segundos, no cada segundo, y eso rompió tres valores por defecto que había heredado del documento de diseño: el ruido de proceso del Kalman, el umbral de deriva, que con su valor original saltaba en el 48% de la operación normal, y las ventanas de features dimensionadas en segundos en lugar de en muestras. A esa cadencia, una deriva lenta de instrumento **no es detectable** con este mecanismo. La banda útil es de solo unos 10–18 anchos de banda de alarma por hora. Ese límite está escrito en el código como una constante con nombre, para que nadie ajuste el detector esperando que vea algo que no puede ver.

Los eventos de alerta llevan un UUID5 determinista construido a partir del fallo y de la lectura de origen. Kafka entrega al menos una vez, así que una lectura reprocesada produce el mismo `alert_id` y se puede deduplicar aguas abajo en lugar de avisar dos veces.

## La simulación

TEP no tiene física de reactor, y la capa de alertas necesita señales acopladas físicamente. Así que la segunda mitad es un modelo simplificado de un reactor de agua a presión genérico de 3000 MWt, que no es una planta real:

- cinética puntual con seis grupos de precursores de neutrones diferidos
- tres nodos térmicos: combustible, salida del núcleo y generador de vapor
- presión del primario, fracción de vacío, caudal de refrigerante y un controlador PI de barras
- realimentación de reactividad por temperatura del combustible (Doppler), temperatura del moderador y vacío

Está lo bastante simplificado como para que un ingeniero nuclear torciera el gesto, y los coeficientes neutrónicos son valores provisionales tomados de la literatura. Lo que importa es que sus señales están acopladas: si se reduce el caudal de refrigerante, la temperatura del combustible sube, la reactividad responde a través del coeficiente negativo de temperatura y la potencia se asienta en un nuevo punto. Un detector entrenado con señales perturbadas de forma independiente aprende umbrales de ruido. Uno entrenado con señales acopladas puede aprender que una *combinación* de lecturas es imposible aunque cada lectura esté en rango.

Insistí en tres propiedades, cada una con una medición detrás:

- **El equilibrio se deriva, no se teclea.** Las temperaturas iniciales y los coeficientes de transferencia de calor salen de la potencia, el caudal y la temperatura de entrada. Tras 24 horas simuladas a potencia nominal, la derivada relativa máxima es 6e-17.
- **La energía se conserva por construcción.** El mismo término de capacidad calorífica aparece a ambos lados de cada ecuación de transporte, así que las tres ecuaciones de nodo suman exactamente el calor generado menos el extraído. En una rampa de 2.000 pasos, la energía cierra a 2e-15.
- **El solver se contrasta con otro.** La integración usa LSODA de scipy, que conmuta por su cuenta entre métodos rígidos y no rígidos. Radau coincide con él hasta 6,5e-8, y la traza es idéntica byte a byte entre procesos.

Sobre el modelo hay un catálogo de fallos en dos ejes separados. Los **fallos de proceso** cambian la planta: una excursión térmica por inserción de reactividad, una reducción de caudal, formación de vacío tras una fuga. Los **fallos de instrumento** cambian solo la lectura: deriva, bloqueo, pico, sesgo, intermitencia. Un planificador de escenarios sortea ejecuciones de ambos ejes contra un presupuesto de severidad y lleva la cuenta de qué parte del espacio queda cubierta. Cada muestra sale etiquetada con su estado verdadero y con si la lectura está corrompida.

## La capa de alertas: diseño previsto

La capa de ML todavía no está construida. El script de entrenamiento y las rutas de la API son andamiaje. Pero el diseño está lo bastante claro como para escribirlo, porque salió de equivocarme primero en el papel con versiones simples.

**Umbralizar una puntuación de anomalía no funciona.** Un reactor no está en un único estado estacionario. Arranca, sube en rampa, sigue la carga y se para, y cada transición parece una desviación. Un detector entrenado con operación estacionaria a plena potencia saltaría durante toda una rampa rutinaria.

**Una ventana de debounce cambia falsos positivos por detección lenta,** y los transitorios que más importan son los rápidos.

El plan es separar la detección de la notificación:

- Condicionar la detección al **régimen de operación** (arranque, rampa, estacionario, seguimiento de carga, parada), para que una trayectoria de presión que alarma en estacionario no se marque durante un arranque.
- Registrar cada anomalía en un stream completo y silencioso. El topic `anomaly-alerts` ya cumple ese papel para los fallos de instrumento.
- Derivar la **severidad de la cercanía a un límite de seguridad,** no del tamaño de la puntuación de anomalía. Una desviación pequeña en un parámetro cerca de su límite debería pesar más que una grande con mucho margen.
- Condicionar la notificación a la **persistencia** y escalar más rápido cuando **derivan a la vez señales acopladas,** porque el acoplamiento hace improbable que sea ruido de sensor.

Esa última regla es la razón de construir la física en lugar de generar ruido sintético. Si se sostiene o no es algo que el simulador me permite ahora medir: tiempo hasta la alerta, alertas por hora durante transitorios normales y recall sobre los escenarios de fallo.

## Lo que me diría al empezar

Daba por hecho que el trabajo interesante era el modelo de anomalías. Hasta ahora, todo lo que ha importado ha tenido que ver con la verdad de referencia: qué muestras son de verdad fallos, qué fallos puede ver físicamente un detector a una cadencia dada y si la planta simulada conserva la energía. Sin esas respuestas, una política de alertas no es más que un conjunto de opiniones.
