---
title: 'Security controls that fail quietly'
description: 'Five ways a security control keeps running, keeps logging, and stops doing its job - and why none of them show up as errors.'
tags: ["Security", "Architecture", "Engineering"]
pubDate: '2026-07-21'
updatedDate: '2026-07-25'
coverImage: './cover.jpg'
---

A control that crashes gets fixed on the first request. A control that silently does nothing survives for as long as nobody checks, and reads as protection the whole time.

That asymmetry is what makes security wiring different from most code. If a serializer breaks, something 500s. If a rate limiter is counting the wrong bucket, the application behaves exactly as it did before — same responses, same latency, same clean logs. The absence of protection has no signature.

Below are five ways this happens, all of them from auditing a Django + React stack of my own with Prometheus and Grafana behind it. None of them raised an exception. Most had been there for months.

## Middleware that runs before the thing it inspects

Django processes `MIDDLEWARE` top-down on the way in. Putting your security middleware at the top feels correct — security first — and it puts you above `AuthenticationMiddleware`, which is what attaches `request.user`:

```python
    'myapp.middleware.SecurityLoggingMiddleware',
    'myapp.middleware.RateLimitMiddleware',

    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
```

So `request.user` doesn't exist yet in either of mine. A security logger that records who did what writes `user=None` on every row. A rate limiter that prefers a per-user bucket falls through to the IP bucket on every request.

Both were written defensively, with a `hasattr(request, 'user')` guard — and that guard is exactly what makes the bug invisible. Without it, the first request raises `AttributeError` and you fix the ordering in five minutes. With it, you get a logger that runs forever and never learns anyone's identity.

Defensive coding around a framework invariant doesn't make the code robust. It converts a loud misconfiguration into a silent change of behaviour.

## A scanner pointed at the channel the API doesn't use

The same middleware pattern-matched `request.POST` for SQL injection and XSS strings.

Every view in that project reads `json.loads(request.body)`. Django only populates `request.POST` for form encodings — for `application/json` it's empty. So the scanner ran on every request, iterated over an empty dict, and reported clean.

What I find instructive is that the control is correct in isolation. The patterns are fine, the wiring is fine, the tests over the pattern list would pass. It's aimed at a channel the application stopped using the day it became a JSON API, and nothing in the codebase connects those two facts.

Any control that inspects "the request" is really inspecting one specific accessor. When the transport changes, the accessor quietly stops being where the data is.

## Redundant limiters with one shared dependency

Login in that project was protected three times over: a `@ratelimit(rate='15/5m')` decorator, an in-view check tripping at 5 failures in 15 minutes, and a middleware check tripping at 10 in 5. Separately, DRF throttle scopes were declared in settings, and a `throttle_classes.py` defined classes to implement them that nothing ever imported.

The layering came from uncertainty: I wasn't confident the previous layer worked, so I added another. The result is that no one can state the effective limit without tracing three code paths.

But the real problem is underneath. Every counter lived in the Redis cache, configured with `'IGNORE_EXCEPTIONS': True`. With Redis down, `cache.get` returns the default, every counter reads empty, and all three limiters fail open simultaneously — along with the IP blocker, which never reaches its threshold. Three independent-looking controls, one shared dependency, and that dependency configured to swallow its own failures.

The redundancy was theatre. They were never independent, and the flag that made them fail together was inherited from a cache config where ignoring exceptions is a perfectly reasonable default.

Failing open is sometimes right for rate limiting — a cache outage shouldn't lock out every user. But that needs to be a decision with an alarm on it, not a property you acquire by accident.

## A trust boundary implemented seven times

`get_client_ip` existed seven times across that codebase: five copies in one middleware module, one in the session manager, one in the logging utilities. All seven read the first entry of `X-Forwarded-For`.

