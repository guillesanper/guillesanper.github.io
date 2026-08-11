---
title: 'Sacar la criptografía del servidor'
description: 'El diseño anterior guardaba la clave maestra derivada a una columna del texto cifrado que desenvolvía; esta es la reconstrucción que dejó ciego al servidor, y las partes que sigue sin poder proteger.'
tags: ["Security", "Cryptography", "Web"]
pubDate: '2026-07-25'
coverImage: './cover.jpg'
---

La última vez que escribí sobre este gestor de contraseñas dije que el servidor podía descifrar todas las bóvedas que almacenaba, que la disposición de sobres compraba radio de impacto y coste de rotación en lugar de exclusión del operador, y que dejar fuera al operador era una construcción completamente distinta. Desde entonces he construido esa construcción. Esto es lo que se movió, y lo que sigue sin comprar.

El stack no cambia: un monolito Django que sirve una SPA en React/TypeScript, con PostgreSQL, Redis y MinIO detrás.

## El diseño antiguo guardaba la clave que lo abría todo

La v1 tenía un modelo `MasterKey`. `set_master_key` ejecutaba PBKDF2 sobre la contraseña maestra y escribía la salida en una columna llamada `hashed_key`:

```python
    def set_master_key(self, raw_key):
        master_key = self.derive_master_key(raw_key)
        master_key_str = base64.b64encode(master_key).decode('utf-8')

        self.hashed_key = master_key_str  # Almacena la clave derivada sin hashear de nuevo
        self.save()
        return master_key
```

El nombre de la columna es la única parte de eso que suena segura. No es un hash. Es la clave de cifrado, codificada en base64, sentada en la misma base de datos que el texto cifrado que desenvuelve. La sal que tenía al lado estaba declarada como `default=get_random_string(32)`, que Django evalúa una sola vez al importar, así que todos los usuarios de un despliegue compartían una sal. `verify_master_key` imprimía por stdout tanto la clave derivada como la almacenada.

Ese modelo ya no está. La migración `0025_purge_legacy_crypto` elimina la tabla y, con ella, las columnas en claro de la v1.

## La derivación ahora ocurre en el navegador, en un solo fichero

El cliente deriva una clave maestra con Argon2id, y luego la divide en dos subclaves separadas por dominio con HKDF:

```ts
async function hkdf(ikm: Uint8Array, info: string, length = 32): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: utf8(info) },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

export const deriveAuthKey = (mk: Uint8Array): Promise<Uint8Array> => hkdf(mk, 'auth');
export const deriveEncKey  = (mk: Uint8Array): Promise<Uint8Array> => hkdf(mk, 'enc');
```

Argon2id viene de `hash-wasm`, no de WebCrypto — `crypto.subtle` no tiene ninguna KDF con coste en memoria, y PBKDF2 con cualquier número de iteraciones es la primitiva equivocada para una contraseña que guarda una bóveda. Los parámetros son m=64 MiB, t=3, p=4, y se almacenan en el servidor junto a la sal para que subir el coste más adelante no deje colgadas las bóvedas existentes.

Dos ficheros del frontend llaman a `crypto.subtle`. Uno es este módulo. El otro lo llama una vez, para `digest('SHA-1', …)`. Toda derivación, envoltura y operación AEAD vive en un único fichero, que es la propiedad que realmente quería: hay un solo sitio que auditar.

La separación de dominios es la parte que sostiene el peso. `AuthKey` va al servidor. `EncKey` nunca sale del navegador. Como HKDF es unidireccional, tener la primera no dice nada sobre la segunda.

## El servidor custodia un verificador y una caja sellada

`UserCrypto` reemplazó a `MasterKey`. Almacena cuatro cosas, ninguna de las cuales reconstruye nada:

```python
    kdf_salt = models.CharField(max_length=64)
    kdf_params = models.JSONField(default=dict)
    auth_key_hash = models.CharField(max_length=255)
    wrapped_vault_key = models.TextField()

    def set_auth_key(self, auth_key_b64):
        self.auth_key_hash = make_password(auth_key_b64)
```

`make_password` pasa por `PASSWORD_HASHERS`, con `Argon2PasswordHasher` en primer lugar. Así que el valor almacenado es Argon2id sobre una clave ya derivada — un verificador, no la clave. La propia clave de bóveda son 32 bytes aleatorios envueltos con AES-256-GCM bajo `EncKey`, que el servidor no ha visto nunca.

Devolverle `wrapped_vault_key` a su propio usuario autenticado no filtra nada, porque desenvolverlo exige derivar `EncKey` de la contraseña maestra. Equivocarse en eso es exactamente cómo falló la v1, así que tengo un test que comprueba que `UserCrypto` no tiene ningún campo llamado `master_key`, `enc_key`, `vault_key` o `password`, y que `auth_key_hash` empieza por `argon2`. Es un test tosco. Habría cazado el bug original.

## La rotación reenvuelve 32 bytes y nunca toca los datos

La clave de bóveda nunca cambia. Rotar la contraseña maestra la vuelve a envolver:

```ts
  const curMk = await deriveMasterKey(currentMasterPassword, ...);
  const [curAuthKey, curEncKey] = await Promise.all([deriveAuthKey(curMk), deriveEncKey(curMk)]);
  const vaultKeyRaw = await unwrapVaultKey(curEncKey, currentWrappedVaultKeyB64);

  const newSalt = generateSalt();
  const newMk = await deriveMasterKey(newMasterPassword, newSalt, newKdfParams);
  const [newAuthKey, newEncKey] = await Promise.all([deriveAuthKey(newMk), deriveEncKey(newMk)]);
  const wrappedVaultKey = await wrapVaultKey(newEncKey, vaultKeyRaw);
```

Esta es la única propiedad que sobrevivió intacta a la reescritura. Los textos cifrados no se mueven nunca, incluidos los ficheros almacenados de hasta 100 MB. El servidor verifica la posesión de la contraseña *actual* mediante `guard_auth_key`, bajo un bloqueo exponencial por usuario, y luego cambia cuatro columnas. No puede realizar la rotación por sí mismo, que es justo la cuestión.

También significa que una sesión desbloqueada sigue siendo válida a través de un cambio de contraseña, ya que la clave que hay en memoria sigue siendo la correcta.

## Cada texto cifrado está ligado a la fila en la que vive

AES-GCM autentica, pero la autenticación por sí sola no impide que alguien con acceso de escritura a la base de datos mueva un blob válido a otra fila. Así que el AAD nombra la fila:

```ts
export function buildEntryAAD(userId, entryId, version = CRYPTO_VERSION): Uint8Array {
  return utf8(`${userId}|${entryId}|${version}`);
}
```

Reubicar un texto cifrado, reasignarlo a otro usuario o degradar `crypto_version` producen todos un desajuste de AAD y un fallo de descifrado. `client_id` es `unique` en el modelo, así que el mismo truco no se puede repetir copiando la identidad junto al blob. Los ficheros reciben el mismo tratamiento por fragmento, con el contador y un flag de fragmento final como AAD, lo que cierra el reordenamiento y el truncamiento.

## El panel que descifraba la bóveda ya no existe

El análisis de seguridad de la v1 cargaba `hashed_key`, descifraba todas las entradas, puntuaba la entropía y consultaba Have I Been Pwned. Ese endpoint era un oráculo de descifrado disfrazado de funcionalidad. Está borrado, junto con `/check-breach/`. Ninguno se movió al servidor, porque ya no queda nada a lo que moverlos.

El análisis ahora corre en el navegador sobre entradas ya descifradas en memoria. Una pieza no pudo seguirlo: la CSP fija `connect-src 'self'`, así que la página no puede llamar a HIBP directamente. Lo que queda es un proxy que reenvía un prefijo SHA-1 de cinco caracteres y devuelve el rango:

```python
    if not _PREFIX_RE.match(prefix or ''):
        return JsonResponse({'success': False, 'error': 'Prefijo inválido'}, status=400)
```

El servidor ve cinco caracteres hexadecimales y nunca la contraseña ni el hash completo. La comparación del sufijo ocurre en el cliente. El host es una constante y el prefijo está acotado por una expresión regular, así que tampoco es una primitiva de SSRF.

El endpoint de recomendaciones sobrevivió porque solo lee metadatos — recuentos de entradas y `updated_at`. La búsqueda en el servidor no sobrevivió. El servidor custodia blobs opacos; el filtrado ocurre después de que el cliente descifre.

## Qué es esto, y qué no es

El servidor nunca recibe la contraseña maestra y nunca recibe `EncKey`. No puede descifrar el contenido de la bóveda en ningún momento de ninguna ruta de petición. Esa es la propiedad de conocimiento cero y, a diferencia de la versión anterior de este artículo, ahora el código la implementa.

Tres matices que no voy a enterrar.

**El servidor sí recibe una clave derivada.** `AuthKey` llega en claro en el alta, la verificación y la rotación. Es la construcción estándar, y no puede desenvolver nada — pero «el servidor no recibe material derivado» sería falso, y la afirmación honesta es más estrecha: el servidor recibe la subclave que demuestra la posesión, nunca la subclave que descifra.

**Los metadatos no están cifrados.** Recuentos de filas, marcas de tiempo, tamaños de fichero, pertenencia a bóvedas. Un operador se entera de cuántos secretos tienes y de cuándo los tocaste por última vez. La búsqueda cifrada sería otro proyecto.

**El servidor sirve el JavaScript.** Un despliegue malicioso podría servir un build que exfiltre la contraseña maestra a la entrada. El conocimiento cero en una aplicación web es una propiedad del cliente entregado, no del protocolo. Un cliente empaquetado cambiaría esto; una CSP estricta solo lo estrecha.

Y no hay recuperación. Olvidar la contraseña maestra significa que la clave de bóveda envuelta se queda envuelta. La rotación exige la contraseña actual precisamente porque desenvolver es el único camino a la clave de bóveda. Eso no es un descuido — es la misma propiedad enunciada desde el lado del usuario.
