# Host this fork on GitHub Pages

We deploy the Denver game as a **static site to GitHub Pages** at https://grantwasil.github.io/JetLagHideAndSeek/, built by [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml) (withastro/action, Node 24 + pnpm). The app is fully client-side with no secrets or backend, so a static CDN host is sufficient; GitHub Pages is free, needs no new accounts, and Astro's `base: "JetLagHideAndSeek"` already matches the repo name so assets resolve under `/JetLagHideAndSeek/` with no path changes.

**Considered options:** Cloudflare Pages (serves at a clean root, but needs a new account and changing `base` to `/`); a local tunnel like ngrok/cloudflared (fragile — the host machine must stay awake and the URL can rotate). For a short-lived game with ~6 players, GitHub Pages was the least-effort, zero-cost, zero-secret choice.

**Consequences (surprising, and not visible in the code):**

- **Deploy via dispatch, not push.** A plain `git push` to `main` does not reliably trigger the workflow in this fork (observed repeatedly, 2026-07-01). Deploy with `gh workflow run deploy.yml --ref main` (or Actions → "Run workflow"), then `gh run watch <id>`.
- **`pe-wasm.wasm` 404 is normal.** The ArcGIS geometry operators load their WebAssembly module from the `js.arcgis.com` CDN (ArcGIS's default `assetsPath`), so `/_astro/pe-wasm.wasm` returns 404 on both this fork and upstream. Geometry still works — it is not a broken deploy. An automated verifier once mis-flagged this as a critical blocker.
- **`base` is coupled to the repo name.** Renaming the repo, or hosting at a domain root, would break every asset path until `base` (and the hardcoded icon URLs in `astro.config.mjs` / `Layout.astro`) are updated.
- **Teardown:** set Settings → Pages → Source to "None", or make the repo private.
