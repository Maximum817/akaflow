# Research, model specification, and validation status

Research reviewed: 13 November 2026. Implementation: `model.js`, original Bayesian baseline v0.1. **Not clinically validated.**

## Recommended published model

The strongest fit found for this use case is the hierarchical generalized-Poisson generative model in **Urteaga et al. (2021), “A Generative Modeling Approach to Calibrated Predictions: A Use Case on Menstrual Cycle Length Prediction,” MLHC / PMLR 149**. It represents individual timing, dispersion, and missed tracking, with predictive uncertainty. [Paper and supplement](https://proceedings.mlr.press/v149/urteaga21a.html); [authors' implementation](https://github.com/iurteaga/menstrual_cycle_analysis), distributed under MIT at the time of review.

This builds on **Li et al. (2021), “A predictive model for next cycle start date that accounts for adherence in menstrual self-tracking,” JAMIA 29(1)**. Their study used over two million tracked cycles from approximately 186,000 participants. Its important contribution for our design is separating physiology from logging adherence. [Primary paper](https://pmc.ncbi.nlm.nih.gov/articles/PMC8714275/), DOI 10.1093/jamia/ocab182.

Research code is available, but a complete, trained, browser-ready clinical predictor is not established merely by finding its repository. This project does not contain their code, trained parameters, cohort data, or a reproduction of their results. No accuracy claims from either publication transfer to this baseline. Before integrating a port, audit code/license/dependencies, identify accessible consented data and population parameters, reproduce published evaluation, then independently validate the port.

## Why this app does not predict a whole hormonal cycle

**Bull et al. (2019)** analyzed 612,613 ovulatory cycles and documented substantial cycle and phase variability. These selected app users and detectable ovulatory cycles are not a representative sample of all people who menstruate. [Primary paper](https://www.nature.com/articles/s41746-019-0152-7), DOI 10.1038/s41746-019-0152-7. This is evidence against a fixed day-14 ovulation assumption, not a basis to infer a person's ovulation from dates.

Period onset is the current prediction target. Bleeding days are only shown when recorded. Ovulation, fertile windows, phase assignments, hormone trajectories, and symptom forecasts are not generated. BBT, LH, and cervical mucus would require separate validated observation models and appropriate reference labels; they must not be turned into improvised fertility advice. [ACOG guidance](https://www.acog.org/womens-health/faqs/fertility-awareness-based-methods-of-family-planning).

## Implemented algorithm: original conjugate Bayesian baseline

Let `x_i` be eligible, completed, whole-day intervals between chronologically consecutive period starts. The initial model assumes:

```text
x_i | μ, σ² ~ Normal(μ, σ²)
μ | σ²      ~ Normal(μ₀, σ² / κ₀)
σ²          ~ InverseGamma(α₀, β₀)  [scale parameter β₀]

μ₀ = 29 days, κ₀ = 0.25, α₀ = 2, β₀ = 25 days²
```

These hyperparameters are transparent **engineering choices**, not population parameters learned in the cited research. The 29-day center is broadly compatible with the adult app-cohort literature, but not a universal physiological norm. Small κ gives the prior center little weight. The variance prior intentionally leaves initial uncertainty. No forecast is shown with fewer than three eligible completed intervals; this threshold is also an engineering choice, not a validated minimum.

For `n` eligible intervals, sample mean `x̄`, and `S = Σ(x_i − x̄)²`:

```text
κₙ = κ₀ + n
μₙ = (κ₀ μ₀ + n x̄) / κₙ
αₙ = α₀ + n / 2
βₙ = β₀ + S/2 + κ₀ n (x̄ − μ₀)² / (2κₙ)

X_next | history ~ StudentT(
  degrees_of_freedom = 2αₙ,
  location = μₙ,
  scale = sqrt[βₙ (κₙ + 1) / (αₙ κₙ)]
)
```

The likelihood is a continuous approximation to count data. For usable positive calendar predictions, the predictive distribution is truncated below 0.5 days, then rounded to integer days. For its untruncated CDF `F`, the truncated CDF is `(F(x) − F(0.5)) / (1 − F(0.5))` for `x ≥ 0.5`. Daily probability is the mass between `d − 0.5` and `d + 0.5`. The integer median minimizes absolute error for this discretized distribution; its rounded 10th and 90th percentiles define the displayed nominal 80% interval. Rounding may make interval mass exceed 80%.

The Student-t CDF is calculated through a regularized incomplete beta continued fraction; quantiles use bisection. No random simulation, API, or LLM is used. All eligible historical intervals are used without recency weighting or automatic outlier filtering. A later iteration should compare nonstationary approaches; this baseline assumes exchangeable observations and may respond poorly to changes over time, asymmetry, and multimodal patterns.

The model learns a distribution for timing, not a mechanistic model of reproductive physiology. A wider interval is expected with greater observed variability, and parameter uncertainty decreases with more consistent observations. Real-world coverage may still be badly miscalibrated.

## Missing records and context

- No latent skipped-cycle model is implemented. A 56-day interval is treated as 56 days unless the user explicitly excludes it; the app does not assume two 28-day cycles.
- The exclusion flag belongs to the period start **ending** an interval. Deleting a middle period creates a merged interval, which is automatically excluded pending review.
- Forecasts remain anchored to the latest recorded start. Passing the original upper bound prompts record review, rather than conditioning on a potentially missing entry and repeatedly postponing a date.
- Predictions pause outside the selected adult natural-cycle context. Selecting that context is not evidence of model suitability. No validation has been performed for PCOS, perimenopause, adolescents, postpartum, hormonal contraception, pregnancy, or treatment changes. Context is global; historical intervals must be reviewed after a change.
- Valid past dates, unique starts, nonoverlapping recorded bleeding intervals, and bounded backup sizes are enforced. Recorded periods lasting longer than 61 days or gaps longer than 3,660 days are outside the storage validation contract, not diagnostic thresholds.
- Daily symptom/mood/notes data has no effect on the timing model. No causal or phase-based interpretation is made.

## What the app's retrospective check measures

Starting after three eligible completed intervals, predict the next eligible interval using only earlier eligible intervals. Repeat chronologically. Report mean absolute error, empirical coverage of the nominal 80% interval, and a historical-median baseline's error on identical held-out intervals. Exclusions are respected. No future observations enter past predictions.

This is exploratory personal backtesting. It is neither an independent test cohort nor prospective validation. Users can edit exclusions after observing outcomes, creating selection bias. Few recorded cycles give unstable error and coverage estimates. Demo results are synthetic and have no evidentiary value.

## Required before evidence-backed accuracy claims

1. Obtain a lawful, consented, representative dataset with provenance and appropriate governance. Public research code does not confer access to the original health records.
2. Pre-register intended users, prediction targets, exclusion/missingness rules, prior selection, and performance criteria.
3. Use participant-disjoint development and external test cohorts plus chronological evaluation within each test participant. Fit any population parameters and preprocessing on development data only.
4. Compare historical median, recent mean, this baseline, and the authors' generalized-Poisson approach. Include MAE, median absolute error, negative log likelihood or proper scoring rules, 50/80/95% interval coverage, and interval widths.
5. Report cold-start performance, missed-log behavior, irregular cycles, changing cycles, dropout, and subgroup uncertainty. Calibrate only on separate validation data, without tuning on the test cohort.
6. Conduct prospective independent evaluation against actual recorded onset dates and appropriate physiological reference measurements for any later ovulation feature. Have qualified clinical and regulatory review of the proposed claims before medical deployment.

The delivered app is a working foundation for that process, not its completion.
