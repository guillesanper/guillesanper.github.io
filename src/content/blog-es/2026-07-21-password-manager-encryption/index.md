---
title: 'Cifrado de sobre en un gestor de contraseñas autoalojado'
description: 'Cómo está dispuesto el cifrado en un gestor de contraseñas en Django: una clave envuelta por secreto, qué compra eso y dónde se detiene el diseño actual.'
tags: ["Security", "Cryptography", "Web"]
pubDate: '2026-07-21'
updatedDate: '2026-07-25'
coverImage: './cover.jpg'
---

> **Este artículo describe un diseño que desde entonces he reemplazado.** Todo lo de abajo era cierto cuando lo escribí: el servidor custodiaba la clave maestra derivada y podía descifrar cualquier bóveda. Reconstruí esa parte — la derivación ahora ocurre en el navegador y el servidor nunca ve la clave — en [Sacar la criptografía del servidor](/es/2026-07-25-password-manager-zero-knowledge/). Lo dejo publicado porque el compromiso que describe es el que realmente tuve que asumir.

Esto es un gestor autoalojado de contraseñas y ficheros: un monolito Django que sirve una SPA en React/TypeScript, con PostgreSQL, Redis y MinIO detrás. El trabajo de diseño que merece la pena contar es cómo está dispuesto el cifrado — un sobre por secreto, y qué compra y qué no compra dado que el servidor sigue custodiando la clave maestra.

## Una clave por entrada, envuelta bajo la clave maestra

El enfoque obvio es derivar una clave de la contraseña maestra y cifrarlo todo con ella. Funciona, y encarece dos problemas posteriores.

En su lugar, cada entrada genera su propia clave de cifrado y su propia sal. La contraseña se cifra bajo esa clave por entrada, y la clave por entrada se cifra bajo una clave derivada de la clave maestra:

```python
def encrypt_password(password, master_key, algorithm="AES"):
    algorithm_key = os.urandom(32) if algorithm in ["AES", "ChaCha20"] else os.urandom(16)
    salt = os.urandom(16)  # Generar una salt única para esta entrada
    encrypted_key = encrypt_with_master_key(algorithm_key, master_key, salt)

    if algorithm == "AES":
        iv = os.urandom(16)
        cipher = Cipher(algorithms.AES(algorithm_key), modes.CFB(iv), backend=default_backend())
```

`encrypt_with_master_key` ejecuta PBKDF2-SHA256 sobre la clave maestra con esa sal por entrada, y luego envuelve la clave de entrada de 32 bytes bajo el resultado. Cada fila acaba guardando cuatro cosas: el texto cifrado, la clave envuelta, el IV y la sal.

De esta disposición salen dos propiedades.

**La reutilización de sal es estructuralmente imposible.** La sal es `os.urandom(16)` evaluado en cada llamada, no un valor por defecto de columna — así que no puede volverse silenciosamente compartida entre filas, que es la forma habitual en que esto sale mal.

**La rotación es barata por construcción.** La contraseña maestra nunca cifra datos; cifra 32 bytes por entrada. Cambiarla implica desenvolver cada `encrypted_key`, volver a envolverla bajo la nueva clave derivada y reescribir una única columna. Los blobs de texto cifrado — hasta 100 MB en el caso de los ficheros almacenados — no se mueven nunca. Eso importa aquí porque el almacenamiento de ficheros comparte esta ruta: recifrar una bóveda de documentos en cada cambio de contraseña haría la funcionalidad inservible.

El endpoint de rotación devuelve actualmente un 501. La disposición lo soporta; la implementación aún no está escrita.

## Dónde vive la clave maestra, y qué acota eso

La clave maestra derivada se persiste. `set_master_key` ejecuta PBKDF2 sobre la contraseña maestra, codifica el resultado en base64 y lo guarda:

```python
    def set_master_key(self, raw_key):
        master_key = self.derive_master_key(raw_key)
        master_key_str = base64.b64encode(master_key).decode('utf-8')

        self.hashed_key = master_key_str  # Almacena la clave derivada sin hashear de nuevo
        self.save()
```

Esa es la decisión sobre la que está construido el resto del sistema, así que merece la pena enunciar sus consecuencias con exactitud en lugar de con los términos vagos con los que esto se suele describir.

