# Free Deployment Guide: Discord Clone

This guide explains how to deploy both the **Frontend (Next.js)** and **Backend (Express + WebSocket Gateway)** using completely free tier hosting platforms.

---

## Architecture for Free Deployment

```
[ Frontend: Next.js ]           -----> Hosted on: Vercel (100% Free)
[ Backend & WebSocket Gateway ] -----> Hosted on: Render / Railway / Fly.io (Free Tier)
```

---

## 1. Deploy Frontend on Vercel (Recommended, Free)

Vercel provides free global CDN hosting with automatic Git CI/CD for Next.js.

### Step-by-step:
1. Push your repository to **GitHub**:
   ```bash
   git init
   git add .
   git commit -m "feat: complete discord clone"
   git remote add origin https://github.com/<your-username>/<your-repo-name>.git
   git push -u origin main
   ```
2. Go to [vercel.com](https://vercel.com) and sign in with GitHub.
3. Click **"Add New"** > **"Project"** and select your repository.
4. Set **Root Directory** to `frontend`.
5. Under **Environment Variables**, add:
   - `NEXT_PUBLIC_GATEWAY_URL` = `wss://your-backend.onrender.com` (or your backend URL)
   - `NEXT_PUBLIC_API_URL` = `https://your-backend.onrender.com`
6. Click **Deploy**. Your frontend is now live!

---

## 2. Deploy Backend on Render.com (Free Tier)

Render supports WebSockets and background services with zero-cost free web instances.

### Step-by-step:
1. Go to [render.com](https://render.com) and sign in with GitHub.
2. Click **"New +"** > **"Web Service"**.
3. Connect your GitHub repository.
4. Configure the service settings:
   - **Name**: `discord-backend`
   - **Root Directory**: `backend`
   - **Environment**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free`
5. Under **Environment Variables**, add:
   - `PORT` = `10000` (Render will inject this automatically)
   - `WS_PORT` = `8080`
   - `JWT_SECRET` = `your_custom_secret_key`
6. Click **Create Web Service**. Render will deploy your REST API and WebSocket Gateway on a public HTTPS / WSS endpoint.

---

## 3. Alternative: Railway.app (Free Trial Credits)

1. Go to [railway.app](https://railway.app).
2. Click **"New Project"** > **"Deploy from GitHub repo"**.
3. Select the `backend` folder as the root.
4. Railway will automatically detect Node.js, run `npm run build`, and expose your service.

---

## 4. Local Testing before Deploying

To run both services locally with production environment settings:

```bash
# 1. Start Backend
cd backend
npm run build
npm start

# 2. Start Frontend
cd frontend
npm run dev
```