The nginx in front set that header with `$proxy_add_x_forwarded_for`, which *appends* to whatever the client sent. A request arriving with `X-Forwarded-For: 1.2.3.4` produces `1.2.3.4, <real client>` — so the first element is attacker-controlled. That value fed IP-based rate limiting, IP blocking, and the audit log.

The usual case against copy-paste is duplication. The real one is ownership: seven chances to fix a bug, and no single place to fix it. Client IP extraction is a trust boundary, and a trust boundary that appears seven times belongs to nobody.

The fix is boring — one function, in one module, that knows how many proxies it sits behind and reads from the right end. The reason it matters is that it turns "is our XFF handling correct?" from an audit into a question with one answer.

## Dashboards that can't tell zero from absent

An empty Grafana panel and a metric sitting legitimately at zero look identical.

The stack scraped a hand-rolled `/metrics` endpoint exposing two gauges, one of which counted `connection.queries` — a list Django only populates when `DEBUG` is on, so it reads zero in any correct deployment. `django_prometheus` was in `INSTALLED_APPS` but its middleware was never added, its URLs never included, and the database backend was the plain one rather than the instrumented variant. The library contributed an import and nothing else.

Of six dashboard panels, three worked. One queried a `django_prometheus` metric the disabled middleware would have produced. One queried `django_db_connections_total` while the exporter emitted `django_db_connections`, without the suffix. One queried a cAdvisor metric with no cAdvisor in the compose file. A fourth Prometheus job scraped Postgres on 5432 over HTTP, where it speaks its own binary protocol.

Every one of those failures renders as a flat line, which reads at a glance as a quiet system. Grafana will tell you a query returned no data if you look at the panel in edit mode; it will not tell you from the dashboard, and the dashboard is the only thing anyone looks at.

The check that catches this is trivial and almost nobody runs it: query your metric names directly against Prometheus and confirm each one exists. Not that the value is sensible — that the series is there at all.

## Installed is not enabled

The pattern that ties the rest together: dependencies and settings that describe an intention nothing implements.

`django-csp` sat in requirements and was never added to the middleware. `argon2-cffi` and `bcrypt` were pinned under a "Password validation & security" heading while `PASSWORD_HASHERS` was never set, so Django's default PBKDF2 was what actually hashed passwords. Six settings blocks with names like `MAX_FAILED_LOGIN_ATTEMPTS` and `LOCKOUT_DURATION_MINUTES`, read by nothing. `DEBUG` hardcoded rather than read from the environment, which made every `if not DEBUG` branch dead code: no HSTS, no SSL redirect, and cookies that never got their secure flag.

My favourite was a JWT setting naming a serializer class that doesn't exist. It never raised — because no URL routed the view that would have loaded it. A broken setting, kept silent by a second gap, protected by a rate limiter carefully guarding an endpoint that 404s.

A requirements file is the cheapest place in a project to express a security intention, and a settings block is the second cheapest. That's exactly what makes both of them untrustworthy as descriptions of what a system does.

## Two habits that would have caught most of this

**Assert the wiring, not the logic.** I had no test that a request from a rate-limited IP receives a 429, or that a logged security event carries a user ID, or that a request with an injection string in a JSON body gets flagged. Unit tests over the pattern list would have passed while the scanner watched an empty dict. Every control here was correct in isolation and broken in integration, and integration is the part I never asserted.

**Make silence an alarm.** All of these present as absence: a `None` user, a counter that never trips, a panel at zero, a branch that never runs. If a control can't distinguish "nothing happened" from "I am not running", it isn't reporting on the system. It's reporting on itself.

The [encryption design in the same project](/2026-07-21-password-manager-encryption/) had a serious flaw of its own: the server stored the key it decrypted with, which I [later rebuilt](/2026-07-25-password-manager-zero-knowledge/). But it failed differently, and that's the contrast I find useful. That flaw was legible in the code that implemented it — writing the design down is what exposed it. The controls above were assembled from defaults and installed packages, and a default doesn't announce when it stops applying.
