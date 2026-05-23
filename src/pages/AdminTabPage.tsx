import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import WarAdminPage from './WarAdminPage'

type AdminTabKey = 'overview' | 'reviews' | 'recruiters' | 'users' | 'social' | 'quizzes' | 'logs' | 'notifications' | 'prizes'

type AdminTabPageProps = {
  defaultTab?: AdminTabKey
}

const tabLabels: Record<AdminTabKey, string> = {
  overview: 'Overview',
  reviews: 'Reviews',
  recruiters: 'Recruiters',
  users: 'Users',
  social: 'Social accounts',
  quizzes: 'Quiz bank',
  logs: 'Verification logs',
  notifications: 'Notifications',
  prizes: 'Prizes',
}

function inferTab(section?: string): AdminTabKey {
  switch (String(section || '').trim().toLowerCase()) {
    case 'reviews':
      return 'reviews'
    case 'recruiters':
    case 'recruiter-applications':
      return 'recruiters'
    case 'users':
    case 'recruits':
    case 'risk':
      return 'users'
    case 'social':
    case 'social-checks':
      return 'social'
    case 'quizzes':
      return 'quizzes'
    case 'logs':
      return 'logs'
    case 'notifications':
      return 'notifications'
    case 'prizes':
      return 'prizes'
    default:
      return 'overview'
  }
}

export default function AdminTabPage({ defaultTab }: AdminTabPageProps) {
  const { section } = useParams()
  const targetTab = defaultTab || inferTab(section)

  useEffect(() => {
    let cancelled = false
    let attempts = 0
    let timer = 0

    const openTargetTab = () => {
      if (cancelled) return

      const label = tabLabels[targetTab]
      const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.war-admin-tab'))
      const target = buttons.find((button) => button.textContent?.trim() === label)

      if (target) {
        target.click()
        return
      }

      if (attempts >= 40) return
      attempts += 1
      timer = window.setTimeout(openTargetTab, 250)
    }

    openTargetTab()

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [targetTab])

  return <WarAdminPage />
}
