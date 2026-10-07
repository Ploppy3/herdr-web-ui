import { describe, expect, it } from "bun:test";
import type { UpdateNotes } from "../../shared/update.ts";
import { offeredNotes } from "./updateNotes.ts";

const notes: UpdateNotes = { releases: [{ version: "0.4.0", date: "2026-10-07", notes: "### Added\n- A thing." }], omitted: 0 };
const offered = { current_revision: "a".repeat(40), latest_revision: "b".repeat(40), latest_version: "0.4.0" };

describe("notes beside an offered update", () => {
  it("shows the notes fetched for the release the status names", () => {
    expect(offeredNotes(offered, notes)).toBe(notes);
  });

  it("shows nothing before a status, before the notes, or for a release without any", () => {
    expect(offeredNotes(null, notes)).toBeNull();
    expect(offeredNotes(offered, null)).toBeNull();
    expect(offeredNotes(offered, { releases: [], omitted: 0 })).toBeNull();
  });

  it("drops notes fetched for an earlier release once a newer one is out", () => {
    expect(offeredNotes({ ...offered, latest_revision: "c".repeat(40), latest_version: "0.4.1" }, notes)).toBeNull();
  });

  it("drops the notes once the release is installed", () => {
    expect(offeredNotes({ ...offered, current_revision: offered.latest_revision }, notes)).toBeNull();
    expect(offeredNotes({ ...offered, latest_revision: null }, notes)).toBeNull();
  });
});
