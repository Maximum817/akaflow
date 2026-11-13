"""Independent, dependency-free equation checks for the browser port.

Uses math.lgamma, exhaustive negative-xi support, and direct finite sums rather
than the JavaScript implementation's cached factorials and log-sum-exp loops.
No participant records or trained model artifacts are used.
"""
import json
import math
from pathlib import Path


def gp(x, lam, xi):
    term = lam + xi * x
    if term <= 0:
        return 0.0
    return math.exp(math.log(lam) + (x - 1) * math.log(term) - term - math.lgamma(x + 1))


def partition(lam, xi):
    if xi >= 0:
        return 1.0
    return math.fsum(gp(x, lam, xi) for x in range(math.ceil(-lam / xi)))


def likelihood(x, theta, max_skips=10):
    lam, xi, pi = theta
    normalizer = sum(pi ** s for s in range(max_skips + 1))
    return math.fsum(pi ** s / normalizer * gp(x, (s + 1) * lam, xi)
                     / partition((s + 1) * lam, xi) for s in range(max_skips + 1))


particles = [[18 + (i * 17 % 51), round(-.9 + (i * 7 % 37) * .05, 6),
              .02 + i % 7 * .035] for i in range(32)]
cases = []
for history in ([28, 29, 30], [28, 29, 30, 58], [20, 45, 27, 60, 31]):
    unnormalized = [math.prod(likelihood(x, p) for x in history) for p in particles]
    total = math.fsum(unnormalized)
    weights = [w / total for w in unnormalized]
    # Prediction target: a single biological cycle (s_predict = 0), as supported
    # by the authors' predict interface. It is not time until the next logged event.
    pmf = [0.0] + [math.fsum(w * gp(x, p[0], p[1]) / partition(p[0], p[1])
                            for w, p in zip(weights, particles)) for x in range(1, 241)]
    retained = math.fsum(pmf)
    pmf = [v / retained for v in pmf]
    cases.append(dict(history=history, weights=weights, pmf=pmf))

fixture = dict(particles=particles, cases=cases,
               kernels=[dict(x=x, lam=lam, xi=xi, log_pmf=math.log(gp(x, lam, xi)))
                        for x, lam, xi in [(0, 29, 0), (29, 29, 0), (25, 40, -.6), (50, 25, .5)]])
Path('reference-fixtures.json').write_text(json.dumps(fixture, indent=2) + '\n')
print('Generated independent Python fixtures for kernels, posteriors, and predictions.')
