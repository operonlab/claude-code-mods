import type { HistoryNote } from '../types'

export type Strings = {
  title: string
  off: string
  on: string
  empty: string
  notFullscreen: string
  navLabel: (count: number, newest: string | undefined) => string
  denyFullscreen: string
  denyPrefix: string
  history: (note: HistoryNote) => string
  placeholder: string
  submit: string
  noMatch: string
  count: (shown: number, total: number) => string
}

export const STRINGS: Record<'en' | 'zh-TW', Strings> = {
  en: {
    title: 'Prompts',
    off: 'Prompt navigator off (stays off in new sessions; /turn-nav turns it back on)',
    on: 'Prompt navigator on',
    empty: 'No prompts yet',
    notFullscreen: 'Not fullscreen: the list works, jumping does not',
    navLabel: (count, newest) => `🧭 Prompts · ${count}${newest ? ` · ${newest}` : ''}`,
    denyFullscreen: "Can't jump: this session is not fullscreen (panes opened after enabling it are)",
    denyPrefix: "Can't jump: ",
    history: note => note.kind === 'none'
      ? 'No earlier prompts found in the session file'
      : note.kind === 'cut'
        ? 'Earlier prompts: the session file is long, the newest are listed'
        : `Earlier prompts could not be read: ${note.reason}`,
    placeholder: 'fuzzy search',
    submit: 'jump to newest',
    noMatch: 'Nothing matches',
    count: (shown, total) => `${shown} of ${total}`,
  },
  'zh-TW': {
    title: '導覽',
    off: '導覽已關閉（新 session 也不再開啟，/turn-nav 可再開）',
    on: '導覽已開啟',
    empty: '還沒有對話',
    notFullscreen: '非全螢幕：只能看清單，不能跳轉',
    navLabel: (count, newest) => `🧭 導覽 · ${count} 則${newest ? ` · ${newest}` : ''}`,
    denyFullscreen: '跳不過去：這個 session 不是全螢幕（設定後新開的窗格才是）',
    denyPrefix: '跳不過去：',
    history: note => note.kind === 'none'
      ? 'session 檔裡找不到先前的對話'
      : note.kind === 'cut'
        ? '先前的對話：session 檔太長，只列出最新的'
        : `先前的對話讀不到：${note.reason}`,
    placeholder: '模糊搜尋',
    submit: '跳到最新一則',
    noMatch: '沒有符合的',
    count: (shown, total) => `${shown} / ${total}`,
  },
}

export function stringsFor(language: unknown): Strings {
  return language === 'zh-TW' ? STRINGS['zh-TW'] : STRINGS.en
}
