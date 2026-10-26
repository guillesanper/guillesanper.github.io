---
title: 'I Have No Security Coursework. I Kept Building Security Anyway.'
description: 'On learning cryptography and threat modelling as a consequence of building systems, and why I am aiming at platform work rather than security work.'
tags: ["Security", "Career", "Engineering"]
pubDate: '2026-06-28'
updatedDate: '2026-10-18'
coverImage: './cover.jpg'
---

My degree has no cybersecurity module. It has machine learning, evolutionary programming, knowledge engineering, big data — a good grounding, and nothing at all about how systems get broken.

I ended up learning a fair amount of it anyway, because every project I actually wanted to finish reached a point where I could not proceed without knowing.

## It arrives as a blocker, not a topic

The password manager is the clearest example. I set out to build a full-stack web app; the crypto was supposed to be one function I'd call. Then the questions started arriving in order:

Where does the encryption key live? On the server. Where does the database live? Also the server. So an attacker who gets one gets the other, and the encryption has bought me nothing.

That's not a cryptography question. It's an architecture question that cryptography exists to answer, and it forced me into the details underneath it: that a per-entry envelope buys nothing against a database dump when the key that opens every envelope is one column away, that a salt declared as a Django column default gets evaluated once at import and quietly shared by every user in the deployment, that AES-CFB is malleable and there was no MAC anywhere to notice. None of that was on a syllabus. The app was wrong until I understood it.

The database mapping tool went the same way. I wanted to introspect schemas, which meant holding someone's connection string, which meant confronting exactly how much I was asking them to trust me. The answer that came out of it — the mapping side reads `information_schema` and nothing else, and only an explicit migration run ever touches a user row — is a security decision that looks like a scoping decision. Most of the good ones do.

Even the intrusion detection cascade: the architecture came from asking what a missed attack costs versus a false alarm. That's threat modelling. I just wasn't calling it that at the time.

## What that leaves me with, and what it doesn't

I want to be accurate about this, because "self-taught in security" covers an enormous range.

What I have: a working understanding of applied cryptography for data at rest and in transit, the habit of designing from an explicit threat model, and enough experience to know which problems encryption does not solve. I can look at a system and ask what happens when the database leaks, when the process is compromised, when the client is malicious — and give different answers to each.

What I don't have: offensive experience. I have never written an exploit, done a serious CTF, or reverse-engineered a binary. I don't know what current malware looks like or how detection engineering works in practice. My knowledge of memory-safety vulnerabilities is textbook, not hands-on. If you need someone to break into things or run an incident response, that isn't me and pretending otherwise would waste both our time.

That gap is real and it shapes what I'm looking for.

## Why platform work rather than security work

Security roles mostly split into two shapes. One is adversarial — find the flaw, run the campaign, respond to the incident. The other is constructive — build systems where the insecure path is difficult and the secure one is the default.

I'm useful at the second and I'd be mediocre at the first. What I like is the design work: the point where you decide the server cannot decrypt the vaults it stores, or that building a schema map never reads a single row of user data. Those decisions get made while the system is being built, by whoever is building it, and they close off whole classes of problem before anyone has to detect anything.

Which is why I'm aiming at Platform Engineering, Cloud Engineering, and DevSecOps rather than a security analyst track. I want to be on the side that builds the paved road — the pipeline where secrets aren't in the repo because there's a better path that's also the easier one, the infrastructure where least privilege is the default because someone made it the default.

Security as a property of the system, decided at build time. Not a dashboard someone watches at 3am.
