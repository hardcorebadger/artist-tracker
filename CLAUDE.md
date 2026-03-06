# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Artist Tracker (branded as "Indiestack") — a SaaS platform for music industry professionals to discover, track, and evaluate artists for signing. Built on Firebase with a React frontend and Python Cloud Functions backend.

## Development Commands

```bash
# Frontend dev server (React on :3000)
./dev.sh app

# Backend functions emulator (on :5001)
./dev.sh functions

# Full emulator suite (functions + Firestore + Auth)
./dev.sh all

# Frontend tests
cd app && npm test
# Single test
cd app && npm test -- --testPathPattern=<pattern>

# Deploy
./ship.sh              # Full stack
./ship.sh app          # Frontend only (builds + deploys hosting)
./ship.sh functions    # Backend only (requires .env.prod + .env)
./ship.sh functions <name>  # Single function
./ship.sh firestore    # Rules + indexes
```

## Architecture

### Frontend (`app/src/`)
- **React 18** with **Chakra UI 2.x** (dark mode default, teal color scheme) and **MUI X Data Grid Pro** for artist tables
- **React Router v6** — routes in `routing/Routes.js`, all page components lazy-loaded
- **Firebase SDK 10** — initialized in `firebase.js`, config in `config.js`
- **Two React Contexts** (defined in `App.js`):
  - `ColumnDataContext` — global data: statistic types, link sources, tags, users, organization
  - `CurrentReportContext` — active report, query model, grid rows
  - Both persist to localStorage for query state survival across reloads

### Backend (`functions/`)
- **Python Cloud Functions** — main entry in `main.py` (~2000 lines), houses the HTTP API (`fn_v3_api`)
- **Controllers** (`controllers/`) — business logic: `tracking.py` (artist add/stats), `artists.py` (CRUD), `playlists.py`, `lookalike.py`, `eval.py`
- **Lib** (`lib/`) — service clients and models: `spotify.py`, `youtube.py`, `songstats.py`, `cloud_sql.py`, `stripe_client.py`, `models.py`
- **SQLAlchemy ORM** with PostgreSQL (Cloud SQL) — models in `lib/models.py`
- **Firestore** used only for user profiles (`users/{uid}`) and organization metadata (`organizations/{orgId}`)
- **Cron jobs** in `cron_jobs.py` — scheduled stats ingestion and updates

### API Pattern
- HTTP endpoint `fn_v3_api` handles all routes via Flask-style request parsing in `main.py`
- Auth: Bearer token (Firebase ID token) extracted and verified per request
- Multi-tenancy: `X-Organization` header identifies the active organization
- Async work offloaded to **Cloud Tasks** (artist addition, lookalike mining, reimports)
- Error convention: status 299 used to signal "handled error, do not retry" to Cloud Functions

### Key Integrations
- **Spotify API** (3 credential pairs for rate limit rotation)
- **YouTube API**, **SongStats API** for metrics
- **LemonSqueezy** for subscriptions (product IDs mapped to access tiers in `config.js`)
- **Stripe** (legacy payment support, webhooks in `stripe_client.py`)
- **Twilio** for SMS verification

### Auth & Access Control
- Firebase Auth (email/password + Google OAuth) → Firestore user doc → org membership
- Route guards in `routing/`: `AuthGuard` (auth + org), `AccessGuard` (subscription tier), `AdminGuard`, `GuestGuard`
- Subscription tiers: "starter" and "elite" gated by LemonSqueezy product IDs

### Database
- **PostgreSQL** (Cloud SQL) is the primary data store for artists, statistics, evaluations, tags, playlists, imports
- **Firestore** is secondary — only auth/user profiles and org settings
- Key models: `Artist`, `Statistic`, `StatisticType`, `ArtistTag`, `OrganizationArtist`, `Playlist`, `Import`, `Lookalike`, `Subscription`

## Environment Files

Backend requires `.env` and `.env.dev` (local) or `.env.prod` (deploy) in `functions/`. See `.env.sample` files for required variables (SQL credentials, Spotify/YouTube/SongStats keys, Twilio, Stripe).

Frontend config is in `app/src/config.js` (Firebase config + LemonSqueezy product mappings).

## Key Conventions

- `goFetch(user, method, path, body?)` — the standard API call helper used throughout the frontend (defined in `App.js`), handles auth token and org header
- `v3_url` — API base URL, auto-switches between local emulator and production in `firebase.js`
- The `useUser()` hook (from `AuthGuard`) provides the current user + org context to all authenticated pages
- Page components follow naming: `Page<Name>.js` in `pages/`
- The app redirects non-indiestack hostnames to `indiestack.app` in production
