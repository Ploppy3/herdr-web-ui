import type { UpdateNotes, UpdateStatus } from "../../shared/update.ts";

/**
 * The notes to show beside an offered update: those fetched for the release the status names,
 * until it is installed. Null when there are none to show. A check reports nothing available
 * while it runs, so `available` is not asked: the notes must not leave every five minutes
 * under someone reading them.
 */
export function offeredNotes(
  status: Pick<UpdateStatus, "current_revision" | "latest_revision" | "latest_version"> | null,
  notes: UpdateNotes | null,
): UpdateNotes | null {
  const newest = notes?.releases[0];
  if (!status || !notes || !newest) return null;
  if (!status.latest_revision || status.latest_revision === status.current_revision) return null;
  return newest.version === status.latest_version ? notes : null;
}
