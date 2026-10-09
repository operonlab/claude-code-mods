export type Strings = {
  title: string
  action: string
  off: string
  on: string
  empty: string
  notFullscreen: string
  navLabel: (count: number, newest: string | undefined) => string
  denyFullscreen: string
  denyPrefix: string
}

export const STRINGS: Record<'en' | 'zh-TW', Strings> = {
  en: {
    title: 'Prompts',
    action: 'Open',
    off: 'Prompt navigator off (stays off in new sessions; /turn-nav turns it back on)',
    on: 'Prompt navigator on',
    empty: 'No prompts yet',
    notFullscreen: 'Not fullscreen: the list works, jumping does not',
    navLabel: (count, newest) => `🧭 Prompts · ${count}${newest ? ` · ${newest}` : ''}`,
    denyFullscreen: "Can't jump: this session is not fullscreen (panes opened after enabling it are)",
    denyPrefix: "Can't jump: ",
  },
  'zh-TW': {
    title: '導覽',
    action: '開啟',
    off: '導覽已關閉（新 session 也不再開啟，/turn-nav 可再開）',
    on: '導覽已開啟',
    empty: '還沒有對話',
    notFullscreen: '非全螢幕：只能看清單，不能跳轉',
    navLabel: (count, newest) => `🧭 導覽 · ${count} 則${newest ? ` · ${newest}` : ''}`,
    denyFullscreen: '跳不過去：這個 session 不是全螢幕（設定後新開的窗格才是）',
    denyPrefix: '跳不過去：',
  },
}

export function stringsFor(language: unknown): Strings {
  return language === 'zh-TW' ? STRINGS['zh-TW'] : STRINGS.en
}
