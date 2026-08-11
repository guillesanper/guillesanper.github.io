---
title: 'Envelope encryption in a self-hosted password manager'
description: 'How the encryption is laid out in a Django password manager: one wrapped key per secret, what that buys, and where the current design stops.'
tags: ["Security", "Cryptography", "Web"]
pubDate: '2026-07-21'
updatedDate: '2026-07-25'
coverImage: './cover.jpg'
---

> **This post describes a design I have since replaced.** Everything below was accurate when written: the server held the derived master key and could decrypt any vault. I rebuilt that part — derivation now happens in the browser and the server never sees the key — in [Moving the crypto out of the server](/2026-07-25-password-manager-zero-knowledge/). I'm leaving this one up because the trade-off it describes is the one I actually had to make.

This is a self-hosted password and file manager: a Django monolith serving a React/TypeScript SPA, with PostgreSQL, Redis and MinIO behind it. The design work worth writing about is how the encryption is laid out — one envelope per secret, and what that does and doesn't buy given that the server still holds the master key.

## One key per entry, wrapped under the master key

The obvious approach is to derive a key from the master password and encrypt everything with it. It works, and it makes two later problems expensive.

Instead, each entry generates its own cipher key and its own salt. The password is encrypted under that per-entry key, and the per-entry key is encrypted under a key derived from the master key:

```python
def encrypt_password(password, master_key, algorithm="AES"):
    algorithm_key = os.urandom(32) if algorithm in ["AES", "ChaCha20"] else os.urandom(16)
    salt = os.urandom(16)  # Generar una salt única para esta entrada
    encrypted_key = encrypt_with_master_key(algorithm_key, master_key, salt)

    if algorithm == "AES":
        iv = os.urandom(16)
        cipher = Cipher(algorithms.AES(algorithm_key), modes.CFB(iv), backend=default_backend())
```

`encrypt_with_master_key` runs PBKDF2-SHA256 over the master key with that per-entry salt, then wraps the 32-byte entry key under the result. Each row ends up holding four things: the ciphertext, the wrapped key, the IV, and the salt.

Two properties come out of this layout.

**Salt reuse is structurally impossible.** The salt is `os.urandom(16)` evaluated per call, not a column default — so it can't silently become shared across rows, which is the usual way this goes wrong.

**Rotation is cheap by construction.** The master password never encrypts data; it encrypts 32 bytes per entry. Changing it means unwrapping each `encrypted_key`, rewrapping it under the new derived key, and writing back a single column. The ciphertext blobs — up to 100MB for stored files — never move. That matters here because file storage shares this path: re-encrypting a vault of documents on every password change would make the feature unusable.

The rotation endpoint currently returns 501. The layout supports it; the implementation isn't written yet.

## Where the master key lives, and what that bounds

The derived master key is persisted. `set_master_key` runs PBKDF2 over the master password, base64-encodes the result, and stores it:

```python
    def set_master_key(self, raw_key):
        master_key = self.derive_master_key(raw_key)
        master_key_str = base64.b64encode(master_key).decode('utf-8')

        self.hashed_key = master_key_str  # Almacena la clave derivada sin hashear de nuevo
        self.save()
```

That is the decision the rest of the system is built on, so it's worth stating its consequences exactly rather than in the vague terms this usually gets described in.

It means the server can decrypt. Any request path can load that value and unwrap any entry key, which is what makes the server-side features in the next section possible. It also means the key and the ciphertext it unwraps live in the same database, so a dump of that database contains both halves — the per-entry envelope doesn't help against that, because the thing that opens every envelope is one column away.

What the layout still buys under those conditions is narrower but real: no single key encrypts two secrets, salts can't collide, and a rotation touches 32 bytes per entry instead of the whole vault. Those are properties about blast radius and about cost, not about keeping the operator out.

Keeping the operator out is a different construction, and there's only one that works: derive in the browser, hold the key in memory there, send the server nothing but ciphertext. The server never receives the master password and cannot decrypt at any point. That's what "zero-knowledge" means when a password manager claims it, and this design does not have it.

## What a decrypting server buys, and what giving it up would cost

A server that can decrypt is what makes several features possible at all. The clearest case is the security dashboard:

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

It decrypts every entry the user owns to score its entropy and check it against Have I Been Pwned. File upload works the same way, adding a second Fernet layer under a system key so the server can handle both halves.

Moving derivation into the browser would end those. The analysis would have to run client-side, re-downloading every entry to do it. Server-side search would stop working for any field worth encrypting. The file pipeline would lose its inner layer. That's the actual trade — not "more secure versus less", but a decrypting server with a rich feature set against a blind server with a much smaller one.

There is no `crypto.subtle` call anywhere in the frontend yet, so that migration would be a rewrite of every crypto path rather than a patch.

## Two things I'd fix before calling the crypto finished

**The ciphers aren't authenticated.** Every path uses AES-CFB or raw ChaCha20, with no MAC in `encryption_utils.py`. CFB is malleable: flipping a ciphertext bit flips the corresponding plaintext bit and garbles one block, with nothing to detect it. Since the wrapped keys are stored the same way, anyone who can write to the database can corrupt a key into one that decrypts to attacker-influenced bytes, and the only guard on the way back is a `try` catching `UnicodeDecodeError`. AES-GCM or ChaCha20-Poly1305 would close this, and both are drop-in for what's already there.

**The master-key salt is a column default.** It's declared as `default=get_random_string(32)`, which Django evaluates once at import rather than per row, and nothing assigns it afterwards — so every user in a deployment shares one master-key salt, which makes those derivations precomputable as a set. The per-entry salts are correct; this one needs to be a callable.

Both are small changes. Neither is visible from the outside, which is roughly the point: the parts of a crypto design most likely to be wrong are the ones no feature depends on.
