---
title: 'Generación de alertas para un reactor nuclear simulado'
description: 'Construir una capa de alertas con ML sobre una simulación física, y por qué el problema difícil fue decidir qué merece despertar a alguien.'
tags: ["Machine Learning", "Simulation", "Python"]
pubDate: '2026-05-12'
coverImage: './cover.jpg'
---

Este proyecto tiene dos mitades: una simulación física de un reactor de agua a presión, y una capa de machine learning que decide cuándo su estado justifica una alerta. La segunda mitad fue mucho más difícil de lo que esperaba, y no por razones de modelado.

## La simulación

El modelo del reactor es un núcleo simplificado de cinética puntual acoplado a un lazo termohidráulico. Población neutrónica, precursores de neutrones retardados, temperatura del combustible y del refrigerante, presión y caudal del circuito primario. Es un sistema rígido de EDOs, integrado con un solver implícito porque los métodos explícitos o revientan o fuerzan pasos de tiempo absurdamente pequeños.

Simplificado en el sentido de que a un ingeniero nuclear de verdad le haría torcer el gesto. No es un modelo de grado de licenciamiento ni pretende serlo. Lo que importa para la capa de ML es que produce señales *físicamente acopladas* — cuando el caudal de refrigerante cae, la temperatura del combustible sube, la reactividad responde a través del coeficiente de temperatura negativo, y la potencia se asienta en un nuevo punto. Esas correlaciones son lo que un detector de anomalías tiene que aprender.

Esto resultó ser la razón entera para simular en lugar de generar datos sintéticos directamente. Señales perturbadas al azar te dan un detector que aprende umbrales de ruido. Señales físicamente acopladas te dan uno capaz de notar que una *combinación* es imposible aunque ninguna lectura individual esté fuera de rango.

## Qué cuenta como anomalía

El planteamiento obvio es: aprende la operación normal, señala las desviaciones. Eso produce un sistema inutilizable, y la razón merece decirse con claridad.

Un reactor no está en un único estado estacionario. Rampa, sigue la carga, pasa por arranque y parada, las barras de control se mueven, el xenón se acumula y se quema a lo largo de horas. Todo eso es desviación respecto de cualquier «normal» que fijes, y todo eso es esperable. Un detector entrenado con operación estacionaria a plena potencia dispara continuamente durante una rampa rutinaria.

Así que el modelo está condicionado al régimen de operación. Un clasificador asigna el estado actual a uno de cinco regímenes — arranque, subida de rampa, estacionario, seguimiento de carga, parada — y se entrenan modelos de anomalía separados por régimen. Una trayectoria de presión que resulta alarmante en estacionario es completamente normal durante el arranque, y el sistema necesita saber cuál de las dos está mirando.

## La capa de alertas, que es donde estaba la dificultad de verdad

Conseguir que un detector puntúe anomalías es un ejercicio de modelado. Convertir puntuaciones en alertas es un problema de diseño, y lo hice mal dos veces antes de que funcionara.

**Intento uno: umbralizar la puntuación de anomalía.** Las alertas disparaban sin parar durante los transitorios. Cada frontera entre regímenes producía una ráfaga. Inutilizable en cuestión de minutos.

**Intento dos: umbral con una ventana de antirrebote.** Mejor, pero introducía un retardo que escalaba con la ventana, y los transitorios que más importaban eran precisamente los rápidos. Había cambiado falsos positivos por detección lenta de lo de verdad.

**Lo que funcionó: separar detección de notificación, y hacer que la severidad sea función de la persistencia y de la consecuencia física.**

El detector corre de forma continua y escribe cada anomalía en un log. Ese log es completo y silencioso — no avisa a nadie. Encima de él hay una política de alertas:

- **La severidad** se deriva de qué magnitud física se está desviando y de lo cerca que está de un límite de seguridad, no de la magnitud de la puntuación de anomalía. Una desviación pequeña en un parámetro cercano a su límite tiene más peso que una desviación grande en uno con margen de sobra.
- **La persistencia** controla la notificación. Una única muestra anómala se registra; una anomalía sostenida a lo largo de una ventana escala.
- **Las anomalías correlacionadas escalan más rápido que las aisladas.** Tres señales acopladas desviándose juntas es un indicio mucho más fuerte de un fallo real que una señal desviándose sola — el acoplamiento significa que es improbable que sea ruido de sensor.

Esa última regla solo es posible porque la simulación produce datos físicamente acoplados. Es la recompensa por construir bien la física.

## Lo que me diría a mí mismo al empezar

Di por supuesto que el trabajo interesante era el modelo de detección de anomalías, y que las alertas eran fontanería encima. Es al revés. El detector fueron unos días. La política de alertas llevó semanas, porque codifica un juicio — qué merece la atención de una persona y qué es meramente inusual — y ninguna cantidad de ajuste de modelo produce ese juicio por ti.

La mayoría de los fallos de sistemas de monitorización sobre los que he leído no son fallos de detección. Son fallos de alertado: la señal estaba en los logs, y estaba enterrada bajo otras mil alertas en las que ya nadie confiaba.
