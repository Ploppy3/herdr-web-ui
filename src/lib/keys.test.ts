import { describe, expect, it } from "bun:test";
import { controlCode, ctrlEnterSequence, isPrintable, keySequence, modifyOtherKeysLevel, terminalChord, keyFromData } from "./keys.ts";

describe("terminalChord", () => {
  it("preserves every combination for cursor keys, letters and symbols", () => {
    for (let mask = 0; mask < 8; mask++) {
      const modifiers = { ctrl: !!(mask & 4), alt: !!(mask & 2), shift: !!(mask & 1) };
      const prefix = [modifiers.ctrl && "ctrl", modifiers.alt && "alt", modifiers.shift && "shift"].filter(Boolean).join("+");
      for (const [key, name] of [["ArrowLeft", "left"], ["a", "a"], ["я", "я"], ["!", "!"], ["+", "plus"], [" ", "space"], ["Enter", "enter"], ["Tab", "tab"]]) {
        expect(terminalChord(key!, modifiers)).toBe((prefix ? prefix + "+" : "") + name);
      }
    }
  });
  it("rejects text blocks and unidentified hardware keys", () => {
    for (const key of ["Dead", "Unidentified", "paste me", "\x03", ""]) {
      expect(terminalChord(key, { ctrl: true, alt: true, shift: true })).toBeNull();
    }
  });
});

describe("keyFromData", () => {
  it("identifies single committed keys without guessing inside paste or encoded chords", () => {
    expect(keyFromData("\x1bOA")).toBe("ArrowUp");
    expect(keyFromData("\x1b[D")).toBe("ArrowLeft");
    expect(keyFromData("\r")).toBe("Enter");
    expect(keyFromData("я")).toBe("я");
    expect(keyFromData("😀")).toBe("😀");
    for (const data of ["paste me", "한글", "\x1b[1;5A", "\x1b[200~a\x1b[201~", ""]) expect(keyFromData(data)).toBeNull();
  });
});

describe("controlCode", () => {
  it("maps letters to their control code regardless of case", () => {
    expect(controlCode("c")).toBe("\u0003");
    expect(controlCode("C")).toBe("\u0003");
    expect(controlCode("a")).toBe("\u0001");
    expect(controlCode("z")).toBe("\u001a");
  });

  it("maps the six punctuation keys terminals define control codes for", () => {
    expect(controlCode("@")).toBe("\u0000");
    expect(controlCode("[")).toBe("\u001b");
    expect(controlCode("\\")).toBe("\u001c");
    expect(controlCode("]")).toBe("\u001d");
    expect(controlCode("^")).toBe("\u001e");
    expect(controlCode("_")).toBe("\u001f");
  });

  it("returns null for anything else, so the character is sent as typed", () => {
    for (const ch of ["1", " ", "?", "é", "ㄱ", "ab", ""]) expect(controlCode(ch)).toBeNull();
  });
});

describe("isPrintable", () => {
  it("accepts one printable character and rejects control characters, DEL and multi-character input", () => {
    expect(isPrintable("a")).toBe(true);
    expect(isPrintable(" ")).toBe(true);
    expect(isPrintable("ㄱ")).toBe(true);
    expect(isPrintable("\u001b")).toBe(false);
    expect(isPrintable("\u007f")).toBe(false);
    expect(isPrintable("ab")).toBe(false);
    expect(isPrintable("")).toBe(false);
  });
});

describe("keySequence", () => {
  it("sends the fixed bytes for Escape, Tab and Ctrl+C", () => {
    expect(keySequence("Escape", false)).toBe("\u001b");
    expect(keySequence("Tab", false)).toBe("\t");
    expect(keySequence("ctrl-c", true)).toBe("\u0003");
  });

  it("sends CSI arrows normally and SS3 arrows under application cursor keys mode", () => {
    expect(keySequence("ArrowUp", false)).toBe("\u001b[A");
    expect(keySequence("ArrowDown", false)).toBe("\u001b[B");
    expect(keySequence("ArrowRight", false)).toBe("\u001b[C");
    expect(keySequence("ArrowLeft", false)).toBe("\u001b[D");
    expect(keySequence("ArrowUp", true)).toBe("\u001bOA");
    expect(keySequence("ArrowLeft", true)).toBe("\u001bOD");
  });
});

describe("modifyOtherKeysLevel", () => {
  it("follows CSI > 4 ; Pv m and turns off on CSI > 4 m and CSI > 4 n", () => {
    expect(modifyOtherKeysLevel(0, "m", [4, 2])).toBe(2);
    expect(modifyOtherKeysLevel(0, "m", [4, 1])).toBe(1);
    // herdr turns it off as CSI > 4 ; 0 m, a program may leave the value out
    expect(modifyOtherKeysLevel(2, "m", [4, 0])).toBe(0);
    expect(modifyOtherKeysLevel(2, "m", [4])).toBe(0);
    expect(modifyOtherKeysLevel(2, "n", [4])).toBe(0);
    // a bare CSI > m or CSI > n resets every resource; xterm.js reports it as [0] or []
    expect(modifyOtherKeysLevel(2, "m", [0])).toBe(0);
    expect(modifyOtherKeysLevel(2, "n", [0])).toBe(0);
    expect(modifyOtherKeysLevel(2, "m", [])).toBe(0);
  });

  it("leaves the level alone for the other key modifier resources", () => {
    expect(modifyOtherKeysLevel(2, "m", [1, 2])).toBe(2);
    expect(modifyOtherKeysLevel(2, "n", [1])).toBe(2);
    expect(modifyOtherKeysLevel(0, "m", [[4, 2]])).toBe(0);
  });
});

describe("ctrlEnterSequence", () => {
  it("keeps xterm.js's CR until the program asks for modifyOtherKeys", () => {
    expect(ctrlEnterSequence(0)).toBeNull();
    expect(ctrlEnterSequence(1)).toBe("\u001b[27;5;13~");
    expect(ctrlEnterSequence(2)).toBe("\u001b[27;5;13~");
  });
});
