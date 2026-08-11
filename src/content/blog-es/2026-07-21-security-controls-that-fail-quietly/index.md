---
title: 'Controles de seguridad que fallan en silencio'
description: 'Cinco formas en que un control de seguridad sigue ejecutándose, sigue registrando y deja de hacer su trabajo - y por qué ninguna aparece como error.'
tags: ["Security", "Architecture", "Engineering"]
pubDate: '2026-07-21'
updatedDate: '2026-07-25'
coverImage: './cover.jpg'
---

Un control que revienta se arregla en la primera petición. Un control que silenciosamente no hace nada sobrevive tanto tiempo como nadie lo compruebe, y durante todo ese tiempo se lee como protección.

Esa asimetría es lo que hace que el cableado de seguridad sea distinto de la mayoría del código. Si un serializador se rompe, algo devuelve un 500. Si un limitador de tasa está contando el cubo equivocado, la aplicación se comporta exactamente igual que antes — mismas respuestas, misma latencia, mismos logs limpios. La ausencia de protección no tiene firma.

Abajo hay cinco formas en que esto ocurre, todas salidas de auditar un stack Django + React propio con Prometheus y Grafana detrás. Ninguna lanzó una excepción. La mayoría llevaban meses ahí.

## Middleware que se ejecuta antes que aquello que inspecciona

Django procesa `MIDDLEWARE` de arriba abajo a la entrada. Poner tu middleware de seguridad arriba del todo parece correcto — la seguridad primero — y te coloca por encima de `AuthenticationMiddleware`, que es lo que engancha `request.user`:

```python
    'myapp.middleware.SecurityLoggingMiddleware',
    'myapp.middleware.RateLimitMiddleware',

    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
```

Así que `request.user` todavía no existe en ninguno de los míos. Un logger de seguridad que registra quién hizo qué escribe `user=None` en cada fila. Un limitador de tasa que prefiere un cubo por usuario cae al cubo por IP en cada petición.

Ambos estaban escritos a la defensiva, con una guarda `hasattr(request, 'user')` — y esa guarda es exactamente lo que hace invisible el bug. Sin ella, la primera petición lanza un `AttributeError` y arreglas el orden en cinco minutos. Con ella, obtienes un logger que se ejecuta para siempre y nunca aprende la identidad de nadie.

Programar a la defensiva alrededor de un invariante del framework no hace robusto el código. Convierte una mala configuración ruidosa en un cambio silencioso de comportamiento.

## Un escáner apuntado al canal que la API no usa

Ese mismo middleware buscaba por patrones cadenas de inyección SQL y XSS en `request.POST`.

Todas las vistas de ese proyecto leen `json.loads(request.body)`. Django solo rellena `request.POST` para codificaciones de formulario — para `application/json` está vacío. Así que el escáner se ejecutaba en cada petición, iteraba sobre un diccionario vacío e informaba de que todo estaba limpio.

Lo que me parece instructivo es que el control es correcto en aislamiento. Los patrones están bien, el cableado está bien, los tests sobre la lista de patrones pasarían. Está apuntado a un canal que la aplicación dejó de usar el día en que se convirtió en una API JSON, y nada en el código conecta esos dos hechos.

Cualquier control que inspecciona «la petición» está en realidad inspeccionando un accesor concreto. Cuando cambia el transporte, ese accesor deja de ser silenciosamente el lugar donde están los datos.

## Limitadores redundantes con una única dependencia compartida

El login de ese proyecto estaba protegido por triplicado: un decorador `@ratelimit(rate='15/5m')`, una comprobación dentro de la vista que saltaba a los 5 fallos en 15 minutos, y una comprobación de middleware que saltaba a los 10 en 5. Por separado, había scopes de throttle de DRF declarados en settings, y un `throttle_classes.py` que definía clases para implementarlos que nada importaba nunca.

Las capas venían de la incertidumbre: no estaba seguro de que la capa anterior funcionase, así que añadía otra. El resultado es que nadie puede enunciar el límite efectivo sin trazar tres rutas de código.

Pero el problema real está debajo. Todos los contadores vivían en la caché de Redis, configurada con `'IGNORE_EXCEPTIONS': True`. Con Redis caído, `cache.get` devuelve el valor por defecto, cada contador se lee vacío, y los tres limitadores fallan abiertos simultáneamente — junto con el bloqueador de IPs, que nunca alcanza su umbral. Tres controles de aspecto independiente, una dependencia compartida, y esa dependencia configurada para tragarse sus propios fallos.

La redundancia era teatro. Nunca fueron independientes, y el flag que hizo que fallaran a la vez venía heredado de una configuración de caché donde ignorar excepciones es un valor por defecto perfectamente razonable.

Fallar abierto es a veces lo correcto para la limitación de tasa — una caída de la caché no debería dejar fuera a todos los usuarios. Pero eso tiene que ser una decisión con una alarma encima, no una propiedad que adquieres por accidente.

## Una frontera de confianza implementada siete veces

`get_client_ip` existía siete veces en aquel código: cinco copias en un mismo módulo de middleware, una en el gestor de sesiones, una en las utilidades de logging. Las siete leían la primera entrada de `X-Forwarded-For`.

