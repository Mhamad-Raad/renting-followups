/** The small part of fontkit the font test uses (the package ships no types). */
declare module 'fontkit' {
  export function openSync(path: string): { hasGlyphForCodePoint(codePoint: number): boolean };
}
