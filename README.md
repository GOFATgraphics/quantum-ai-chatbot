# Quantum AI Chatbot

A premium, smooth UI/UX AI chatbot mobile app inspired by modern design systems.

## Features

- ✨ Beautiful, clean mobile-first design
- 💬 Smooth message animations with Framer Motion
- 🤖 Real AI responses powered by xAI Grok
- 📱 Fully responsive — feels native on mobile
- 🎨 Premium typography, spacing & micro-interactions
- 🔊 Voice input (Web Speech API)
- 🎯 Model selector (Quantum 3)
- ☀️ Dynamic time-of-day greeting
- 🔒 **API key is never exposed to the browser**

## Tech Stack

- React 18 + TypeScript
- Vite
- Tailwind CSS
- Framer Motion
- Lucide React
- Vercel Serverless Function (secure proxy)

## Getting Started (Local)

```bash
npm install
npm run dev
```

Open http://localhost:5173

> Note: Locally the `/api/chat` route only works after you deploy or use `vercel dev`.
> Without the backend key the app falls back to intelligent demo responses.

## Deploy on Vercel (Recommended)

1. Push this repo to GitHub (already done).
2. Import the project in [Vercel](https://vercel.com).
3. Go to **Project Settings → Environment Variables** and add:

   | Name          | Value              |
   |---------------|--------------------|
   | `XAI_API_KEY` | your xAI API key   |

4. Redeploy.

Your key now lives **only** on the server. The frontend calls `/api/chat` and the serverless function talks to xAI.

## How the security works

```
Browser  →  /api/chat (Vercel Serverless)  →  xAI API
                 ↑
           XAI_API_KEY (env var)
```

- The secret never reaches the client.
- No `VITE_` prefix = not bundled into the JS.
- No localStorage storage of the key.

## Design

Faithfully recreates the provided mobile UI:
- Soft rounded message bubbles
- Clean white canvas
- Top bar with Free plan · Upgrade
- Bottom input with +, model picker, mic & send
- Greeting screen with logo & personalized greeting

Enjoy the premium experience ✨
