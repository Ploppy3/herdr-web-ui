import type { UpdateNotes, UpdateStatus } from "../../shared/update.ts";
import { ApiError } from "./api.ts";

/**
 * The notes to show beside an offered update: those read from the very commit the status
 * offers, until it is installed. Null when there are none to show. A check reports nothing
 * available while it runs, so `available` is not asked: the notes must not leave every five
 * minutes under someone reading them. The commit is compared, not the version: a tag moved to
 * another commit has other notes, and a release with an empty section still brings the
 * sections of the releases skipped before it.
 */
export function offeredNotes(
  status: Pick<UpdateStatus, "current_revision" | "latest_revision"> | null,
  notes: UpdateNotes | null,
): UpdateNotes | null {
  if (!status || !notes || notes.releases.length === 0) return null;
  if (!status.latest_revision || status.latest_revision === status.current_revision) return null;
  return notes.revision === status.latest_revision ? notes : null;
}

/**
 * How long to wait before asking for the notes again after a failed request; null when asking
 * again changes nothing. A dropped connection or a bridge that restarts passes. A server older
 * than the notes refuses the request itself (405), every time.
 */
export function notesRetryDelay(error: unknown, attempt: number): number | null {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return null;
  return Math.min(30_000, 2000 * 2 ** Math.min(attempt, 4));
}
