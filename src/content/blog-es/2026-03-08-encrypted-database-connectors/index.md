---
title: 'Custodiar la cadena de conexión de otra persona'
description: 'Una herramienta de migración necesita credenciales de una base de datos que no le pertenece. Qué guarda la capa de conectores, qué se niega a guardar y dónde se acaban de verdad las garantías.'
tags: ["Security", "Databases", "Architecture"]
pubDate: '2026-03-08'
coverImage: './cover.jpg'
---

La herramienta hace algo sencillo de describir e incómodo de asegurar: la apuntas a una base de datos, introspecciona el esquema, mapeas tablas y columnas contra un destino, y genera el script `INSERT INTO ... SELECT` que mueve los datos — y lo ejecuta, si se lo pides. Para hacer cualquiera de esas cosas necesita credenciales de conexión de una base de datos que no le pertenece.

Eso es algo genuinamente incómodo de construir. Le estás pidiendo a alguien que te entregue una cadena de conexión de producción. El diseño tiene que ganárselo, y «lo guardamos cifrado» no basta por sí solo.

Este artículo va de la capa de conectores en concreto: qué guarda, qué deliberadamente no guarda y dónde se agotan las garantías.

## Regla uno: sé exacto sobre qué capa toca qué

Antes de cualquier pregunta sobre cifrado, la pregunta útil es qué necesita realmente cada parte de la herramienta.

La parte de mapeo necesita el esquema — nombres de tablas, tipos de columnas, claves foráneas, índices. No necesita ni una sola fila de datos para hacer su trabajo, así que la introspección lee únicamente de `information_schema` y de los catálogos del sistema, y nada en la ruta de mapeo lanza un `SELECT` contra una tabla de usuario.

La parte de ejecución es lo contrario, y difuminar ambas sería deshonesto. Ejecutar una migración significa mover filas: el ejecutor recorre las sentencias generadas y las ejecuta contra el destino, tomando antes una copia de seguridad de las tablas de destino. Esa ruta lee y escribe datos de usuario por definición. Es el sentido entero de la funcionalidad.

Así que la frontera no es «nunca tocamos tus datos» — eso sería una frase bonita y falsa. Es que la herramienta nunca lee una fila para construir el mapa, y solo toca filas cuando le pides explícitamente que ejecute una migración. Son rutas de código separadas, y la que mueve datos es opt-in, se respalda de antemano y está disponible como simulacro que hace rollback al final.

Trazar esa línea es lo que hace tratables las preguntas sobre cifrado. Las credenciales se custodian de forma continua; los datos solo se tocan durante una operación que tú has iniciado.

## Regla dos: la clave se deriva, no se almacena

Las cadenas de conexión son la parte que no puedes eliminar por diseño — reconectar en una visita posterior implica custodiarlas de alguna manera.

Se cifran con AES-256-GCM bajo una clave derivada de la passphrase del usuario con Argon2id, con m=64 MiB, t=3, p=1. La clave se deriva bajo demanda y nunca se escribe en la base de datos. Lo que la base de datos guarda es un texto cifrado, un nonce y una sal.

Y ahora la parte que la mayoría de los artículos se salta, porque es la que debilita la afirmación. La clave tiene que existir en algún sitio mientras usas la herramienta, y en este diseño ese sitio es el servidor: la derivación ocurre en Python, y la clave derivada se cachea en una sesión de Redis durante la vida de esa sesión y se inyecta en cada petición. Así que la afirmación honesta tiene dos mitades:

- **En reposo, sin sesión activa, el servidor no puede descifrar.** El material almacenado es texto cifrado, nonce y sal, y no hay ninguna clave junto a él.
- **Durante una sesión activa, el servidor sí puede descifrar.** Tiene que poder. Es lo que hace que la conexión se abra.

Lo que acota esa ventana es la higiene de sesión y no la criptografía: el token de sesión es una cookie httpOnly con alcance por proyecto, el middleware comprueba que el propietario de la sesión coincide con el usuario autenticado e invalida la sesión de raíz cuando no coinciden, y las sesiones caducan por temporizador con una tarea de limpieza detrás.

Esa es una propiedad más débil que la de un gestor de contraseñas donde la derivación ocurre en el navegador y el servidor es ciego — construí uno de esos también, y [ahí el intercambio va en el otro sentido](/es/2026-07-25-password-manager-zero-knowledge/) porque nada en aquel diseño necesita que el servidor actúe sobre el texto en claro. Una herramienta cuyo trabajo es abrir conexiones a tu base de datos no puede ser ciega a las credenciales en el momento en que las abre.

Una cosa sí se deriva de todo esto: no hay ningún proceso en segundo plano que reconecte en tu nombre. No porque el backend no pudiera durante una sesión — podría — sino porque no lo construí, y fuera de una sesión no hay clave con la que hacerlo. Eso descarta algunas funcionalidades que me habrían gustado, diffs de esquema programados entre ellas, y es el intercambio correcto. Un backend que puede conectarse silenciosamente a tu base de datos de producción de forma programada es algo mucho más grande en lo que confiar.

## Regla tres: cifra en reposo, y sé preciso sobre qué cubre eso

Los metadatos de esquema cacheados también se cifran en reposo. Los nombres de tablas y columnas no son información neutra — `patients`, `salary_bands`, `internal_pricing_tiers` describen un negocio con bastante detalle, y un esquema filtrado es un mapa decente para cualquiera que planee un ataque real.

Lo que «cifrado en reposo» no cubre, y sobre esto intento ser exacto en la documentación:

- **Los recuentos de filas y los tamaños en bytes** se guardan sin cifrar, porque la interfaz ordena por ellos.
- **Las marcas de tiempo** de conexión y de refresco están en claro.
- El cifrado en reposo protege frente a un disco robado o un volcado de la base de datos. No hace nada frente a un proceso en ejecución comprometido, que por definición custodia material descifrado.

Las afirmaciones vagas son peores que las estrechas y honestas. «Cifrado en reposo» se usa a menudo para insinuar una garantía que nadie ha comprobado de verdad.

## Regla cuatro: TLS no es opcional ni silencioso

Todos los conectores exigen TLS, con verificación de certificado activada. Los usuarios pidieron un interruptor de «saltar verificación», que es la petición estándar cuando alguien se topa con un certificado autofirmado en una máquina de staging.

Lo añadí, con un alcance estrecho: es por conexión, exige teclear el nombre de host para confirmar, y después la conexión queda marcada permanentemente como no verificada en la interfaz. El interruptor existe porque, si no, la gente pega credenciales en una herramienta que «simplemente funciona» en otro sitio, lo cual es peor. Hacer que el camino inseguro esté disponible pero visiblemente degradado es mejor que no ofrecerlo y empujar a la gente fuera de la plataforma.

## Qué cambiaría

Derivar la clave de una passphrase hace que el modelo de seguridad sea fácil de enunciar y la experiencia de uso genuinamente peor — cada sesión empieza con un paso de desbloqueo, y Argon2id a 64 MiB no es una operación rápida por diseño. Algunos equipos no lo aceptarán para una herramienta interna.

La alternativa es un KMS en condiciones con cifrado de sobre: una clave de datos por conexión, cifrada bajo una clave maestra custodiada en un módulo de seguridad hardware, con un registro de auditoría de cada llamada de descifrado. Eso mueve la confianza de «la contraseña del usuario» a «el KMS del proveedor cloud y mi política de IAM», lo cual es un intercambio distinto más que uno estrictamente mejor — pero es el que hacen la mayoría de los sistemas en producción, y es la versión que construiría si esto tuviera usuarios reales.
