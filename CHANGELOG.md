# Changelog

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this
project adheres to [Semantic Versioning](https://semver.org/).

## 0.1.0 — 2026-06-16

First real release.

### Added

- `WindLayer` — a deck.gl v9 layer rendering a wind field as GPU-advected
  particles with fading comet trails, camera-synced via `project32`.
- **View-relative seeding:** `numParticles` is an on-screen density that stays
  constant at any zoom (particles seed/respawn within the viewport).
- **Per-particle lifetime** (`maxAge`) plus integer-hash respawns for a smooth,
  band-free distribution at every configuration.
- **Trail-buffer reprojection** so zoom/pan preserves trails without smearing or
  brightness flicker (falls back to clearing under bearing/pitch).
- **Zoom-independent advection** — the apparent flow rate is consistent across
  zoom rather than tracking the literal geographic speed.
- Props: `image`, `uMin`/`uMax`/`vMin`/`vMax`, `numParticles`, `speedFactor`,
  `dropRate`, `maxAge`, `fadeOpacity`, `pointSize`, `particleAlpha`, `maxSpeed`,
  `color`.

## 0.0.1

Name-reservation placeholder.