El nginx que había delante fijaba esa cabecera con `$proxy_add_x_forwarded_for`, que *añade* a lo que el cliente haya mandado. Una petición que llega con `X-Forwarded-For: 1.2.3.4` produce `1.2.3.4, <cliente real>` — así que el primer elemento está bajo control del atacante. Ese valor alimentaba la limitación de tasa por IP, el bloqueo por IP y el log de auditoría.

El argumento habitual contra el copiar y pegar es la duplicación. El real es la propiedad: siete oportunidades de arreglar un bug, y ningún sitio único donde arreglarlo. La extracción de la IP del cliente es una frontera de confianza, y una frontera de confianza que aparece siete veces no es de nadie.

El arreglo es aburrido — una función, en un módulo, que sabe cuántos proxies tiene delante y lee por el extremo correcto. La razón por la que importa es que convierte «¿es correcto nuestro manejo de XFF?» de una auditoría en una pregunta con una sola respuesta.

## Paneles que no distinguen cero de ausente

Un panel de Grafana vacío y una métrica que legítimamente vale cero se ven idénticos.

El stack scrapeaba un endpoint `/metrics` hecho a mano que exponía dos gauges, uno de los cuales contaba `connection.queries` — una lista que Django solo rellena cuando `DEBUG` está activado, así que marca cero en cualquier despliegue correcto. `django_prometheus` estaba en `INSTALLED_APPS` pero su middleware nunca se añadió, sus URLs nunca se incluyeron, y el backend de base de datos era el normal en lugar de la variante instrumentada. La librería aportaba un import y nada más.

De seis paneles del dashboard, tres funcionaban. Uno consultaba una métrica de `django_prometheus` que habría producido el middleware deshabilitado. Uno consultaba `django_db_connections_total` mientras el exportador emitía `django_db_connections`, sin el sufijo. Uno consultaba una métrica de cAdvisor sin ningún cAdvisor en el fichero de compose. Un cuarto job de Prometheus scrapeaba Postgres en el 5432 por HTTP, donde habla su propio protocolo binario.

Todos esos fallos se dibujan como una línea plana, que de un vistazo se lee como un sistema tranquilo. Grafana te dirá que una consulta no devolvió datos si miras el panel en modo edición; no te lo dirá desde el dashboard, y el dashboard es lo único que mira nadie.

La comprobación que caza esto es trivial y casi nadie la hace: consulta tus nombres de métrica directamente contra Prometheus y confirma que cada uno existe. No que el valor sea razonable — que la serie esté ahí siquiera.

## Instalado no es activado

El patrón que ata todo lo demás: dependencias y ajustes que describen una intención que nada implementa.

`django-csp` estaba en los requirements y nunca se añadió al middleware. `argon2-cffi` y `bcrypt` estaban fijados bajo un encabezado de «Password validation & security» mientras `PASSWORD_HASHERS` no se fijó nunca, así que el PBKDF2 por defecto de Django era lo que realmente hasheaba las contraseñas. Seis bloques de ajustes con nombres como `MAX_FAILED_LOGIN_ATTEMPTS` y `LOCKOUT_DURATION_MINUTES`, leídos por nada. `DEBUG` escrito a fuego en lugar de leído del entorno, lo que convertía cada rama `if not DEBUG` en código muerto: sin HSTS, sin redirección SSL, y cookies que nunca recibían su flag de seguras.

Mi favorito era un ajuste de JWT que nombraba una clase serializadora que no existe. Nunca dio error — porque ninguna URL enrutaba la vista que la habría cargado. Un ajuste roto, mantenido en silencio por una segunda carencia, protegido por un limitador de tasa que guardaba cuidadosamente un endpoint que devuelve 404.

Un fichero de requirements es el sitio más barato de un proyecto donde expresar una intención de seguridad, y un bloque de ajustes es el segundo más barato. Eso es exactamente lo que hace que ambos no sean de fiar como descripción de lo que hace un sistema.

## Dos hábitos que habrían cazado casi todo esto

**Verifica el cableado, no la lógica.** No tenía ningún test de que una petición desde una IP limitada reciba un 429, ni de que un evento de seguridad registrado lleve un ID de usuario, ni de que una petición con una cadena de inyección en un cuerpo JSON se marque. Los tests unitarios sobre la lista de patrones habrían pasado mientras el escáner miraba un diccionario vacío. Todos los controles de aquí eran correctos en aislamiento y estaban rotos en integración, y la integración es la parte que nunca comprobé.

**Convierte el silencio en alarma.** Todos estos se presentan como ausencia: un usuario `None`, un contador que nunca salta, un panel a cero, una rama que nunca se ejecuta. Si un control no puede distinguir «no ha pasado nada» de «no estoy funcionando», no está informando sobre el sistema. Está informando sobre sí mismo.

El [diseño de cifrado del mismo proyecto](/es/2026-07-21-password-manager-encryption/) tenía un fallo grave propio: el servidor almacenaba la clave con la que descifraba, algo que [reconstruí después](/es/2026-07-25-password-manager-zero-knowledge/). Pero falló de otra manera, y ese es el contraste que me resulta útil. Aquel fallo era legible en el código que lo implementaba — escribir el diseño es lo que lo expuso. Los controles de arriba estaban ensamblados a partir de valores por defecto y paquetes instalados, y un valor por defecto no anuncia cuándo deja de aplicarse.
