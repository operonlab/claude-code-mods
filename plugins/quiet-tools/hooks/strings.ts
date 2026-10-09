export type Strings = {
  on: string
  off: string
  blocked: string
  background: string
  timedOut: (seconds: number) => string
}

export const STRINGS: Record<'en' | 'zh-TW', Strings> = {
  en: {
    on: 'quiet-tools on: successful tool calls draw as one line.',
    off: 'quiet-tools off: tool rows draw in full.',
    blocked: 'blocked by hook: ',
    background: 'in background',
    timedOut: seconds => `timed out after ${seconds}s, in background`,
  },
  'zh-TW': {
    on: 'quiet-tools 已開啟：成功的工具呼叫收成一行。',
    off: 'quiet-tools 已關閉：工具呼叫完整顯示。',
    blocked: 'hook 擋下：',
    background: '背景執行中',
    timedOut: seconds => `${seconds} 秒逾時，轉到背景`,
  },
}

export function stringsFor(language: unknown): Strings {
  return language === 'zh-TW' ? STRINGS['zh-TW'] : STRINGS.en
}