Significa que el servidor puede descifrar. Cualquier ruta de petición puede cargar ese valor y desenvolver cualquier clave de entrada, que es lo que hace posibles las funcionalidades del lado servidor de la siguiente sección. También significa que la clave y el texto cifrado que desenvuelve viven en la misma base de datos, así que un volcado de esa base de datos contiene ambas mitades — el sobre por entrada no ayuda contra eso, porque lo que abre todos los sobres está a una columna de distancia.

Lo que la disposición sigue comprando en esas condiciones es más estrecho pero real: ninguna clave individual cifra dos secretos, las sales no pueden colisionar, y una rotación toca 32 bytes por entrada en lugar de la bóveda entera. Son propiedades sobre el radio de impacto y sobre el coste, no sobre dejar fuera al operador.

Dejar fuera al operador es otra construcción distinta, y solo hay una que funcione: derivar en el navegador, mantener la clave en memoria allí, y no enviarle al servidor más que texto cifrado. El servidor nunca recibe la contraseña maestra y no puede descifrar en ningún momento. Eso es lo que significa «conocimiento cero» cuando un gestor de contraseñas lo reclama, y este diseño no lo tiene.

## Qué compra un servidor que descifra, y qué costaría renunciar a él

Un servidor que puede descifrar es lo que hace posibles varias funcionalidades. El caso más claro es el panel de seguridad:

```python
@api_view(['GET'])
def api_security_analysis(request):
    for entry in password_entries:
                decrypted_password = decrypt_password(
                    entry.encrypted_password, entry.encrypted_key, entry.iv_or_nonce,
                    master_key_entry.hashed_key.encode(),
                    entry.salt, entry.encryption_algorithm
                ).decode('utf-8')
                entropy = calculate_password_entropy(decrypted_password)
                breach_info = check_password_breach_sync(decrypted_password)
```

Descifra todas las entradas del usuario para puntuar su entropía y comprobarlas contra Have I Been Pwned. La subida de ficheros funciona igual, añadiendo una segunda capa Fernet bajo una clave del sistema para que el servidor pueda manejar ambas mitades.

Mover la derivación al navegador acabaría con eso. El análisis tendría que ejecutarse en el cliente, redescargando cada entrada para hacerlo. La búsqueda en servidor dejaría de funcionar para cualquier campo que merezca la pena cifrar. El pipeline de ficheros perdería su capa interna. Ese es el intercambio real — no «más seguro frente a menos seguro», sino un servidor que descifra con un conjunto rico de funcionalidades frente a un servidor ciego con uno mucho más pequeño.

No hay ninguna llamada a `crypto.subtle` en el frontend todavía, así que esa migración sería una reescritura de todas las rutas criptográficas y no un parche.

## Dos cosas que arreglaría antes de dar la criptografía por terminada

**Los cifradores no están autenticados.** Todas las rutas usan AES-CFB o ChaCha20 en crudo, sin ningún MAC en `encryption_utils.py`. CFB es maleable: voltear un bit del texto cifrado voltea el bit correspondiente del texto en claro y estropea un bloque, sin nada que lo detecte. Como las claves envueltas se almacenan de la misma forma, cualquiera con acceso de escritura a la base de datos puede corromper una clave hasta convertirla en una que descifre a bytes influidos por el atacante, y la única defensa a la vuelta es un `try` que captura `UnicodeDecodeError`. AES-GCM o ChaCha20-Poly1305 cerrarían esto, y ambos encajan directamente en lo que ya hay.

**La sal de la clave maestra es un valor por defecto de columna.** Está declarada como `default=get_random_string(32)`, que Django evalúa una sola vez al importar en lugar de por fila, y nada se la asigna después — así que todos los usuarios de un despliegue comparten una única sal de clave maestra, lo que hace que esas derivaciones sean precomputables como conjunto. Las sales por entrada son correctas; esta necesita ser un callable.

Ambos son cambios pequeños. Ninguno se ve desde fuera, que es más o menos la cuestión: las partes de un diseño criptográfico con más probabilidad de estar mal son aquellas de las que no depende ninguna funcionalidad.
