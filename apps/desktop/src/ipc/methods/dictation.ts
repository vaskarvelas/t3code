// @effect-diagnostics nodeBuiltinImport:off -- The hyprwhspr transport requires POSIX nonblocking FIFO open flags and native socket events.
import * as NodeFS from "node:fs";
import * as NodeFSP from "node:fs/promises";
import * as NodeNet from "node:net";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeProcess from "node:process";
import { DesktopDictationStateSchema } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as DesktopIpc from "../DesktopIpc.ts";
import * as Channels from "../channels.ts";

const directory = () =>
  NodeProcess.env.XDG_RUNTIME_DIR
    ? NodePath.join(NodeProcess.env.XDG_RUNTIME_DIR, "hyprwhspr")
    : NodePath.join(NodeOS.tmpdir(), `hyprwhspr-${NodeProcess.getuid?.()}`);

export async function dictationState() {
  try {
    if (!(await NodeFSP.stat(NodePath.join(directory(), "recording_control"))).isFIFO())
      return "unavailable" as const;
    const recording = await NodeFSP.readFile(
      NodePath.join(directory(), "recording_status"),
      "utf8",
    ).catch(() => "false");
    return recording.trim() === "true" ? ("recording" as const) : ("idle" as const);
  } catch {
    return "unavailable" as const;
  }
}

export async function control(action: "start" | "stop"): Promise<string> {
  if (action === "stop") {
    const pipe = await NodeFSP.open(
      NodePath.join(directory(), "recording_control"),
      NodeFS.constants.O_WRONLY | NodeFS.constants.O_NONBLOCK,
    );
    try {
      await pipe.write("stop\n");
    } finally {
      await pipe.close();
    }
    return "";
  }
  if ((await dictationState()) !== "idle")
    throw new Error("Finish the current F9 recording first, or start hyprwhspr.");
  const { promise, resolve, reject } = Promise.withResolvers<string>();
  const socket = NodeNet.createConnection(NodePath.join(directory(), "hyprwhspr.sock"));
  let text = "";
  socket.once("connect", () => socket.write("capture\n"));
  socket.on("data", (chunk: string) => {
    text += chunk;
    if (text.length > 200_000) socket.destroy(new Error("Dictation exceeded the text limit."));
  });
  socket.once("error", reject);
  socket.once("end", () =>
    text.startsWith("ERROR:") ? reject(new Error(text.trim())) : resolve(text),
  );
  return promise;
}

export const getDictationState = DesktopIpc.makeIpcMethod({
  channel: Channels.GET_DICTATION_STATE_CHANNEL,
  payload: Schema.Void,
  result: DesktopDictationStateSchema,
  handler: () => Effect.tryPromise(() => dictationState()),
});

export const controlDictation = DesktopIpc.makeIpcMethod({
  channel: Channels.CONTROL_DICTATION_CHANNEL,
  payload: Schema.Literals(["start", "stop"]),
  result: Schema.String,
  handler: (action) => Effect.tryPromise(() => control(action)),
});
