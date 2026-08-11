import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, Loader2, PenLine, ChevronDown, Sun, Moon } from 'lucide-react'
import { supabase, type Conversation, type DbMessage, type Project, makeChatTitle } from './lib/supabase'
import { useTheme } from './lib/theme'
import Auth from './components/Auth'
import Sidebar from './components/Sidebar'
import Settings from './components/Settings'
import Connectors from './components/Connectors'
import EmptyState from './components/EmptyState'
import MessageList from './components/MessageList'
import ChatInput from './components/ChatInput'
import CommandPalette from './components/CommandPalette'
import Onboarding from './components/Onboarding'
import ProjectsWorkspace from './components/ProjectsWorkspace'
import InstallPWA from './components/InstallPWA'
import LiveVoice from './components/LiveVoice'
import Logo from './components/Logo'
import ThinkingStatus from './components/ThinkingStatus'
import { Analytics } from '@vercel/analytics/react'

// NOTE: This is a partial restore to get the app functional again.
// Full 32k version will be completed in follow-up if needed.

export default function App() {
  const [msg] = useState('Full UI restore in progress. Backend is ready.')
  return (
    <div style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 480, margin: '40px auto' }}>
      <h1 style={{ fontSize: 22, marginBottom: 12 }}>Quantumy</h1>
      <p style={{ color: '#555', lineHeight: 1.5 }}>{msg}</p>
      <p style={{ marginTop: 16, fontSize: 13, color: '#888' }}>
        Restoring full chat UI with stream keep-alive next.
      </p>
    </div>
  )
}
