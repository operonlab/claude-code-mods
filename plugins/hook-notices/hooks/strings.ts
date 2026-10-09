export type Strings = {
  title: string
  action: string
  folded: string
  open: string
  empty: string
  bandRead: (count: number) => string
  bandUnread: (count: number, alerts: number, headline: string) => string
}

export const STRINGS: Record<'en' | 'zh-TW', Strings> = {
  en: {
    title: 'Hook messages',
    action: 'Open',
    folded: 'Hook messages folded',
    open: 'Hook messages open',
    empty: 'No hook messages yet',
    bandRead: count => `🪝 Hook messages · ${count} · read`,
    bandUnread: (count, alerts, headline) => `🪝 Hook messages · ${count}${alerts > 0 ? ` · ⚠ ${alerts}` : ''} · ${headline}`,
  },
  'zh-TW': {
    title: 'hook 訊息',
    action: '展開',
    folded: 'hook 訊息已收起',
    open: 'hook 訊息已展開',
    empty: '還沒有 hook 訊息',
    bandRead: count => `🪝 hook 訊息 · ${count} 則 · 已讀`,
    bandUnread: (count, alerts, headline) => `🪝 hook 訊息 · ${count} 則${alerts > 0 ? ` · ⚠ ${alerts}` : ''} · ${headline}`,
  },
}

export function stringsFor(language: unknown): Strings {
  return language === 'zh-TW' ? STRINGS['zh-TW'] : STRINGS.en
}
