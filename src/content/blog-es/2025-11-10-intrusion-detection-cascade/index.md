---
title: 'Una cascada de dos etapas para detección de intrusiones: Isolation Forest y luego XGBoost'
description: 'Por qué dividí la detección de intrusiones en red en un filtro de anomalías barato y un clasificador caro, qué me enseñó CICIDS2017 sobre el desbalanceo de clases, y por qué la cascada ahorró mucho menos de lo que la diseñé para ahorrar.'
tags: ["Machine Learning", "Security", "Python"]
pubDate: '2025-11-10'
updatedDate: '2026-10-18'
coverImage: './cover.jpg'
---

> **Lee la cifra principal con cuidado.** El 0,95 de F1-macro de abajo sale de un split aleatorio estratificado por filas, y la memoria del proyecto ya avisaba de que es optimista: flujos casi idénticos de una misma ráfaga de ataque acaban a la vez en train y en test. Cuando más tarde reconstruí esta cascada con una partición cronológica, la cifra cayó mucho. Esa historia está en [Tu split temporal probablemente mide otra cosa](/es/2026-08-10-temporal-split-measures-something-else/) y en [El conjunto de validación miente en cuanto dejas de barajar](/es/2026-08-11-validation-set-lies/). Este post describe el diseño original y sus números tal como se midieron.

Un único clasificador sobre tráfico de red parece buena idea hasta que miras qué está optimizando en realidad. En la muestra con la que entrené, alrededor del 83% de los flujos son benignos, y la clase de ataque más rara, Botnet, tiene 541 filas de entrenamiento frente a 581.776 benignas. Un modelo que predice «benigno» para todo saca buena nota en accuracy y no vale nada.

Así que construí el detector como una cascada: una etapa no supervisada y barata que descarta el tráfico claramente benigno, y una etapa supervisada y cara que solo ve lo que sobrevive.

## Etapa uno: Isolation Forest como filtro, no como detector

Isolation Forest aísla puntos partiendo variables al azar. Las anomalías necesitan menos particiones, así que acaban con longitudes de camino medias más cortas. Es no supervisado y rápido, y sobre todo no necesita saber qué aspecto tiene un ataque.

No lo usé para clasificar nada. Su único trabajo es responder a una pregunta: ¿es este flujo lo bastante aburrido como para descartarlo?

```python
self._model = IsolationForest(
    n_estimators=200,
    max_samples="auto",      # min(256, n_samples) per tree
    contamination=0.15,      # only sets sklearn's internal offset; unused below
    n_jobs=-1,
    random_state=self.random_seed,
)
self._model.fit(X_train[y_train == BENIGN_LABEL])   # benign traffic only
```

Hay dos decisiones que merece la pena explicar.

**Entrenarlo solo con tráfico benigno.** Es habitual ajustar Isolation Forest con todo y dejar que se apañe. Ajustarlo solo con filas benignas lo convierte en un modelo de la normalidad, que es justo contra lo que quiero comparar.

**Elegir el umbral uno mismo, y elegirlo por recall.** `contamination` solo mueve el offset del `predict()` de sklearn, y el pipeline nunca lo llama. El umbral real sale de barrer 300 candidatos sobre las puntuaciones de validación y quedarse con el que maximiza F-beta con β = 2:

```python
candidates = np.linspace(scores.min(), scores.max(), num=300)
for t in candidates:
    y_pred = (scores < t).astype(int)          # below t → anomaly
    fb = fbeta_score(y_binary, y_pred, beta=2.0)
```

β = 2 pesa más el recall que la precisión, y es una decisión deliberada: prefiero reenviar flujos benignos a la etapa dos que descartar un ataque en la etapa uno, porque un flujo que la etapa uno descarta no vuelve a revisarse.

## Etapa dos: XGBoost, y una red en NumPy para mantenerlo honesto

Los flujos que sobreviven van a un clasificador de gradient boosting. Los datos tabulares con escalas mezcladas e interacciones no lineales son donde XGBoost es fuerte, y el desbalanceo restante lo gestiona con pesos de clase por muestra. Por defecto usa 300 árboles, profundidad 6 y learning rate 0,1, y un `RandomizedSearchCV` sobre 20 configuraciones elige los valores finales.

También implementé desde cero en NumPy una red feed-forward, con forward pass, backprop y Adam escritos a mano, y la entrené sobre el mismo conjunto filtrado. No esperaba que ganara a XGBoost en datos tabulares, y no lo hizo. La escribí porque quería ver qué les hacían exactamente los gradientes a las clases raras, y un framework me lo habría ocultado.

Lo que enseñó no fue halagador. Los pesos de clase solos no bastaban, así que fui añadiendo mecanismos: focal loss con γ = 2, batches balanceados, sobremuestreo de las clases minoritarias y label smoothing. El recall de las clases raras subió a 0,99 y la precisión se hundió. Botnet acabó con una precisión de 0,09, porque los batches balanceados le enseñaban a la red las mismas 541 muestras de Botnet una y otra vez, y aprendió a llamar Botnet a cualquier cosa que se les pareciera. Ver *cómo* fallaba me enseñó más que otra llamada a una librería.

## Resultados

Conjunto de test de 150.001 flujos, split aleatorio estratificado:

| Métrica | IF + XGBoost | IF + red NumPy |
| --- | --- | --- |
| Accuracy | **0,9936** | 0,9696 |
| F1-macro | **0,9516** | 0,7508 |
| F1-weighted | **0,9936** | 0,9747 |
| F1 de Botnet | **0,76** | 0,16 |

El F1-weighted lo domina la clase benigna, que nunca fue la parte difícil. El F1-macro es el resumen honesto, porque pesa igual cada clase de ataque por rara que sea. Aun así, solo se sostiene bajo el split aleatorio. Entre los dos pipelines, la columna que importa es la de Botnet.

## La cascada no compró lo que la diseñé para comprar

El sentido de la etapa uno era mantener la mayor parte del tráfico lejos del modelo caro. Lo benigno es ~83% de los flujos, así que un filtro ideal descartaría más o menos eso. Esto es lo que hizo de verdad en test:

| Etapa uno | Valor |
| --- | --- |
| Recall de ataques | 0,968 |
| Flujos benignos marcados como anómalos (FPR) | 0,601 |
| Fracción del tráfico total descartada | **33,2%** |

β = 2 empujó el umbral tan lejos hacia el recall que el 60% del tráfico benigno se reenvía de todos modos. La etapa dos acaba procesando dos tercios de los flujos, cerca de lo que vería un clasificador multiclase sin cascada. La arquitectura funciona como garantía de recall. Como ahorro de coste apenas funciona, y no lo vi hasta que medí directamente la tasa de descarte en lugar del F1 de extremo a extremo.

## Qué haría distinto

**Tratar el umbral de la etapa uno como un mando operativo, no como un hiperparámetro.** Decide a la vez el techo de ataques detectables y la factura de cómputo, y con tráfico real habría que recalibrarlo a medida que deriva el comportamiento normal.

**Monitorizar la tasa de descarte como métrica de primera clase.** Es la cifra que me dijo que la cascada apenas ahorraba, y en producción un cambio brusco en ella sería la primera señal de que algo ha cambiado aguas arriba.

**No fiarse nunca de un split aleatorio sobre una captura continua.** La memoria lo dice en su sección de limitaciones. El trabajo posterior midió cuánto importaba, y eso resultó más interesante que la propia cascada.
