// @effect-diagnostics nodeBuiltinImport:off -- Exercises the native FIFO/socket boundary in isolated temporary state.
import * as NodeFSP from "node:fs/promises";
import * as NodeFS from "node:fs";
import * as NodeNet from "node:net";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeChildProcess from "node:child_process";
import { expect, it, vi } from "vite-plus/test";
import { control } from "./dictation.ts";

it("captures Unicode text and sends explicit stop without keyboard events", async () => {
  const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "dictation-"));
  vi.stubEnv("XDG_RUNTIME_DIR", root);
  const dir = NodePath.join(root, "hyprwhspr");
  await NodeFSP.mkdir(dir);
  const fifo = NodePath.join(dir, "recording_control");
  NodeChildProcess.execFileSync("mkfifo", [fifo]);
  const fd = NodeFS.openSync(fifo, NodeFS.constants.O_RDWR | NodeFS.constants.O_NONBLOCK);
  const { promise, resolve } = Promise.withResolvers<string>();
  const server = NodeNet.createServer((socket) => {
    socket.once("data", (request) => {
      resolve(request.toString());
      socket.end(" Καλημέρα κόσμε");
    });
  });
  try {
    const listening = Promise.withResolvers<void>();
    server.listen(NodePath.join(dir, "hyprwhspr.sock"), listening.resolve);
    await listening.promise;
    expect(await control("start")).toBe(" Καλημέρα κόσμε");
    expect(await promise).toBe("capture\n");
    await control("stop");
    const buffer = Buffer.alloc(32);
    expect(buffer.subarray(0, NodeFS.readSync(fd, buffer)).toString()).toBe("stop\n");
    await NodeFSP.writeFile(NodePath.join(dir, "recording_status"), "true");
    await expect(control("start")).rejects.toThrow("Finish the current F9 recording");
  } finally {
    server.close();
    NodeFS.closeSync(fd);
    vi.unstubAllEnvs();
    await NodeFSP.rm(root, { recursive: true, force: true });
  }
});
