# Published-model implementation and its limits

Version: `gp-skips-1`. Research and source reviewed 13 November 2026.

The Student-t / normal–inverse-gamma baseline has been removed from the prediction path. akaflow now implements the generalized-Poisson model with latent missed records described by [Urteaga et al., MLHC 2021](https://proceedings.mlr.press/v149/urteaga21a.html), building on [Li et al., JAMIA 2021](https://pubmed.ncbi.nlm.nih.gov/34534312/). [Reference code](https://github.com/iurteaga/menstrual_cycle_analysis), reviewed at revision `5f21f094dbdb9a6c302424b66a52b7c38e99f683`; MIT attribution is included in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

**This is an implementation of a published method, not the study's trained model and not a clinically validated product.** The reviewed repository supplies initialization defaults and training code. We found no released fitted population-parameter artifact there. No original participant dataset is loaded, trained on, or redistributed. Reference defaults must not be described as learned study parameters, and published accuracy must not be attributed to this app.

## Probability model

A person's parameters are `θ = (λ, ξ, π)`. The reference priors used here are:

```text
λ ~ Gamma(shape=30, rate=1)
ξ = 2 U − 1,  U ~ Beta(1,1)
π ~ Beta(2,20)
```

These numbers come from the reference configuration file, not an inference about population physiology. For `ξ`, we follow the reference implementation's `draw_params` shift over `(-1,1)`, with intrinsic finite support when negative. We do not use the paper's optional user-chosen finite-xmax parameter constraint.

For a non-negative integer `x`:

```text
GP(x | λ, ξ) = λ (λ + ξx)^(x−1) exp(−λ−ξx) / x!
GP(0 | λ, ξ) = exp(−λ)
```

For negative `ξ`, valid integers end at `ceil(−λ/ξ)−1`. Probabilities are zero outside that support and are divided by their finite sum `Z(λ,ξ)`. For non-negative `ξ < 1`, `Z=1`.

An observed interval can contain `s` unreported period starts:

```text
s ∈ {0, …, 10}
q(s | π) = (1−π) π^s / (1−π^11)
p(x | θ) = Σ_s q(s | π) GP(x | (s+1)λ, ξ) / Z((s+1)λ,ξ)
p(θ | history) ∝ p(θ) ∏_i p(x_i | θ)
```

The skip range is **inclusive**, following the paper's finite geometric sum. The reviewed Python helper uses a half-open range with a denominator referring to an inclusive count; we do not reproduce that off-by-one discrepancy. This port is equation-compatible with the stated sum, not a bit-for-bit translation of every reference-code behavior.

## Prediction target and product policy

We predict **one next biological cycle**, corresponding to the reference predictor's `s_predict=0` setting. Historical latent skips are still marginalized when learning the posterior. This target differs from the date of a future *reported* onset if a user again forgets to log. We do not display that potentially multi-cycle reporting delay as a biological period forecast.

The next-cycle distribution integrates `GP(d | λ,ξ)/Z(λ,ξ)` against the parameter posterior. The app conditions on a positive integer day. The median and integer 10th/90th percentiles yield the point date and nominal 80% range. Discrete endpoint inclusion can make enclosed mass larger than 80%. Real-world coverage is unestablished.

At least three eligible completed intervals are required; this is an engineering threshold, not a validated minimum. All eligible intervals are used. The app does not automatically delete long cycles, divide a long gap, or add inferred period starts. Users can explicitly exclude incomplete intervals.

We keep the forecast anchored to the latest recorded onset. Passing its upper bound prompts review rather than silently shifting the window. Although the research includes day-conditioned reporting predictions, that optional feature is not used here: absent logs do not establish that bleeding has not occurred.

## Numerical implementation

- Start with 32,768 reproducible pseudorandom prior draws and self-normalized importance weights. Compute history likelihoods in log space, with repeated lengths counted in a histogram.
- If numerical checks fail, use 65,536 draws from a defensive proposal: half reference prior, half a data-centered conditional Gamma proposal for `λ`, given `ξ`. Its center uses the **current input history only**. The `ξ` and `π` priors stay the same. We apply the exact `p(θ)/q(θ)` density correction, so this proposal changes sampling efficiency rather than the target model.
- Negative-dispersion normalization sums finite support, stopping at `mean + 16·sd + 40` only when support extends further. This is a numerical tail approximation, checked against exhaustive-support fixtures.
- Positive predictive mass is accumulated to at least 120 days and until omitted mass is below `10^-5`, with an absolute numerical horizon of 3,660 days. Forecasts require at least 99.9% retained positive mass.
- Withhold forecasts unless effective sample size is at least 128 overall and 40 in each half, and maximum CDF disagreement between independently generated sample halves is at most 0.05. These are engineering safeguards, not guarantees of posterior or clinical correctness.
- Seed `20261113` identifies the first draw; the adaptive proposal uses the next seed. A bounded likelihood cache and 24-result cache are kept in worker memory only. Changing records terminates stale workers; old results cannot overwrite new requests.

The model runs in `prediction-worker.js`; no prediction service, tracking endpoint, or population training server is contacted. Existing record storage and backup schema remain compatible. Calculation failures withhold dates while preserving records.

## Verification and evaluation

`verify-reference.py` independently generates committed fixtures using Python's `math.lgamma` and exhaustive finite-support sums. JavaScript tests compare GP kernels, posterior weights, and predictive probability mass against those fixtures, including negative dispersion and double-length gaps. They also check the Poisson special case, normalized skip probabilities, zero outside support, positive-day output, importance-density correction, adaptive sampling, withheld unstable predictions, exclusions, contexts, record validation, and chronological evaluation.

This checks numerical and integration behavior, not real-world accuracy. It is not a reproduction of a trained research cohort evaluation. No simulated result is represented as clinical evidence.

Personal backtesting predicts each eligible held-out interval from earlier eligible intervals, compares with a historical median, and includes **only numerically stable** forecasts in reported errors and coverage. Therefore coverage/error are conditional on the model returning a forecast. Skipped numerical predictions are reported separately. A participant's post-hoc editing/exclusion choices may still bias results.

Before making accuracy claims, obtain an appropriately consented representative dataset; learn population parameters on development participants; evaluate on separate participants chronologically; assess error, probability scores, interval coverage/width, and forecast availability by subgroup; and perform independent prospective validation. New cohort-fitted parameters must carry provenance and replace the reference-default label.

## Scope

Adult natural-cycle tracking only. Predictions pause in other selected contexts. This port has not been validated for adolescents, pregnancy, postpartum, hormonal contraception, PCOS, perimenopause, treatment changes, or fertility decisions. Symptoms are recorded but are not predictor inputs. Period dates do not confirm ovulation, hormone levels, or fertility. [ACOG guidance](https://www.acog.org/womens-health/faqs/fertility-awareness-based-methods-of-family-planning).

Do not use this app for contraception, ovulation confirmation, or diagnosis.
