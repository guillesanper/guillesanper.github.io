---
title: 'Moving the crypto out of the server'
description: 'The old design stored the derived master key one column away from the ciphertext it unwrapped; this is the rebuild that made the server blind, and the parts it still cannot protect.'
tags: ["Security", "Cryptography", "Web"]
pubDate: '2026-07-25'
coverImage: './cover.jpg'
---

Last time I wrote about this password manager, I said the server could decrypt every vault it stored, that the envelope layout bought blast radius and rotation cost rather than operator exclusion, and that keeping the operator out was a different construction entirely. I've since built that construction. This is what moved, and what it still doesn't buy.

The stack is unchanged: a Django monolith serving a React/TypeScript SPA, with PostgreSQL, Redis and MinIO behind it.

## The old design stored the key that opened everything

v1 had a `MasterKey` model. `set_master_key` ran PBKDF2 over the master password and wrote the output to a column called `hashed_key`:

```python
    def set_master_key(self, raw_key):
        master_key = self.derive_master_key(raw_key)
        master_key_str = base64.b64encode(master_key).decode('utf-8')

        self.hashed_key = master_key_str  # Almacena la clave derivada sin hashear de nuevo
        self.save()
        return master_key
```

The column name is the only part of that which sounds safe. It isn't a hash. It's the encryption key, base64-encoded, sitting in the same database as the ciphertext it unwraps. The salt beside it was declared `default=get_random_string(32)`, which Django evaluates once at import, so every user in a deployment shared one salt. `verify_master_key` printed both the derived key and the stored one to stdout.

That model is gone. Migration `0025_purge_legacy_crypto` drops the table and the v1 plaintext columns with it.

## Derivation now happens in the browser, in one file

The client derives a master key with Argon2id, then splits it into two domain-separated subkeys with HKDF:

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

Argon2id comes from `hash-wasm`, not WebCrypto — `crypto.subtle` has no memory-hard KDF, and PBKDF2 at any iteration count is the wrong primitive for a password that guards a vault. Parameters are m=64 MiB, t=3, p=4, and they're stored server-side alongside the salt so raising the cost later doesn't strand existing vaults.

Two files in the frontend call `crypto.subtle`. One is this module. The other calls it once, for `digest('SHA-1', …)`. Every derivation, wrap and AEAD operation lives in a single file, which is the property I actually wanted: there is one place to audit.

The domain separation is the load-bearing part. `AuthKey` goes to the server. `EncKey` never leaves the browser. Because HKDF is one-way, holding the first tells you nothing about the second.

## The server holds a verifier and a sealed box

`UserCrypto` replaced `MasterKey`. It stores four things, none of which reconstruct anything:

```python
    kdf_salt = models.CharField(max_length=64)
    kdf_params = models.JSONField(default=dict)
    auth_key_hash = models.CharField(max_length=255)
    wrapped_vault_key = models.TextField()

    def set_auth_key(self, auth_key_b64):
        self.auth_key_hash = make_password(auth_key_b64)
```

`make_password` runs through `PASSWORD_HASHERS`, with `Argon2PasswordHasher` first. So the stored value is Argon2id over an already-derived key — a verifier, not the key. The vault key itself is 32 random bytes wrapped with AES-256-GCM under `EncKey`, which the server has never seen.

Handing `wrapped_vault_key` back to its own authenticated user leaks nothing, because unwrapping it requires deriving `EncKey` from the master password. Getting that wrong is exactly how v1 failed, so I have a test asserting `UserCrypto` has no field named `master_key`, `enc_key`, `vault_key` or `password`, and that `auth_key_hash` starts with `argon2`. It's a crude test. It would have caught the original bug.

## Rotation rewraps 32 bytes and never touches the data

The vault key never changes. Rotating the master password re-wraps it:

```ts
  const curMk = await deriveMasterKey(currentMasterPassword, ...);
  const [curAuthKey, curEncKey] = await Promise.all([deriveAuthKey(curMk), deriveEncKey(curMk)]);
  const vaultKeyRaw = await unwrapVaultKey(curEncKey, currentWrappedVaultKeyB64);

  const newSalt = generateSalt();
  const newMk = await deriveMasterKey(newMasterPassword, newSalt, newKdfParams);
  const [newAuthKey, newEncKey] = await Promise.all([deriveAuthKey(newMk), deriveEncKey(newMk)]);
  const wrappedVaultKey = await wrapVaultKey(newEncKey, vaultKeyRaw);
```

This is the one property that survived the rewrite intact. Ciphertexts never move, including stored files up to 100 MB. The server verifies possession of the *current* password via `guard_auth_key`, under a per-user exponential lockout, then swaps four columns. It cannot perform the rotation itself, which is the point.

It also means an unlocked session stays valid across a password change, since the key in memory is still the right one.

## Each ciphertext is bound to the row it lives in

AES-GCM authenticates, but authentication alone doesn't stop someone with database write access from moving a valid blob to a different row. So the AAD names the row:

```ts
export function buildEntryAAD(userId, entryId, version = CRYPTO_VERSION): Uint8Array {
  return utf8(`${userId}|${entryId}|${version}`);
}
```

Relocating a ciphertext, reassigning it to another user, or downgrading `crypto_version` all produce an AAD mismatch and a decryption failure. `client_id` is `unique` on the model, so the same trick can't be pulled by copying the identity along with the blob. Files get the same treatment per chunk, with the counter and a final-chunk flag as AAD, which closes reordering and truncation.

## The dashboard that decrypted the vault no longer exists

v1's security analysis loaded `hashed_key`, decrypted every entry, scored entropy and queried Have I Been Pwned. That endpoint was a decryption oracle wearing a feature's clothes. It's deleted, along with `/check-breach/`. Neither was moved server-side, because there is nothing left to move them to.

Analysis now runs in the browser over entries already decrypted in memory. One piece couldn't follow: the CSP sets `connect-src 'self'`, so the page can't call HIBP directly. What remains is a proxy that forwards a five-character SHA-1 prefix and returns the range:

```python
    if not _PREFIX_RE.match(prefix or ''):
        return JsonResponse({'success': False, 'error': 'Prefijo inválido'}, status=400)
```

The server sees five hex characters and never the password or the full hash. The suffix comparison happens client-side. The host is a constant and the prefix is regex-bound, so it isn't an SSRF primitive either.

The recommendations endpoint survived by only ever reading metadata — entry counts and `updated_at`. Server-side search did not survive. The server holds opaque blobs; filtering happens after the client decrypts.

## What this is, and what it isn't

The server never receives the master password and never receives `EncKey`. It cannot decrypt vault contents at any point in any request path. That is the zero-knowledge property, and unlike the last version of this post, the code now implements it.

Three qualifications I won't bury.

**The server does receive one derived key.** `AuthKey` arrives in plaintext on setup, verify and rotation. It's the standard construction, and it can't unwrap anything — but "the server receives no derived material" would be false, and the honest statement is narrower: the server receives the subkey that proves possession, never the subkey that decrypts.

**Metadata is not encrypted.** Row counts, timestamps, file sizes, vault membership. An operator learns how many secrets you hold and when you last touched them. Encrypted search would be a different project.

**The server ships the JavaScript.** A malicious deployment could serve a build that exfiltrates the master password on the way in. Zero-knowledge in a web app is a property of the delivered client, not of the protocol. A packaged client would change this; a strict CSP only narrows it.

And there is no recovery. Forgetting the master password means the wrapped vault key stays wrapped. Rotation requires the current password precisely because unwrapping is the only path to the vault key. That's not an oversight — it's the same property stated from the user's side.
