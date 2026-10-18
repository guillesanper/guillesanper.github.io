---
title: 'El conjunto de validación miente en cuanto dejas de barajar'
description: 'Reportar el punto de operación del mismo conjunto sobre el que eliges el umbral es correcto por accidente con un split aleatorio. Con partición temporal deja de serlo, y la cifra de seguridad más cargada del diseño estaba equivocada por un factor de 14.'
tags: ["Machine Learning", "Security", "Python"]
pubDate: '2026-08-11'
updatedDate: '2026-10-18'
coverImage: './cover.jpg'
---

> **Actualización, octubre de 2026.** El bug y el arreglo descritos aquí siguen en pie, y el hueco reapareció al re-medir: bajo `sub-label`, el recall de Stage 1 es 0.760 en validación frente a 0.560 en test, y bajo `random` el hueco es de +0.001. Cambiaron dos cosas. La descomposición que este post da por buena en «Lo que no cambia» no sobrevivió a una re-medición posterior con los ficheros en orden real de captura (ver la nota del [post anterior](/es/2026-08-10-temporal-split-measures-something-else/)). Y con ese orden, la fracción de ataques que Stage 1 no puede recuperar bajo el protocolo por defecto es el 44,0 %, no el 19,6 %.

Elegir un umbral sobre validación y **reportar el punto de operación de ese mismo conjunto** es
inofensivo con un split aleatorio. Deja de serlo en cuanto la partición es temporal. El atajo no era
un descuido: era correcto por accidente, bajo una suposición que nadie había escrito porque nunca
había hecho falta. Endurecer el protocolo de partición la invalidó, y la cifra de seguridad más
cargada del diseño resultó estar equivocada por un factor de 14.

Este es el segundo error de una serie de dos en el track de flujos de Sentinel (detección de
intrusiones sobre CICIDS2017, cascada Isolation Forest → XGBoost, 78 features de CICFlowMeter). El
primero puso la frontera de la partición en el sitio equivocado; este puso la frontera del reporte.
No hace falta conocer el primero para seguir este, pero la relación entre ambos es la conclusión.

## La arquitectura, y por qué un número importa más que los demás

La cascada tiene dos etapas:

- **Stage 1** — un Isolation Forest entrenado **exclusivamente sobre flujos BENIGN**. Decide si un
  flujo es anómalo. Al no ver nunca un ataque durante el ajuste, cualquier cosa estructuralmente
  distinta del tráfico normal puntúa bajo, haya sido vista su familia o no.
- **Stage 2** — un XGBoost que nombra la familia de ataque. **Solo ve lo que Stage 1 marcó.**

De ahí sale una propiedad estructural que gobierna el diseño entero: **el recall de Stage 1 es un
techo duro**. Lo que Stage 1 no marca sale como BENIGN y Stage 2 no lo ve nunca; ningún acierto de
Stage 2 puede recuperarlo. Por eso el umbral del forest no se optimiza con F1 sino con **F-beta con
β = 2**, que penaliza los falsos negativos por encima de los falsos positivos. La decisión es
explícita y está en la configuración, no enterrada en el `contamination` de sklearn:

```
score(x) <  t  →  anomalía (clase positiva, 1)
score(x) >= t  →  BENIGN   (clase negativa, 0)
```

Cuando se reporta "el X % de los ataques no supera Stage 1", ese X es la cifra que un ingeniero de
seguridad lee para decidir si el sistema es desplegable. Es el número que hay que medir bien.

## El código

`optimize_threshold()` recorre todos los puntos de operación que ofrece el conjunto de validación,
se queda con el que maximiza F-beta, y anota el punto de operación **de ese mismo conjunto**:

```python
scores = self._model.decision_function(X_val)
y_binary = (y_val != BENIGN_LABEL).astype(int)

best_t, best_fbeta = best_fbeta_threshold(scores, y_binary, beta=beta, ...)

self._threshold = best_t
y_pred_best = (scores < best_t).astype(int)
self._threshold_info = self._compute_operating_info(y_binary, y_pred_best, beta)
```

Hasta aquí no hay nada malo: la anotación es un registro legítimo de *de dónde salió el umbral*. El
error estaba una capa más arriba. `evaluate()` copiaba esa anotación dentro del dict de métricas de
test, al lado de accuracy y f1_macro, que sí eran de test:

```python
# ANTES
y_pred = self.predict(X_test)
metrics = {
    "accuracy":    accuracy_score(y_test, y_pred),
    "f1_macro":    f1_score(y_test, y_pred, average="macro"),
    "f1_weighted": f1_score(y_test, y_pred, average="weighted"),
}
try:
    op = self._if_model.get_operating_point_info()   # ← validación
except RuntimeError:
    pass                                             # no hubo búsqueda de umbral
else:
    metrics["if_precision"] = op["precision"]
    metrics["if_recall"]    = op["recall"]           # ← al lado de accuracy de test
```

