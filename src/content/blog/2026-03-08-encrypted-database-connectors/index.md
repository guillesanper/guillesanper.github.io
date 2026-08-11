---
title: "Holding someone else's connection string"
description: 'A migration tool needs credentials for a database it does not own. What the connector layer holds, what it refuses to hold, and where the guarantees actually stop.'
tags: ["Security", "Databases", "Architecture"]
pubDate: '2026-03-08'
coverImage: './cover.jpg'
---

The tool does something simple to describe and awkward to secure: you point it at a database, it introspects the schema, you map tables and columns across to a target, and it generates the `INSERT INTO ... SELECT` script that moves the data — and executes it, if you ask. To do any of that it needs connection credentials for a database it does not own.

That's a genuinely uncomfortable thing to build. You are asking someone to hand over a production connection string. The design has to earn that, and "we store it encrypted" is not enough on its own.

This post is about the connector layer specifically: what it holds, what it deliberately doesn't, and where the guarantees run out.

## Rule one: be exact about which layer touches what

Before any encryption question, the useful question is what each part of the tool actually requires.

The mapping side needs the schema — table names, column types, foreign keys, indexes. It does not need a single row of data to do its job, so introspection reads from `information_schema` and the system catalogs only, and nothing in the mapping path issues a `SELECT` against a user table.

The execution side is the opposite, and blurring the two would be dishonest. Running a migration means moving rows: the executor walks the generated statements and runs them against the target, taking a backup of the destination tables first. That path reads and writes user data by definition. It's the entire point of the feature.

So the boundary isn't "we never touch your data" — that would be a nice sentence and a false one. It's that the tool never reads a row to build the map, and only touches rows when you explicitly ask it to run a migration. Those are separate code paths, and the one that moves data is opt-in, backed up beforehand, and available as a dry run that rolls back at the end.

Drawing that line is what makes the encryption questions tractable. The credentials are held continuously; the data is touched only during an operation you started.

## Rule two: the key is derived, not stored

Connection strings are the part you can't design away — reconnecting on a later visit means holding them somehow.

They're encrypted with AES-256-GCM under a key derived from the user's passphrase with Argon2id, at m=64 MiB, t=3, p=1. The key is derived on demand and never written to the database. What the database holds is a ciphertext, a nonce and a salt.

Then the part most write-ups skip, because it's the part that weakens the claim. The key has to exist somewhere while you're using the tool, and in this design that somewhere is the server: derivation happens in Python, and the derived key is cached in a Redis session for the life of that session and injected into each request. So the honest statement has two halves:

- **At rest, with no active session, the server cannot decrypt.** The stored material is ciphertext, nonce and salt, and no key sits beside it.
- **During an active session, the server can decrypt.** It has to. That's what makes the connection open.

What bounds that window is session hygiene rather than cryptography: the session token is an httpOnly cookie scoped per project, the middleware checks that the session's owner matches the authenticated user and invalidates the session outright when they don't, and sessions expire on a timer with a cleanup task behind it.

That is a weaker property than a password manager where derivation happens in the browser and the server is blind — I built one of those too, and the [trade goes the other way there](/2026-07-25-password-manager-zero-knowledge/) because nothing in that design needs the server to act on the plaintext. A tool whose job is to open connections to your database cannot be blind to the credentials at the moment it opens them.

One thing does fall out of it: there's no background job that reconnects on your behalf. Not because the backend couldn't during a session — it could — but because I didn't build one, and outside a session there's no key to do it with. That rules out some features I'd have liked, scheduled schema diffs for one, and it's the right trade. A backend that can silently connect to your production database on a schedule is a much larger thing to trust.

## Rule three: encrypt at rest, and be precise about what that covers

Cached schema metadata is encrypted at rest too. Table and column names are not neutral information — `patients`, `salary_bands`, `internal_pricing_tiers` describe a business in some detail, and a leaked schema is a decent map for anyone planning a real attack.

What "encrypted at rest" does not cover, and I try to be exact about this in the docs:

- **Row counts and byte sizes** are stored unencrypted, because the UI sorts on them.
- **Timestamps** of connection and refresh are in the clear.
- Encryption at rest protects a stolen disk or database dump. It does nothing against a compromised running process, which holds decrypted material by definition.

Vague claims are worse than narrow honest ones. "Encrypted at rest" is often used to imply a guarantee nobody has actually checked.

## Rule four: TLS is not optional and not silent

Every connector requires TLS, with certificate verification on. Users asked for a "skip verification" toggle, which is the standard request when someone hits a self-signed certificate on a staging box.

I added it, scoped narrowly: it's per-connection, it requires typing the hostname to confirm, and the connection is permanently marked as unverified in the UI afterwards. The toggle exists because otherwise people paste credentials into a tool that "just works" elsewhere, which is worse. Making the insecure path available but visibly degraded beats making it unavailable and pushing people off the platform.

## What I'd change

Deriving the key from a passphrase makes the security model easy to state and the UX genuinely worse — every session starts with an unlock step, and Argon2id at 64 MiB is not a fast operation by design. Some teams will not accept that for an internal tool.

The alternative is a proper KMS with envelope encryption: a per-connection data key, encrypted under a master key held in a hardware security module, with an audit trail of every decrypt call. That moves trust from "the user's password" to "the cloud provider's KMS and my IAM policy", which is a different trade rather than a strictly better one — but it's the one most production systems make, and it's the version I'd build if this had real users.
