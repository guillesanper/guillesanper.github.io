---
title: 'Building a Password Manager: Assume the Database Is Already Stolen'
description: 'What AES-256-GCM actually requires you to get right, and why "we encrypt passwords" is not a security property on its own.'
tags: ["Security", "Cryptography", "Web"]
pubDate: '2026-01-18'
coverImage: './cover.jpg'
---

I wrote a password manager as a full web application. The interesting part was not the UI. It was working out what the threat model actually is, because that decision determines everything else.

The threat model I settled on: **an attacker has a full copy of my database and the application source code.** Not a hypothetical breach — assume it already happened. If the design survives that, the rest is detail.

That single assumption rules out a lot of things people ship.

## What "we encrypt passwords" usually means

It usually means the application holds a key, encrypts on write, decrypts on read. Which is fine against a stolen disk image and useless against anything else, because the key is sitting in the same environment as the data. An attacker who gets the database almost always gets the config too.

So the key cannot live on the server. It has to be derived from the master password, in the browser, and never transmitted.

## Deriving the key

The master password is not a key. It's a low-entropy human string, and turning it into a key is where most of the actual security lives.

```javascript
const keyMaterial = await crypto.subtle.importKey(
  "raw",
  new TextEncoder().encode(masterPassword),
  "PBKDF2",
  false,
  ["deriveKey"]
);

const key = await crypto.subtle.deriveKey(
  {
    name: "PBKDF2",
    salt,                  // 16 random bytes, per user, stored plainly
    iterations: 600_000,
    hash: "SHA-256",
  },
  keyMaterial,
  { name: "AES-GCM", length: 256 },
  false,                   // non-extractable
  ["encrypt", "decrypt"]
);
```

Three things I got wrong before I got them right:

**The iteration count is a real decision, not a copied constant.** It's a deliberate cost imposed on anyone brute-forcing the master password. 600k for PBKDF2-SHA256 is the current OWASP figure; the number that mattered to me was measuring it on the slowest device I care about and confirming the unlock delay was tolerable. Argon2id would be the better primitive — it's memory-hard, so GPU attacks scale much worse — and it's the change I'd make first if I revisited this.

**The salt is per-user and it is not a secret.** It exists to make precomputed rainbow tables useless and to guarantee that two users with the same master password get different keys. Storing it in plaintext next to the ciphertext is correct. I spent an embarrassing amount of time trying to protect it before understanding what it was for.

**`extractable: false`.** The derived key cannot be read back out of the Web Crypto API, even by my own code. It reduces the blast radius of an XSS bug from "attacker exfiltrates the vault key" to "attacker can decrypt while the page is open" — worse, still bad, but meaningfully bounded.

## AES-GCM and the nonce rule

I used AES-256-GCM rather than AES-CBC, for one reason: GCM is authenticated. It doesn't just hide the plaintext, it detects tampering. With CBC an attacker who can modify ciphertext can flip bits in the decrypted output in controlled ways, and you'd never know. GCM produces an authentication tag, and decryption fails loudly if the ciphertext was touched.

GCM has one rule you cannot break: **never reuse an IV with the same key.** Not "try to avoid" — reusing a nonce in GCM leaks the XOR of the plaintexts and, worse, can expose the authentication key itself, letting the attacker forge valid ciphertexts.

```javascript
// A fresh 96-bit IV for every single encryption. No exceptions.
const iv = crypto.getRandomValues(new Uint8Array(12));

const ciphertext = await crypto.subtle.encrypt(
  { name: "AES-GCM", iv },
  key,
  new TextEncoder().encode(plaintext)
);

// The IV is stored alongside the ciphertext. It is not secret.
```

The IV goes in the database in the clear, one per record. That's by design — it needs to be unique, not hidden.

## What the server sees

The server stores: a user ID, a salt, and a blob of ciphertext with its IV and auth tag. It never receives the master password, never receives the derived key, and cannot decrypt anything it holds. Encryption and decryption both happen client-side.

This has a consequence you have to accept up front: **there is no password recovery.** If a user forgets the master password, the data is gone. That is not a missing feature, it's the property working correctly. Any recovery mechanism means the server can regain access, which means an attacker with the server can too.

## The parts that are still weak

Being honest about what this design does not solve:

- **Malicious or compromised server.** The server ships the JavaScript that does the encryption. If it serves modified code, it can steal the master password on the next unlock. Subresource Integrity helps; it doesn't close the hole. This is the fundamental limit of browser-delivered client-side crypto.
- **Metadata.** Entry titles and URLs are encrypted, but record counts, sizes, and modification timestamps are not. That leaks more than people assume.
- **Memory.** JavaScript gives you no reliable way to zero a plaintext buffer after use. It sits in the heap until GC decides otherwise.

None of these are fixed by adding more encryption. They're structural, and knowing which problems your crypto does not solve is most of what makes it useful.