El resultado en `training_summary.json` era un bloque `metrics` donde cuatro cifras venían de test y
cuatro de validación, sin marca de ninguna clase:

```json
"metrics": {
  "cascade_xgb": {
    "accuracy":  0.9612,
    "f1_macro":  0.7721,
    "if_recall": 0.985991   ← validación
  }
}
```

Nadie mintió y nadie se saltó una revisión. La suite estaba en verde,
porque cada función hacía exactamente lo que su test comprobaba.

## Cómo se detectó: aritmética, no intuición

No hubo sospecha metodológica. Hubo una suma que no cuadraba. El bloque de operating point trae los
recuentos crudos de la matriz de confusión:

```
tp + fp + tn + fn  =  4997 + 11912 + 13021 + 71  =  30001
```

y en el bloque `data` del mismo fichero:

```
"val_size":  30001,
"test_size": 30008,
```

30.001 no es 30.008. La matriz de confusión de la que salía `if_recall` estaba contando el conjunto
de validación. Merece la pena señalar que esto solo fue detectable porque el summary guardaba `tp`,
`fp`, `tn`, `fn` además de las tasas derivadas: con solo `recall: 0.986` no había nada que sumar.
Persistir los recuentos crudos junto a los ratios cuesta cuatro enteros y es lo que convirtió un
error conceptual en un error aritmético.

## La medición

Con el umbral **congelado** y medido sobre ambos conjuntos, en los tres protocolos de partición
disponibles (`random` es el split aleatorio original; `sub-label` y `class` son dos definiciones de
bloque temporal):

| Protocolo | S1 recall (validación) | S1 recall (test) | Δ |
|---|---|---|---|
| `random` | 0.978 | 0.979 | **+0.001** |
| `sub-label` | 0.986 | **0.804** | **−0.182** |
| `class` | 0.626 | **0.393** | **−0.233** |

## Por qué la fila `random` hace todo el trabajo de diagnóstico

Hay dos causas candidatas para un hueco entre validación y test:

**(a) Sesgo de selección.** El umbral es el argmax de F-beta sobre los puntos de operación que ofrece
ese conjunto concreto. Un argmax sobre una muestra finita sobreajusta esa muestra por construcción,
sin necesidad de que nada derive.

**(b) Deriva temporal.** Validación y test son momentos distintos de la captura, y la distribución de
scores cambia entre ellos.

La búsqueda es **literalmente el mismo código** en los tres protocolos: mismo `best_fbeta_threshold`,
mismo β, mismos candidatos, tamaños de conjunto comparables. Si la causa fuera (a), el hueco
aparecería en las tres filas. Aparece solo en las temporales, y en la aleatoria vale +0.001 — ruido,
y del signo contrario.

Luego es (b), y el mecanismo es estructural, no estadístico. Bajo el protocolo temporal el corte es
70/15/15 **por posición dentro de cada bloque**: validación es el 15 % **central** de cada bloque y
test el 15 % **final**. Validación está sistemáticamente más cerca de train en el tiempo. El score
del Isolation Forest deriva a lo largo de la ráfaga de ataque —una campaña de PortScan de veinte
minutos no produce flujos idénticos en el minuto 2 y en el minuto 18— y esa deriva es exactamente lo
que el protocolo temporal fue diseñado para exponer.

Con split aleatorio, validación y test son intercambiables **por construcción**: dos muestras
i.i.d. de la misma distribución. Sustituir una por otra es gratis, y por eso el atajo llevaba
funcionando desde siempre. El protocolo temporal las convierte en dos momentos distintos, y ahí la
sustitución empieza a mentir.

Hay una ironía que conviene no perder: **el split temporal no creó este problema, lo hizo visible.**
El bug llevaba en el código desde antes, produciendo un número correcto por accidente.

## El impacto

El complementario del recall de Stage 1 es la fracción de ataques que la cascada **no puede
recuperar por diseño**:

| | publicado | real |
|---|---|---|
| `sub-label` (default) | 1,4 % | **19,6 %** |
| `class` | 37 % | **61 %** |

Factor 14 sobre la cifra de seguridad más cargada del diseño, y en el protocolo secundario la lectura
pasa de "más de un tercio se pierde" a "casi dos tercios se pierden". Ambas son malas noticias; la
diferencia entre ellas es la diferencia entre un sistema que se despliega con vigilancia y uno que
no se despliega.

## Lo que no cambia, y por qué hay que decirlo

`accuracy`, `f1_macro` y `f1_weighted` **siempre** salieron de `predict(X_test)`. Son byte a byte
idénticas antes y después del arreglo. El bug afectaba exclusivamente a las cuatro cifras `if_*` del
bloque de métricas.

