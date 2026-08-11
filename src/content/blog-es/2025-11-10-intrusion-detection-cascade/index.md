---
title: 'Una cascada de dos etapas para detección de intrusiones: Isolation Forest y luego XGBoost'
description: 'Por qué dividí la detección de intrusiones en red en un filtro de anomalías barato y un clasificador caro, y qué me enseñó CICIDS2017 sobre el desbalanceo de clases.'
tags: ["Machine Learning", "Security", "Python"]
pubDate: '2025-11-10'
coverImage: './cover.jpg'
---

Un único clasificador sobre tráfico de red parece buena idea hasta que miras qué está optimizando en realidad. CICIDS2017 es aproximadamente un 80% de tráfico benigno, y algunas clases de ataque aparecen unos pocos cientos de veces frente a 2,2 millones de flujos. Un modelo que predice «benigno» para todo saca buena nota en accuracy y no vale nada.

Así que construí el detector como una cascada: una etapa no supervisada y barata que descarta el tráfico benigno evidente, y una etapa supervisada y cara que solo ve lo que sobrevive.

## Etapa uno: Isolation Forest como filtro, no como detector

Isolation Forest aísla puntos partiendo variables al azar — las anomalías necesitan menos particiones, así que acaban con longitudes de camino medias más cortas. Es no supervisado, es rápido y, sobre todo, no necesita saber qué aspecto tiene un ataque.

No lo usé para clasificar nada. Su único trabajo es responder a «¿es este flujo lo bastante aburrido como para descartarlo?».

```python
from sklearn.ensemble import IsolationForest

iso = IsolationForest(
    n_estimators=200,
    contamination=0.25,   # deliberately loose
    max_samples=256,
    random_state=42,
)
iso.fit(X_train_benign)          # fitted on benign traffic only
scores = -iso.score_samples(X)   # higher = more anomalous
```

Dos decisiones que merece la pena explicitar.

**Ajustar solo con tráfico benigno.** Isolation Forest se suele ajustar con todo y se deja que él se apañe. Ajustarlo con una muestra benigna limpia lo convierte en un modelo de la normalidad, que es justo aquello contra lo que quiero comparar.

**Fijar `contamination` muy por encima de la tasa real de ataques.** 0,25 no es una estimación de cuánto tráfico es malicioso. Es una elección de umbral que dice: prefiero dejar pasar cuatro flujos benignos antes que descartar un ataque. El filtro está afinado para recall y nada más. La precisión es problema de la segunda etapa.

Con esa configuración, el filtro descarta alrededor del 62% del tráfico conservando el 99,1% de los flujos de ataque. Todo lo que viene después recibe un problema mucho menos desbalanceado.

## Etapa dos: XGBoost, y una red en NumPy para mantenerlo honesto

Los flujos supervivientes van a un clasificador de gradient boosting. Datos tabulares con escalas mixtas e interacciones no lineales entre variables es exactamente donde XGBoost es fuerte, y maneja bien el desbalanceo residual con pesos por clase.

```python
import xgboost as xgb

clf = xgb.XGBClassifier(
    n_estimators=400,
    max_depth=8,
    learning_rate=0.08,
    subsample=0.8,
    colsample_bytree=0.8,
    objective="multi:softprob",
    eval_metric="mlogloss",
)
clf.fit(X_filtered, y_filtered, sample_weight=weights)
```

También implementé una red feed-forward desde cero en NumPy — pasada hacia delante, backprop, Adam, todo — y la entrené sobre el mismo conjunto filtrado. No porque esperase que le ganara a XGBoost en datos tabulares. No se los ganó. La escribí porque quería saber exactamente qué les estaban haciendo los gradientes a las clases raras, y un framework me lo habría ocultado.

Lo que mostró: con entropía cruzada normal, la red esencialmente ignora las clases con menos de ~500 muestras. La contribución al gradiente de esas clases es un error de redondeo frente a la mayoría benigna. Una función de pérdida ponderada por clase lo arregló, y ver *por qué* necesitaba arreglo compensó las dos tardes escribiendo backprop a mano.

## Resultados

Números finales sobre el conjunto de test reservado:

| Métrica | XGBoost único | Cascada |
| --- | --- | --- |
| F1-macro | 0,87 | **0,95** |
| F1-ponderado | 0,98 | 0,99 |
| Coste de inferencia | 1,0x | 0,41x |

El F1 ponderado apenas se mueve — está dominado por la clase benigna, que nunca fue la parte difícil. El F1-macro es el número honesto aquí, porque pondera cada clase de ataque por igual sin importar lo rara que sea, y ese subió 8 puntos.

La reducción de coste es un efecto secundario: la mayor parte del tráfico nunca llega al modelo caro.

## Qué haría distinto

CICIDS2017 es una captura de laboratorio. El tráfico está generado, los ataques están guionizados y la línea base benigna es mucho más limpia que nada real. Una cascada afinada sobre él necesitará recalibrar el umbral de la primera etapa contra tráfico real, y probablemente reajustarlo con regularidad a medida que el comportamiento normal se desplaza. Tratar ese umbral como un hiperparámetro fijo en vez de como una palanca operativa sería lo primero que se rompería en producción.

También querría monitorizar la tasa de descarte del filtro como una métrica de primera clase. Si la etapa uno empieza de repente a dejar pasar el 90% del tráfico, algo cambió aguas arriba, y prefiero enterarme por un panel que por una alerta de latencia de la etapa dos.
