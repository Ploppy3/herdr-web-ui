import { expect, it, spyOn } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as herdr from "./herdr/client.ts";
import { createServer } from "./index.ts";

/** Hold one keys RPC so the next chord waits while its sender leaves the pane. */
async function queuedKeys(leave: "none" | "detach" | "replace" | "reattach" | "refresh") {
  const root = mkdtempSync(join(tmpdir(), "herdr-web-ui-keys-lifecycle-"));
  const server = createServer({ port: 0, hostname: "127.0.0.1", token: "", stateDir: root });
  const sockets: WebSocket[] = [];
  let workspace: string | undefined;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const calls: string[][] = [];
  const original = herdr.paneSendKeys;
  const spy = spyOn(herdr, "paneSendKeys").mockImplementation(async (pane, keys) => {
    calls.push(keys);
    if (calls.length === 1) await gate;
    return original(pane, keys);
  });
  const until = async (predicate: () => boolean) => {
    const deadline = Date.now() + 5000;
    while (!predicate()) {
      if (Date.now() > deadline) throw new Error("Queued keys contract deadline");
      await Bun.sleep(20);
    }
  };
  const connect = async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
    sockets.push(ws);
    const seen: any[] = [];
    ws.addEventListener("message", (event) => seen.push(JSON.parse(String(event.data))));
    await until(() => seen.some((frame) => frame.type === "snapshot"));
    return { ws, seen, send: (message: unknown) => ws.send(JSON.stringify(message)) };
  };
  try {
    const created = await herdr.herdrRpc<{ workspace: { workspace_id: string }; root_pane: { pane_id: string } }>(
      "workspace.create", { label: "herdr-web-ui-test-keys-lifecycle", cwd: root, focus: false },
    );
    workspace = created.workspace.workspace_id;
    const pane = created.root_pane.pane_id;
    const owner = await connect();
    owner.send({ type: "attach", pane_id: pane, cols: 80, rows: 24 });
    await until(() => owner.seen.some((frame) => frame.type === "input-ready"));
    // This peer keeps the same attachment alive when only the sender detaches.
    const peer = leave === "detach" || leave === "reattach" ? await connect() : undefined;
    if (peer) {
      peer.send({ type: "attach", pane_id: pane, cols: 80, rows: 24 });
      await until(() => peer.seen.some((frame) => frame.type === "input-ready"));
    }
    owner.send({ type: "keys", pane_id: pane, keys: ["ctrl+right"] });
    await until(() => calls.length === 1);
    owner.send({ type: "keys", pane_id: pane, keys: ["ctrl+alt+shift+left"] });
    if (leave !== "none" && leave !== "refresh") owner.send({ type: "detach", pane_id: pane });
    // An acknowledged later frame is a barrier: the queued key and detach were handled.
    owner.send({ type: "role", mode: "interact" });
    await until(() => owner.seen.some((frame) => frame.type === "role-ack"));
    if (leave === "reattach" || leave === "refresh") {
      const readyCount = owner.seen.filter((frame) => frame.type === "input-ready").length;
      owner.send({ type: "attach", pane_id: pane, cols: 80, rows: 24 });
      await until(() => owner.seen.filter((frame) => frame.type === "input-ready").length > readyCount);
    }
    if (leave === "replace") {
      const replacement = await connect();
      replacement.send({ type: "attach", pane_id: pane, cols: 80, rows: 24 });
      await until(() => replacement.seen.some((frame) => frame.type === "input-ready"));
    }
    release();
    if (leave === "none" || leave === "refresh") {
      await until(() => calls.length === 2);
      expect(calls[1]).toEqual(["ctrl+alt+shift+left"]);
    } else {
      await until(() => owner.seen.some((frame) => frame.type === "error" && frame.code === "input_not_ready"));
      expect(calls).toEqual([["ctrl+right"]]);
    }
  } finally {
    release();
    for (const socket of sockets) socket.close();
    server.stop();
    spy.mockRestore();
    if (workspace) await herdr.workspaceClose(workspace).catch(() => undefined);
    rmSync(root, { recursive: true, force: true });
  }
}

it("sends a queued chord when its original terminal attachment is still ready", () => queuedKeys("none"), 20_000);
it("drops a queued chord after its sender detaches while another client keeps the attachment", () => queuedKeys("detach"), 20_000);
it("drops a queued chord after its original attachment is replaced", () => queuedKeys("replace"), 20_000);
it("drops a queued chord after its sender detaches and rejoins the same attachment", () => queuedKeys("reattach"), 20_000);
it("preserves a queued chord when the sender refreshes its attach without detaching", () => queuedKeys("refresh"), 20_000);
