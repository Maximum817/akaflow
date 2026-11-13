# akaflow

A responsive, browser-only cycle tracker prepared for GitHub Pages. No package install, build step, backend, API key, or external font is required.

Features: period logging and editing, daily symptoms/mood/notes, calendar, original Bayesian next-period baseline, model prediction ranges, chronological personal backtesting against a historical median, explicit interval exclusion, tracking contexts, sample mode, and JSON backup/restore.

**This is an unvalidated tracking prototype.** It does not predict ovulation, fertility, hormone levels, or pregnancy, and must not be used as contraception or diagnosis. The baseline is science-informed; its clinical accuracy has not been established. See [the research and algorithm specification](SCIENCE.md).

## Run locally

From this folder:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Open <http://127.0.0.1:8765>. Choose **Explore a sample cycle** to try predictions without changing your saved records. Leave demo mode before entering real records. Four period starts are needed to produce the first forecast.

## Deploy to GitHub Pages

1. Create a GitHub repository and push these files to its `main` branch.
2. In the repository's **Settings → Pages → Build and deployment → Source**, choose **GitHub Actions**.
3. Run **Test and deploy GitHub Pages**, or push to `main`. The workflow tests the model before deploying only the HTML, JavaScript, stylesheet, and icon files.
4. Visit the URL returned by the deployment, typically `https://YOUR-USERNAME.github.io/YOUR-REPO/`.

All asset links are relative, so a repository subpath works. For branch-based Pages, the root `index.html` also works. [GitHub's official setup documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site).

Repository: [Maximum817/akaflow](https://github.com/Maximum817/akaflow). Public source and GitHub Pages hosting, as requested. Personal health records remain in browser storage and are never included in the repository.

## Privacy and records

- App data is stored under `akaflo.records.v1` in browser `localStorage`. The app makes no API calls. No analytics, third-party assets, or remote model service is loaded.
- Hosting providers receive normal website requests. This is not a promise of network anonymity.
- Storage and exported JSON are **not encrypted**. Browser/device access and other scripts at the same origin can expose records. GitHub project pages under the same username share an origin; prefer a dedicated domain/origin for real sensitive data. This prototype does not provide accounts, locking, encrypted sync, or multi-device backup.
- Clearing site storage or using private browsing may lose records. Export your own backup. Never commit health records to Git.
- Sample mode is in-memory only; loading it does not write or replace personal data.

## Tests

```sh
node model.test.js
node --check app.js
```

On a Mac without Node, run the same dependency-free model assertions with JavaScriptCore from the repository root:

```sh
/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc model.test.js
```

Tests cover reference Student-t probabilities, posterior parameters, normalized positive daily probabilities, uncertainty behavior, calendar boundaries, date/backup validation, context gating, exclusions, stale forecasts, and no future leakage in backtesting. Mathematical tests do not establish real-world clinical accuracy.
