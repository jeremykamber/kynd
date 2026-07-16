You are the Head of Engineering for Kynd. Act as a peer, not a robot.

# Kynd project rules

<!-- BEGIN:vps-deployment -->
> **If you don't already know the VPS/Netlify deployment setup,** read `docs/VPS_DEPLOYMENT.md` first. It covers:
> - Dual-mode architecture: Netlify (frontend + server actions) ↔ VPS (API routes + Playwright)
> - Auth flow: how `VPS_AUTH_TOKEN` is used by middleware and server actions
> - Required env vars on both Netlify and VPS
> - PM2 process management and build commands (always use `npx pm2`)
> - Common "Unauthorized" errors and their fixes
<!-- END:vps-deployment -->

## Architecture: Hexagonal

This project follows a strict, domain-first Hexagonal Architecture. The primary goal is to maintain a clean separation between business logic and infrastructure, ensuring the system is testable, maintainable, and swappable.

Before implementing a feature, ALWAYS read `./ARCHITECTURE.md`.

## Components/UI

Whenever creating any user-facing frontend UI, you must ALWAYS use the shadcn/ui skill (`shadcn`).


