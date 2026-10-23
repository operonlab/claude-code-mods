export type Strings = {
  title: string
  off: string
  on: string
  empty: string
  noMatch: string
  placeholder: string
  submit: string
  count: (shown: number, total: number) => string
  navLabel: (count: number, newest: string | undefined) => string
  denyFullscreen: string
  denyPrefix: string
  openFailed: string
  revealed: string
}

export const STRINGS: Record<'en' | 'zh-TW', Strings> = {
  en: {
    title: 'Links & files',
    off: 'Link navigator off (stays off in new sessions; /link-nav turns it back on)',
    on: 'Link navigator on',
    empty: 'No files or links yet',
    noMatch: 'Nothing matches',
    placeholder: 'fuzzy search',
    submit: 'open first',
    count: (shown, total) => `${shown} of ${total}`,
    navLabel: (count, newest) => `🔗 Links · ${count}${newest ? ` · ${newest}` : ''}`,
    denyFullscreen: "Can't jump: this session is not fullscreen",
    denyPrefix: "Can't jump: ",
    openFailed: "Couldn't open: ",
    revealed: 'Shown in Finder, not opened: a file like this would run',
  },
  'zh-TW': {
    title: '連結與檔案',
    off: '連結導覽已關閉（新 session 也不再開啟，/link-nav 可再開）',
    on: '連結導覽已開啟',
    empty: '還沒有檔案或連結',
    noMatch: '沒有符合的',
    placeholder: '模糊搜尋',
    submit: '開第一個',
    count: (shown, total) => `${shown} / ${total}`,
    navLabel: (count, newest) => `🔗 連結 · ${count} 個${newest ? ` · ${newest}` : ''}`,
    denyFullscreen: '跳不過去：這個 session 不是全螢幕',
    denyPrefix: '跳不過去：',
    openFailed: '開不了：',
    revealed: '已在 Finder 中標出，沒有直接開：這類檔案一開就會執行',
  },
}

export function stringsFor(language: unknown): Strings {
  return language === 'zh-TW' ? STRINGS['zh-TW'] : STRINGS.en
}
