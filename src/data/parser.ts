// Parser for the song notation:
//   - Note letters: C D E F G A B (case insensitive)
//   - Optional sharp: # immediately after the letter
//   - Octave modifier: '-' (lower), absent (middle), '+' (higher)
//   - Rest: '_'
//   - Whitespace, commas, '|' (bar lines), and newlines are separators (ignored).
//
// Octave mapping (3-octave range):
//   '-' (lower)  -> MIDI octave 4  (C4 = 60)
//   ''  (middle) -> MIDI octave 5  (C5 = 72)
//   '+' (upper)  -> MIDI octave 6  (C6 = 84)
//
// Each note also accepts an optional '~' suffix to mark a held/long note (×2 duration in auto mode).
// e.g. "C~" or "C+~". This is purely metadata for the auto/learning mode tempo;
// the parser still emits a single note event.

export interface NoteEvent {
  /** MIDI note number (0..127). Null = rest. */
  midi: number | null;
  /** Display label like "C-", "F#", "G+". For rests = "_". */
  label: string;
  /** Duration weight (1 = quarter, 2 = half, 0.5 = eighth). */
  weight: number;
}

const LETTER_TO_SEMI: Record<string, number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11
};

const LOWER_BASE = 60; // C4 (lower octave starts here)
const MIDDLE_BASE = 72; // C5
const UPPER_BASE = 84; // C6

export function parseSong(text: string): { events: NoteEvent[]; errors: string[] } {
  const events: NoteEvent[] = [];
  const errors: string[] = [];
  // Strip comments after // or # at line start (we use # as sharp, so only consider // for line comments).
  const cleaned = text
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/\r/g, ' ');

  let i = 0;
  const src = cleaned;
  let pos = 0; // for error reporting

  const isSep = (c: string) => c === ' ' || c === '\t' || c === '\n' || c === ',' || c === '|';

  while (i < src.length) {
    const c = src[i];
    if (isSep(c)) { i++; pos++; continue; }

    if (c === '_') {
      let weight = 1;
      i++;
      if (src[i] === '~') { weight = 2; i++; }
      events.push({ midi: null, label: '_', weight });
      continue;
    }

    const letterRaw = c.toUpperCase();
    if (!(letterRaw in LETTER_TO_SEMI)) {
      // Skip unknown chars, but record an error for diagnostics.
      errors.push(`位置 ${pos}: 不明な文字 "${c}" を無視しました`);
      i++; pos++;
      continue;
    }

    let j = i + 1;
    let sharp = false;
    if (src[j] === '#') { sharp = true; j++; }
    let oct: '-' | '' | '+' = '';
    if (src[j] === '-') { oct = '-'; j++; }
    else if (src[j] === '+') { oct = '+'; j++; }
    let weight = 1;
    if (src[j] === '~') { weight = 2; j++; }

    const base = oct === '-' ? LOWER_BASE : oct === '+' ? UPPER_BASE : MIDDLE_BASE;
    const semi = LETTER_TO_SEMI[letterRaw] + (sharp ? 1 : 0);
    const midi = base + semi;
    const label = `${letterRaw}${sharp ? '#' : ''}${oct}`;
    events.push({ midi, label, weight });

    pos += (j - i);
    i = j;
  }

  return { events, errors };
}

/** Render a NoteEvent[] back to the canonical text form. */
export function stringifyEvents(events: NoteEvent[]): string {
  return events
    .map(e => {
      if (e.midi == null) return '_' + (e.weight === 2 ? '~' : '');
      return e.label + (e.weight === 2 ? '~' : '');
    })
    .join(' ');
}

/** Convert MIDI back to a label, given an arbitrary MIDI note. */
export function midiToLabel(midi: number): string {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const semi = ((midi % 12) + 12) % 12;
  const oct = Math.floor(midi / 12) - 1; // standard MIDI: C4 = 60
  let suffix = '';
  if (oct <= 4) suffix = '-';
  else if (oct >= 6) suffix = '+';
  return names[semi] + suffix;
}
