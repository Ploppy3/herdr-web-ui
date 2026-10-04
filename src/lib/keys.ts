/**
 * Key-bar key mappings, kept free of DOM and xterm so they can be unit-tested.
 * PaneTerminal feeds the result to term.input(), which takes the same
 * onData -> socket path as typed keys.
 */

/** Keys a soft keyboard has no room for; ctrl-c is a chord, the rest are DOM key names. */
export type KeyBarKey = "Escape" | "Tab" | "Enter" | "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight" | "ctrl-c";

export interface StickyModifiers { ctrl: boolean; alt: boolean; shift: boolean }
export const NO_STICKY_MODIFIERS: StickyModifiers = { ctrl: false, alt: false, shift: false };

export function hasModifiers(modifiers: StickyModifiers): boolean {
  return modifiers.ctrl || modifiers.alt || modifiers.shift;
}

/** Send logical chords to Herdr, which owns the target pane's keyboard protocol.
 * A plus or space needs a name because Herdr's chord parser splits on '+' and trims.
 * Keep the typed symbol: the phone's layout already chose it; don't assume US Shift.
 */
export function terminalChord(key: string, modifiers: StickyModifiers): string | null {
  const names: Record<string, string> = {
    ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
    Enter: "enter", Tab: "tab", Escape: "esc", Backspace: "backspace",
    " ": "space", "+": "plus",
  };
  const name = names[key] ?? (/^F(?:[1-9]|1[0-2])$/.test(key) ? key.toLowerCase()
    : [...key].length === 1 && key.codePointAt(0)! >= 0x20 && key !== "\x7f" ? key : null);
  if (name === null) return null;
  return [modifiers.ctrl && "ctrl", modifiers.alt && "alt", modifiers.shift && "shift", name].filter(Boolean).join("+");
}

/** Soft keyboards often emit input events without a DOM keydown. Only individual
 * committed characters are keys; a multi-character composition is text.
 */
export function keyFromData(data: string): string | null {
  const fixed: Record<string, string> = { "\r": "Enter", "\t": "Tab", "\x7f": "Backspace", "\x1b": "Escape" };
  if (fixed[data]) return fixed[data]!;
  const arrow = /^\x1b(?:\[|O)([ABCD])$/.exec(data);
  if (arrow) return ({ A: "ArrowUp", B: "ArrowDown", C: "ArrowRight", D: "ArrowLeft" } as Record<string, string>)[arrow[1]!]!;
  return [...data].length === 1 && data.codePointAt(0)! >= 0x20 ? data : null;
}

/** A single printable UTF-16 character. */
export function isPrintable(data: string): boolean {
  if (data.length !== 1) return false;
  const code = data.charCodeAt(0);
  return code >= 0x20 && code !== 0x7f;
}

/** The control code for A-Z and @ [ \ ] ^ _ (Ctrl+C = 0x03, Ctrl+[ = ESC, ...), null otherwise. */
export function controlCode(ch: string): string | null {
  if (!/^[A-Za-z@[\\\]^_]$/.test(ch)) return null;
  return String.fromCharCode(ch.toUpperCase().charCodeAt(0) & 0x1f);
}

/**
 * What a key-bar tap feeds xterm. Arrows follow DECCKM like a real keyboard: SS3
 * while a full-screen program has application cursor keys on, CSI otherwise.
 */
export function keySequence(key: KeyBarKey, applicationCursorKeys: boolean): string {
  const cursor = (final: "A" | "B" | "C" | "D"): string => (applicationCursorKeys ? "\u001bO" : "\u001b[") + final;
  switch (key) {
    case "Escape":
      return "\u001b";
    case "Tab":
      return "\t";
    case "Enter":
      return "\r";
    case "ctrl-c":
      return "\u0003";
    case "ArrowUp":
      return cursor("A");
    case "ArrowDown":
      return cursor("B");
    case "ArrowRight":
      return cursor("C");
    case "ArrowLeft":
      return cursor("D");
  }
}
