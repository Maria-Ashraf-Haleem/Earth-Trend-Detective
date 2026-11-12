import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  BookOpen,
  Compass,
  FlaskConical,
  FolderOpen,
  GitCompare,
  Globe2,
  MessageSquare,
  Settings,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  short: string
  index: string
  icon: LucideIcon
  detail: string
}

export interface NavGroup {
  id: string
  label: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'workflow',
    label: 'Mission',
    items: [
      { to: '/', label: 'Overview', short: 'Overview', index: '01', icon: Globe2, detail: 'Mission briefing' },
      { to: '/explorer', label: 'Explore', short: 'Explore', index: '02', icon: Compass, detail: 'Read the map' },
      { to: '/lab', label: 'Analyze', short: 'Analyze', index: '03', icon: FlaskConical, detail: 'Design a study' },
    ],
  },
  {
    id: 'study',
    label: 'Study',
    items: [
      { to: '/results', label: 'Results', short: 'Results', index: '04', icon: Activity, detail: 'Live readout' },
      { to: '/experiments', label: 'Library', short: 'Library', index: '05', icon: FolderOpen, detail: 'Saved runs' },
      { to: '/compare', label: 'Compare', short: 'Compare', index: '06', icon: GitCompare, detail: 'Side by side' },
      { to: '/insights', label: 'Companion', short: 'Companion', index: '07', icon: MessageSquare, detail: 'Plain-language read' },
    ],
  },
  {
    id: 'reference',
    label: 'Reference',
    items: [
      { to: '/methodology', label: 'Data & method', short: 'Method', index: '08', icon: BookOpen, detail: 'Provenance' },
      { to: '/settings', label: 'Settings', short: 'Settings', index: '09', icon: Settings, detail: 'Workspace' },
    ],
  },
]

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items)

/** Five destinations stay in the header; the rest live behind “More”. */
export const PRIMARY_NAV: NavItem[] = NAV_ITEMS.filter((item) =>
  ['/', '/explorer', '/lab', '/results', '/experiments'].includes(item.to),
)

export const MORE_NAV: NavItem[] = NAV_ITEMS.filter(
  (item) => !['/', '/explorer', '/lab', '/results', '/experiments'].includes(item.to),
)

/** Result-oriented destinations, kept for command palette and legacy consumers. */
export const RESULT_ITEMS: NavItem[] = NAV_ITEMS.filter((item) => item.to === '/results' || item.to === '/insights')

export const PATH_LABELS: Record<string, string> = {
  '/': 'Overview',
  '/explorer': 'Explore',
  '/lab': 'Analyze',
  '/results': 'Results',
  '/insights': 'Companion',
  '/experiments': 'Library',
  '/compare': 'Compare',
  '/methodology': 'Data & method',
  '/settings': 'Settings',
}

export const PATH_INDEX: Record<string, string> = {
  '/': '01',
  '/explorer': '02',
  '/lab': '03',
  '/results': '04',
  '/insights': '07',
  '/experiments': '05',
  '/compare': '06',
  '/methodology': '08',
  '/settings': '09',
}
