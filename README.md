# Table Tennis Scorer

## Local setup
```bash
npm install
cp .env.example .env.local   # then fill in your real Supabase URL + anon key
npm run dev
```

## Deploying via GitHub + Cloudflare Pages

1. **Push this folder to a new GitHub repo.**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git push -u origin main
   ```

2. **Connect Cloudflare Pages to the repo.**
   - Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git
   - Pick this repo
   - Build settings:
     - Framework preset: **Vite**
     - Build command: `npm run build`
     - Build output directory: `dist`

3. **Add environment variables in Cloudflare Pages** (Settings → Environment variables), for both Production and Preview:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

4. **Deploy.** Every push to `main` will now auto-build and deploy.

5. **Custom domain** (optional): Pages project → Custom domains → add the domain you bought through Cloudflare. DNS wiring is automatic since it's all inside the same account.

## Database / backend
See `schema_v2.sql` and the `supabase-functions/` folder from earlier — these need to be run/deployed against your Supabase project independently of this frontend deploy.
