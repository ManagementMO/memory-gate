// Text clean-up before speech. Some live model replies arrive with UTF-8 shown as Windows-1250: "ÂżQuĂ©" for "¿Qué"
// (2-3 of 12 Spanish replies in the live eval, evals/REPORT.md). It is in the model's output, so the captions need the
// same repair; the app can import repairMojibake from here. The repair is narrow on purpose: only a lead character
// for UTF-8 byte C2 or C3 ("Â" or "Ă" in Windows-1250) followed by one continuation-byte character (0x80-0xBF) is
// decoded, which is exactly how U+0080-U+00FF (¿ ¡ á é í ó ú ñ ü …) look when garbled this way. Anything else is left as is.

let cp1250: Map<string, number> | null = null;

function reverseCp1250(): Map<string, number> {
  if (cp1250) return cp1250;
  const m = new Map<string, number>();
  try {
    const dec = new TextDecoder('windows-1250');
    for (let b = 0x80; b <= 0xff; b++) {
      const ch = dec.decode(Uint8Array.of(b));
      if (ch && ch !== '�') m.set(ch, b);
    }
  } catch { /* no windows-1250 decoder: repair is a no-op */ }
  cp1250 = m;
  return m;
}

export function repairMojibake(text: string): string {
  if (!/[ÂĂ]/.test(text)) return text;
  const map = reverseCp1250();
  if (!map.size) return text;
  return text.replace(/[ÂĂ]./gsu, (pair) => {
    const lead = map.get(pair[0] ?? '');
    const trail = map.get(pair.slice(1));
    if ((lead !== 0xc2 && lead !== 0xc3) || trail === undefined || trail < 0x80 || trail > 0xbf) return pair;
    return String.fromCharCode(((lead & 0x1f) << 6) | (trail & 0x3f));
  });
}
