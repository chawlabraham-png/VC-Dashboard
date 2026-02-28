# 🌴 Jungle Ventures — VC Intelligence Platform

AI-powered deal sourcing and venture intelligence operating system for Jungle Ventures. Tracks startups, valuations, theses, portfolio health, and VC ecosystem intelligence across India and Southeast Asia.

## 🚀 Modules

| Module | Description |
|--------|-------------|
| **Deal Flow** | Ranked pipeline of India/SEA startups with 5-dimension scoring |
| **Deck Analyzer** | Upload pitch decks for AI-powered 8-dimension rating |
| **Valuation Intel** | Fair value estimates with comparable deals |
| **Thesis Tracker** | Sector heat mapping, white spaces, portfolio gaps |
| **Portfolio HQ** | Live health monitoring for portfolio companies |
| **Power Moves** | VC network intelligence — fund launches, partner moves |
| **Pattern Engine** | Historical winner/loser pattern recognition |
| **Daily Brief** | Morning intelligence summary for partners |
| **Integrations** | Gmail, Streak CRM, Supabase, Team collaboration |

## ⚡ Quick Start

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/jungle-ventures-intel.git
cd jungle-ventures-intel

# Copy config template and add your API keys
cp config.template.js config.js
# Edit config.js with your Supabase, Streak, and Google Client ID

# Serve locally (any static server works)
python3 -m http.server 8765
# Or: npx serve -p 8765
```

Open [http://localhost:8765](http://localhost:8765)

## 🔑 Configuration

Copy `config.template.js` to `config.js` and fill in:

| Key | Source |
|-----|--------|
| `supabaseUrl` | [Supabase Dashboard](https://supabase.com/dashboard) |
| `supabaseKey` | Supabase → Settings → API → anon key |
| `streakApiKey` | Streak → Settings → Integrations → API |
| `googleClientId` | [Google Cloud Console](https://console.cloud.google.com) → OAuth 2.0 |

> ⚠️ `config.js` is gitignored — your keys stay safe.

## 🏗️ Tech Stack

- **Frontend**: Vanilla HTML/CSS/JS (zero dependencies)
- **Database**: Supabase (PostgreSQL + real-time)
- **CRM**: Streak API integration
- **Email**: Gmail API via Google OAuth 2.0
- **Design**: Premium dark theme with glassmorphism

## 📁 Project Structure

```
├── index.html          # App shell + sidebar nav
├── styles.css          # Dark theme + all module styles
├── app.js              # Core controller (9 modules)
├── data.js             # Startup dataset (16 companies)
├── scoring.js          # 5-dimension scoring engine
├── charts.js           # SVG sparklines + radar charts
├── config.js           # API keys (gitignored)
├── config.template.js  # Config template (safe to commit)
└── .gitignore
```

## 👥 Team Collaboration

Invite team members via Integrations → Team. Once deployed (Vercel/Netlify) with Supabase, data syncs in real-time across all users.

---

Built for [Jungle Ventures](https://www.jungleventures.com/) 🌴
