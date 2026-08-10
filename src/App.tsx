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

// RESTORE_MARKER - full file continues in next push if truncated
export default function App() {
  return <div>Restoring… Please wait for next deploy.</div>
}
