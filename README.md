# Quantum AI Chatbot

A premium, smooth UI/UX AI chatbot mobile app inspired by modern design systems.

## Features

- ✨ Beautiful, clean mobile-first design
- 💬 Smooth message animations with Framer Motion
- 🤖 Real AI responses (xAI Grok / OpenAI-compatible)
- 📱 Fully responsive — feels native on mobile
- 🎨 Premium typography, spacing & micro-interactions
- 🔊 Voice input (Web Speech API)
- 🎯 Model selector (Quantum 3)
- ☀️ Dynamic time-of-day greeting

## Tech Stack

- React 18 + TypeScript
- Vite
- Tailwind CSS
- Framer Motion
- Lucide React

## Getting Started

```bash
npm install
npm run dev
```

Open http://localhost:5173

### API Key (for real AI)

1. Get a key from [xAI Console](https://console.x.ai) or OpenAI
2. Create `.env`:

```
VITE_XAI_API_KEY=your_key_here
```

Or paste the key inside the app settings.

Without a key the app runs in intelligent demo mode.

## Design

Faithfully recreates the provided mobile UI:
- Soft rounded message bubbles
- Clean white canvas
- Top bar with Free plan · Upgrade
- Bottom input with +, model picker, mic & send
- Greeting screen with logo & personalized greeting

Enjoy the premium experience ✨
