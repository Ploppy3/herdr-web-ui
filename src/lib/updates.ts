import { useCallback, useEffect, useRef, useState } from "react";
import type { UpdateCommand, UpdateNotes, UpdateStatus } from "../../shared/update.ts";
import { fetchUpdateNotes, fetchUpdateStatus, requestUpdate } from "./api.ts";
import { offeredNotes } from "./updateNotes.ts";
import { usePageVisible } from "./visibility.ts";

declare const __APP_REVISION__: string | null;

export function useUpdates(enabled: boolean) {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [refresh, setRefresh] = useState(0);
  // the component's own lifetime, not the poll's: a page hidden while the request is on its way
  // (a phone app sent to the background) stops the poll, and the answer must still land, or
  // the buttons stay disabled until the next sign-in
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  // a hidden page keeps the last status and polls again once it is back
  const visible = usePageVisible();
  useEffect(() => {
    if (!enabled) { setStatus(null); setPending(false); setError(null); return; }
    if (!visible) return;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    async function poll() {
      let delay = 2000;
      try {
        const next = await fetchUpdateStatus();
        if (!stopped) setStatus((previous) => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
        if (next.phase === "idle" && !next.available) delay = 30_000;
      } catch { /* a restart/offline period must not erase the last known status */ }
      if (!stopped) timer = setTimeout(() => void poll(), delay);
    }
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [enabled, refresh, visible]);

  // what the release brings, asked for once per release: the status is polled, the notes are long.
  // `available` is not asked here: every check reports nothing available while it runs, and
  // offeredNotes drops what does not belong to the release on offer
  const [fetched, setFetched] = useState<UpdateNotes | null>(null);
  const offered = enabled && status && status.latest_revision !== status.current_revision ? status.latest_revision : null;
  useEffect(() => {
    if (!enabled) { setFetched(null); return; }
    if (!offered) return;
    let live = true;
    // a server older than the notes has no answer: the update is offered without them
    fetchUpdateNotes().then((next) => { if (live) setFetched(next); }, () => {});
    return () => { live = false; };
  }, [enabled, offered]);
  const notes = offeredNotes(status, fetched);

  const request = useCallback(async (command: UpdateCommand) => {
    setPending(true); setError(null);
    try {
      await requestUpdate(command);
      if (mounted.current) {
        setStatus(previous => previous ? { ...previous, phase: "checking", error: null } : previous);
        setRefresh(value => value + 1);
      }
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : String(err));
    } finally { if (mounted.current) setPending(false); }
  }, []);
  const busy = pending || status?.phase === "checking" || status?.phase === "building" || status?.phase === "restarting";
  const needsReload = typeof __APP_REVISION__ === "string" && !!status?.current_revision &&
    __APP_REVISION__ !== status.current_revision && !busy;
  return { status, error, busy, needsReload, notes, request };
}

export type UpdatesModel = ReturnType<typeof useUpdates>;
