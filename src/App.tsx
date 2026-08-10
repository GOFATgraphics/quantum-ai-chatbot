import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, Loader2, PenLine, ChevronDown, Check, Sun, Moon } from 'lucide-react'
import { supabase, type Conversation, type DbMessage, type Project, makeChatTitle } from './lib/supabase'
import { useTheme } from './lib/theme'
import Auth from './components/Auth'
import Sidebar from './components/Sidebar'
import Settings from './components/Settings'
import Connectors from './components/Connectors'
import Onboarding from './components/Onboarding'
import Logo from './components/Logo'
import MessageList, { type ChatMessage } from './components/MessageList'
import EmptyState from './components/EmptyState'
import ChatInput, { type PendingFile } from './components/ChatInput'
import LiveVoice, { type VoiceGender } from './components/LiveVoice'
import InstallPWA from './components/InstallPWA'
import CommandPalette from './components/CommandPalette'
import ProjectsWorkspace from './components/ProjectsWorkspace'

// visualViewport-sized shell — Gemini-style keyboard layout

const MODELS = [
  { id: 'quantum-flash', name: 'Quantum Flash', badge: 'Fast' as string | null, anthropic: 'claude-haiku-4-5-20251001', blurb: 'Instant answers' },
  { id: 'quantum-lite', name: 'Quantum Lite', badge: null as string | null, anthropic: 'claude-sonnet-4-6', blurb: 'Balanced everyday work' },
  { id: 'quantum-pro', name: 'Quantum Pro', badge: 'Pro' as string | null, anthropic: 'claude-opus-4-6', blurb: 'Deep reasoning & complex tasks' },
]

function generateId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function creativeGreeting(firstName: string) {
  const n = (firstName || '').trim()
  if (n && n.toLowerCase() !== 'there') return `What can I help you with today, ${n}?`
  return 'What can I help you with today?'
}

export default function App() {
  return <div className="flex items-center justify-center min-h-dvh">Restoring…</div>
}
