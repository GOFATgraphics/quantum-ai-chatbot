import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, Loader2, PenLine, ChevronDown, Check, Sun, Moon } from 'lucide-react'
import { supabase, type Conversation, type DbMessage, type Project, makeChatTitle } from './lib/supabase'
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

// TEMPORARY STUB - will be replaced
export default function App() {
  return (
    <div style={{padding: 40, fontFamily: 'system-ui', background: '#111', color: '#fff', minHeight: '100vh'}}>
      <h1>Quantumy — restoring…</h1>
      <p>Please wait for the next deploy. If this persists, re-upload src/App.tsx from the repo artifacts.</p>
    </div>
  )
}
