/**
 * Key-bar key mappings, kept free of DOM and xterm so they can be unit-tested.
 * PaneTerminal feeds the result to term.input(), which takes the same
 * onData -> socket path as typed keys. The keyboard's own keys xterm.js encodes
 * differently from a terminal are below them.
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

/**
 * xterm's modifyOtherKeys level after CSI > 4 ; Pv m, or CSI > 4 n, which turns it off. Other
 * resources leave it as it was. xterm.js 5.5 ignores the request and types Ctrl+Enter as a plain
 * CR, the same as Enter, so PaneTerminal keeps the level here and sends that key itself.
 * herdr passes the pane program's request on to the attached client, and again on every
 * attach; Claude Code asks for level 2.
 */
export function modifyOtherKeysLevel(level: number, final: "m" | "n", params: ReadonlyArray<number | number[]>): number {
  // a bare CSI > m or CSI > n resets every key-modifier resource (xterm). xterm.js hands it over
  // as [0], the same as an explicit resource 0 (modifyKeyboard, which this does not track): off
  // is the safe reading, since a level left on would type CSI 27;5;13~ into a shell
  if (params.length === 0 || (params.length === 1 && params[0] === 0)) return 0;
  if (params[0] !== 4) return level;
  const value = params[1];
  return final === "m" && typeof value === "number" ? value : 0;
}

/** Ctrl+Enter under modifyOtherKeys, as xterm encodes it; null keeps xterm.js's own CR. */
export function ctrlEnterSequence(modifyOtherKeys: number): string | null {
  return modifyOtherKeys > 0 ? "\u001b[27;5;13~" : null;
}
