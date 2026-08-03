/** Typographic / “smart” punctuation → ASCII so the convert parser can find dialogue. */
const DOUBLE_QUOTES = /[\u201C\u201D\u201E\u201F\u00AB\u00BB\u2033\u301D\u301E]/g // “”„‟«»″〝〞
const SINGLE_QUOTES = /[\u2018\u2019\u201A\u201B\u2032\u00B4]/g // ‘’‚‛′´

export function normalizeScriptText(text: string): string {
  return text
    .replace(DOUBLE_QUOTES, '"')
    .replace(SINGLE_QUOTES, "'")
    .replace(/\u2026/g, '...') // … → ...
}
