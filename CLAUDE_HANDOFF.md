# Jungle Ventures Platform - Claude Context

## Current State
- The user is building a VC Intelligence Dashboard (Vanilla HTML/JS/CSS) connected to **Supabase** (PostgreSQL backend).
- The codebase is located in: `/Users/bhand/.gemini/antigravity/scratch/jungle-ventures-dealflow`
- The user deployed to Hostinger but ran into aggressive browser caching issues, preventing new features (like removing the login screen and adding the Streak CRM sync logic) from rendering properly.
- **The live database works perfectly:** The Supabase `streak_deals` table has 799 deals successfully populated by n8n.

## Immediate Objective
The user has a paid subscription to **Hostinger** and MUST continue using it. The current deployment process (zipping files and uploading via Hostinger Web File Manager) is causing aggressive caching issues where the live site does not reflect the latest code, resulting in an empty dashboard.

Your mission: Connect to the GitHub repo, and establish a reliable deployment pipeline to **Hostinger**. This could involve setting up GitHub Actions to deploy via FTP/SSH to Hostinger, or establishing a workflow that reliably busts the Hostinger CDN/Browser cache so the user can actually see their Supabase data. 

## Key Architecture Specs
- **Logic:** `app.js` runs the dashboard logic, fetching from `initSupabase()`.
- **Database:** Supabase REST API via `config.js` (`supabaseUrl` and `supabaseKey`).
- **Data Integrations:** Streak CRM synchronizes to Supabase via an n8n webhook/cron. OpenAI synchronizes daily news to Supabase via n8n.
- **Cache Fixes:** We recently added cache-busters (`?v=3`) to the `.html` script tags to beat caching. We decoupled the fetching functions inside `app.js` so they don't block each other.

Please read `app.js` and `initSupabase()` to understand the architecture, then guide the user through setting up a bulletproof deployment to their Hostinger account.
