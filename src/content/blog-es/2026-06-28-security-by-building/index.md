---
title: 'No he cursado ninguna asignatura de seguridad. Aun así, no he parado de construirla.'
description: 'Sobre aprender criptografía y modelado de amenazas como consecuencia de construir sistemas, y por qué apunto a trabajo de plataforma y no a trabajo de seguridad.'
tags: ["Security", "Career", "Engineering"]
pubDate: '2026-06-28'
coverImage: './cover.jpg'
---

Mi carrera no tiene ningún módulo de ciberseguridad. Tiene aprendizaje automático, programación evolutiva, ingeniería del conocimiento, big data — una buena base, y nada en absoluto sobre cómo se rompen los sistemas.

Acabé aprendiendo bastante de todo eso igualmente, porque cada proyecto que de verdad quería terminar llegaba a un punto en el que no podía seguir adelante sin saberlo.

## Llega como un bloqueo, no como un temario

El gestor de contraseñas es el ejemplo más claro. Me puse a construir una aplicación web full-stack; la criptografía iba a ser una función que llamaría y punto. Entonces las preguntas empezaron a llegar en orden:

¿Dónde vive la clave de cifrado? En el servidor. ¿Dónde vive la base de datos? También en el servidor. Así que un atacante que consiga una consigue la otra, y el cifrado no me ha comprado nada.

Eso no es una pregunta de criptografía. Es una pregunta de arquitectura que la criptografía existe para responder, y me obligó a bajar a los detalles que hay debajo: que un sobre por entrada no compra nada frente a un volcado de la base de datos cuando la clave que abre todos los sobres está a una columna de distancia, que una sal declarada como valor por defecto de una columna de Django se evalúa una sola vez al importar y queda silenciosamente compartida por todos los usuarios del despliegue, que AES-CFB es maleable y no había ningún MAC en ninguna parte que se diera cuenta. Nada de eso estaba en un plan de estudios. La aplicación estaba mal hasta que lo entendí.

La herramienta de mapeo de bases de datos fue por el mismo camino. Quería introspeccionar esquemas, lo que significaba custodiar la cadena de conexión de otra persona, lo que significaba enfrentarme a cuánta confianza le estaba pidiendo exactamente. La respuesta que salió de ahí — que la parte de mapeo lee `information_schema` y nada más, y que solo una ejecución explícita de migración llega a tocar una fila de usuario — es una decisión de seguridad que parece una decisión de alcance. La mayoría de las buenas lo parecen.

Incluso la cascada de detección de intrusiones: la arquitectura salió de preguntarme cuánto cuesta un ataque no detectado frente a una falsa alarma. Eso es modelado de amenazas. Simplemente no lo llamaba así por aquel entonces.

## Con qué me deja eso, y con qué no

Quiero ser preciso aquí, porque «autodidacta en seguridad» abarca un rango enorme.

Lo que tengo: una comprensión funcional de criptografía aplicada a datos en reposo y en tránsito, la costumbre de diseñar a partir de un modelo de amenazas explícito, y suficiente experiencia como para saber qué problemas no resuelve el cifrado. Puedo mirar un sistema y preguntarme qué pasa cuando se filtra la base de datos, cuando el proceso está comprometido, cuando el cliente es malicioso — y dar respuestas distintas a cada una.

Lo que no tengo: experiencia ofensiva. Nunca he escrito un exploit, ni he hecho un CTF serio, ni he hecho ingeniería inversa de un binario. No sé qué aspecto tiene el malware actual ni cómo funciona la ingeniería de detección en la práctica. Mi conocimiento de las vulnerabilidades de seguridad de memoria es de libro, no de manos. Si necesitas a alguien que entre en sistemas o que lleve una respuesta a incidentes, ese no soy yo, y fingir lo contrario nos haría perder el tiempo a los dos.

Esa carencia es real y condiciona lo que estoy buscando.

## Por qué trabajo de plataforma y no trabajo de seguridad

Los puestos de seguridad se dividen sobre todo en dos formas. Una es adversaria — encontrar el fallo, ejecutar la campaña, responder al incidente. La otra es constructiva — construir sistemas en los que el camino inseguro sea difícil y el seguro sea el que viene por defecto.

Soy útil en la segunda y sería mediocre en la primera. Lo que me gusta es el trabajo de diseño: el punto en el que decides que el backend no pueda descifrar las credenciales que almacena, o que la herramienta nunca lance una consulta contra datos de usuario. Esas decisiones se toman mientras se construye el sistema, las toma quien lo está construyendo, y cierran clases enteras de problemas antes de que nadie tenga que detectar nada.

Que es por lo que apunto a Platform Engineering, Cloud Engineering y DevSecOps antes que a una trayectoria de analista de seguridad. Quiero estar en el lado que construye el camino asfaltado — el pipeline donde los secretos no están en el repositorio porque hay una vía mejor que además es la más fácil, la infraestructura donde el mínimo privilegio es el valor por defecto porque alguien lo puso así.

La seguridad como propiedad del sistema, decidida en tiempo de construcción. No un panel que alguien vigila a las 3 de la mañana.
