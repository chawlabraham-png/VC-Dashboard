# 🌴 Deploy to Hostinger — Step-by-Step Guide

## Prerequisites
- A Hostinger hosting plan (any shared hosting plan works)
- All files from this project folder

## Step 1: Prepare Your Files

Make sure you have your `config.js` ready with your actual API keys.
If you don't need Supabase/Streak/Gmail integrations, the app works fine without them (demo mode).

## Step 2: Upload to Hostinger

### Option A: File Manager (Easiest)
1. Log in to [Hostinger hPanel](https://hpanel.hostinger.com)
2. Go to **Files → File Manager**
3. Navigate to `public_html/` (this is your website root)
4. **Upload** all project files:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `data.js`
   - `scoring.js`
   - `charts.js`
   - `config.js` (with your real keys, or the template)
   - `config.template.js`
   - `.htaccess`
5. Done! Your site is live at your domain.

### Option B: FTP Upload
1. In hPanel → **Files → FTP Accounts** → note your credentials
2. Use FileZilla or any FTP client:
   - Host: `ftp.yourdomain.com`
   - Username: (from hPanel)
   - Password: (from hPanel)
   - Port: `21`
3. Upload all files to `/public_html/`

### Option C: Git Deployment
1. In hPanel → **Advanced → Git**
2. Create a Git repository
3. Push your code:
   ```bash
   git init
   git add .
   git commit -m "Initial deploy"
   git remote add hostinger ssh://your-git-url
   git push hostinger main
   ```

## Step 3: Point Your Domain
1. In hPanel → **Domains → your domain**
2. Make sure DNS is pointing to Hostinger nameservers:
   - `ns1.dns-parking.com`
   - `ns2.dns-parking.com`
3. If using a custom domain, add it under **Domains → Add Domain**

## Step 4: Enable SSL (Free)
1. In hPanel → **Security → SSL**
2. Click **Setup** for your domain
3. Hostinger provides free SSL — enable it
4. Force HTTPS redirect will be automatic

## Step 5: Verify
Visit `https://yourdomain.com` and verify:
- ✅ Page loads with dark theme
- ✅ All 9 sidebar modules work
- ✅ Deal cards show with scores and sparklines
- ✅ Filters work (region, sector, tier, search)
- ✅ Deck Analyzer upload zone is clickable

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Blank page | Check browser console for errors. Make sure `config.js` exists (copy from `config.template.js` if needed) |
| JS module error | Ensure `.htaccess` is uploaded — it sets correct MIME types |
| Styles not loading | Hard-refresh with `Ctrl+Shift+R` or clear cache |
| 404 errors | Make sure files are in `public_html/`, not a subfolder |

## File Structure on Hostinger
```
public_html/
├── index.html          ← Entry point
├── styles.css
├── app.js
├── data.js
├── scoring.js
├── charts.js
├── config.js           ← Your API keys (NOT in git)
├── config.template.js
├── .htaccess           ← Performance & security
└── README.md
```

---
**Note:** This is a fully static site — no server, no build step, no Node.js needed. Any shared hosting plan works. 🚀
