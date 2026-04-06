# Payne's Yes Chef 👨‍🍳

Family meal planner — Next.js + Vercel.

---

## Deploy in 5 steps

### 1. Extract this folder on your Chromebook
Unzip and open your Linux terminal (Crostini). Navigate to the folder:
```bash
cd ~/Downloads/yes-chef
```

### 2. Install dependencies
```bash
npm install
```

### 3. Get your Anthropic API key
- Go to https://console.anthropic.com/
- Sign in / create account
- Go to **API Keys** → **Create Key**
- Copy the key (starts with `sk-ant-...`)

### 4. Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit — Payne's Yes Chef"
git branch -M main
git remote add origin https://github.com/andypayne79/yes-chef.git
git push -u origin main
```
> If asked for credentials: username = `andypayne79`, password = your GitHub personal access token

### 5. Deploy on Vercel
1. Go to https://vercel.com and sign in with GitHub
2. Click **Add New Project**
3. Import **andypayne79/yes-chef**
4. Before deploying, click **Environment Variables** and add:
   - Name: `ANTHROPIC_API_KEY`
   - Value: your key from step 3
5. Click **Deploy**

Done! Vercel gives you a URL like `yes-chef-andypayne79.vercel.app`

---

## Add to home screen (iOS Safari)
1. Open your Vercel URL in Safari
2. Tap the Share button
3. Tap **Add to Home Screen**
4. Tap Add — it'll appear as a full-screen app

---

## Run locally (optional)
```bash
cp .env.local.example .env.local
# Edit .env.local and add your real API key
npm run dev
# Open http://localhost:3000
```

---

## Data storage
Data is saved in **localStorage** on each device. This means:
- ✅ Works offline for viewing saved meals
- ✅ Completely private — no database needed
- ⚠️ Data is per-device (Andy's phone and Clare's phone are separate)
- To share data between devices, export/import will be added in a future update
