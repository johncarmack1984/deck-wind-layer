---
"deck-wind-layer": patch
---

Resolve the `js-yaml` merge-key DoS advisory ([GHSA-h67p-54hq-rp68](https://github.com/advisories/GHSA-h67p-54hq-rp68)) by forcing the transitive dependency to the patched 4.2.0 via pnpm `overrides` (`read-yaml-file` → ^2.1.0, `js-yaml` → ^4.2.0). The vulnerable 3.14.2 came in only through the changesets release toolchain, so this is a dev-tooling fix — the published bundle is unchanged.