Eso importa porque el track de flujos tiene otro resultado publicado que depende de esas métricas
end-to-end: una descomposición que atribuye la caída de F1-macro entre protocolos a fuga por
casi-duplicados (0.148) frente a artefacto de taxonomía (0.475). Esa descomposición **se sostiene
entera** frente a este bug. *(No se sostuvo frente a uno posterior; ver la nota del principio.)* Delimitar qué parte de un resultado invalida un bug es parte del trabajo, y hacerlo mal en
cualquiera de las dos direcciones tiene coste: exagerar el alcance tira resultados válidos y quema
credibilidad; minimizarlo deja publicado lo que ya no se sostiene. La regla operativa es rastrear la
procedencia de cada cifra hasta la llamada que la produjo, no razonar por cercanía en el JSON.

## El arreglo

Cuatro cambios, y ninguno toca el modelo.

**Un método que mide el umbral congelado sobre cualquier conjunto.** El detector ya sabía calcular un
punto de operación; lo que no sabía era hacerlo fuera del conjunto de selección:

```python
def measure_operating_point(self, X, y, beta=None) -> dict[str, Any]:
    self._check_fitted()
    if beta is None:
        beta = float(self._threshold_info.get("beta", 1.0))

    scores   = self._model.decision_function(X)
    y_binary = (y != BENIGN_LABEL).astype(int)
    y_pred   = (scores < self._threshold).astype(int)   # umbral CONGELADO

    return self._compute_operating_info(y_binary, y_pred, beta)
```

**`_compute_operating_info` recalcula F-beta desde la matriz de confusión** en vez de recibirla de la
búsqueda. Es el cambio que hace la función reutilizable: sobre el conjunto de selección los dos
valores coinciden exactamente —`best_fbeta_threshold` deriva F-beta de la misma precisión y el mismo
recall—, y fuera de él no hay resultado de búsqueda que arrastrar. Un helper que depende de su
llamante es un helper que solo sirve en un sitio.

**`evaluate()` mide sobre test.** La búsqueda de validación se consulta únicamente para saber que
hubo umbral y con qué β:

```python
# DESPUÉS
try:
    # Solo para la beta, y para establecer que sí hubo umbral elegido.
    selection = self._if_model.get_operating_point_info()
except RuntimeError:
    pass
else:
    op = self._if_model.measure_operating_point(X_test, y_test, beta=selection["beta"])
    metrics["if_precision"] = op["precision"]
    metrics["if_recall"]    = op["recall"]
```

**El summary registra las dos, etiquetadas.** No se elimina la cifra de validación: se le pone
nombre. Las dos responden a preguntas distintas y las dos son útiles —"¿de dónde salió el umbral?" y
"¿qué hace con datos no vistos?"—; lo que no era admisible es que compartieran clave:

```json
"stage1_operating_point": {
  "cascade_xgb": {
    "selection": {
      "threshold": 0.09108978995918167, "beta": 2.0,
      "recall": 0.985991, "fpr": 0.47776, "fnr": 0.014009,
      "tp": 4997, "fp": 11912, "tn": 13021, "fn": 71
    },
    "test": {
      "threshold": 0.09108978995918167, "beta": 2.0,
      "recall": 0.803628, "fpr": 0.490897, "fnr": 0.196372,
      "tp": 4076, "fp": 12241, "tn": 12695, "fn": 996
    }
  }
}
```

Mismo `threshold` en los dos bloques: es la prueba de que medir no lo movió. Y `4076+12241+12695+996
= 30008 = test_size`.

**Los tests que fijan la propiedad**, porque el arreglo sin ellos es una corrección puntual y no un
invariante: `selection` suma `val_size`; `test` suma `test_size`; `metrics.if_recall` es el de test;
medir sobre el conjunto de selección reproduce exactamente el punto guardado; medir sobre otro
conjunto cuenta *ese* otro; y medir no mueve el umbral. El primer par de tests es el que habría
detectado el bug original, y es interesante que la forma de escribirlo sea aritmética —sumar la
matriz de confusión y comparar con un tamaño— y no semántica.

Además, el docstring de `get_operating_point_info()` dice ahora explícitamente que devuelve **un
estadístico de ajuste**, no una estimación de rendimiento sobre datos no vistos. El método sigue
existiendo y sigue siendo el correcto para su pregunta; lo que faltaba era que su nombre no
prometiera la otra.

---

Los dos errores de este proyecto son el mismo error a dos niveles. **Un número honesto sobre el
conjunto equivocado sigue siendo un número deshonesto.** El primero puso la frontera de la
*partición* en el sitio equivocado; el segundo, la del *reporte*. Los dos sobrevivieron a una
suite en verde, porque ningún test puede comprobar qué pregunta creías
estar contestando. Lo único que los detectó, las dos veces, fue construir el protocolo de control que
aísla un factor.
