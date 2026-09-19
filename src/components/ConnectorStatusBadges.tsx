import { motion } from 'framer-motion'
import { Plus } from 'lucide-react'
import {
  GmailIcon,
  DriveIcon,
  SheetsIcon,
  DocsIcon,
  CalendarIcon,
  OutlookIcon,
  ExcelIcon,
} from './BrandIcons'

export type ConnectorProvider =
  | 'gmail'
  | 'google_drive'
  | 'google_docs'
  | 'google_sheets'
  | 'google_calendar'
  | 'outlook'
  | 'excel'

const CONNECTOR_CONFIG: Record<
  string,
  { label: string; icon: (size?: number) => JSX.Element; color: string }
> = {
  gmail: {
    label: 'Gmail',
    icon: (s = 15) => <GmailIcon size={s} />,
    color: '#EA4335',
  },
  google_drive: {
    label: 'Google Drive',
    icon: (s = 15) => <DriveIcon size={s} />,
    color: '#34A853',
  },
  google_docs: {
    label: 'Google Docs',
    icon: (s = 15) => <DocsIcon size={s} />,
    color: '#4285F4',
  },
  google_sheets: {
    label: 'Google Sheets',
    icon: (s = 15) => <SheetsIcon size={s} />,
    color: '#0F9D58',
  },
  google_calendar: {
    label: 'Google Calendar',
    icon: (s = 15) => <CalendarIcon size={s} />,
    color: '#4285F4',
  },
  outlook: {
    label: 'Outlook',
    icon: (s = 15) => <OutlookIcon size={s} />,
    color: '#0A66C2',
  },
  excel: {
    label: 'Excel',
    icon: (s = 15) => <ExcelIcon size={s} />,
    color: '#107C41',
  },
}

type Props = {
  activeConnectors: string[]
  onOpenConnectors: () => void
  compact?: boolean
}

export default function ConnectorStatusBadges({
  activeConnectors,
  onOpenConnectors,
  compact = false,
}: Props) {
  const activeList = activeConnectors.filter((p) => CONNECTOR_CONFIG[p])

  if (activeList.length === 0) {
    return (
      <button
        type="button"
        onClick={onOpenConnectors}
        className="group flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium transition-all bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground border border-border/50 hover:border-border shadow-xs"
        title="Connect Google Workspace or Microsoft connectors"
      >
        <Plus className="w-3.5 h-3.5 transition-transform group-hover:rotate-90 duration-200" />
        <span className="hidden sm:inline">Connect Tools</span>
        <span className="sm:hidden">Connect</span>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={onOpenConnectors}
      className="group flex items-center gap-1 px-2.5 py-1 rounded-full transition-all bg-secondary/80 hover:bg-secondary border border-border/60 hover:border-border text-foreground shadow-xs cursor-pointer"
      title={`Active connectors: ${activeList.map((p) => CONNECTOR_CONFIG[p]?.label).join(', ')} (click to manage)`}
    >
      <div className="flex items-center -space-x-1 sm:space-x-1 mr-1">
        {activeList.map((provider) => {
          const cfg = CONNECTOR_CONFIG[provider]
          return (
            <span
              key={provider}
              className="inline-flex items-center justify-center transition-transform group-hover:scale-105"
              title={`${cfg.label} active`}
            >
              {cfg.icon(compact ? 13 : 15)}
            </span>
          )
        })}
      </div>
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
      <span className="text-[11px] font-semibold text-muted-foreground group-hover:text-foreground hidden md:inline ml-0.5">
        {activeList.length} Connected
      </span>
    </button>
  )
}

/**
 * Full-width badge display for EmptyState or Settings
 */
export function ConnectorShowcase({
  activeConnectors,
  onOpenConnectors,
}: {
  activeConnectors: string[]
  onOpenConnectors: () => void
}) {
  const activeSet = new Set(activeConnectors)
  const allProviders = [
    'gmail',
    'google_drive',
    'google_docs',
    'google_sheets',
    'google_calendar',
  ]

  return (
    <div className="flex flex-col items-center gap-2 mt-5">
      <div className="flex items-center gap-2 flex-wrap justify-center">
        {allProviders.map((provider) => {
          const cfg = CONNECTOR_CONFIG[provider]
          const isConnected = activeSet.has(provider)

          return (
            <motion.button
              key={provider}
              type="button"
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              onClick={onOpenConnectors}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-[12.5px] font-medium transition-all ${
                isConnected
                  ? 'bg-card border-border/80 text-foreground shadow-xs'
                  : 'bg-secondary/40 border-dashed border-border/60 text-muted-foreground/80 hover:text-foreground hover:border-border hover:bg-secondary/70'
              }`}
            >
              <div className={`transition-opacity ${isConnected ? 'opacity-100' : 'opacity-50 grayscale'}`}>
                {cfg.icon(16)}
              </div>
              <span>{cfg.label.replace('Google ', '')}</span>
              {isConnected ? (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              ) : (
                <span className="text-[10px] opacity-60">+</span>
              )}
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}
