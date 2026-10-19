import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import * as DesktopReadAloud from "../../app/DesktopReadAloud.ts";
import * as DesktopIpc from "../DesktopIpc.ts";
import { READ_ALOUD_CHANNEL, STOP_READ_ALOUD_CHANNEL } from "../channels.ts";

export const readAloud = DesktopIpc.makeIpcMethod({
  channel: READ_ALOUD_CHANNEL,
  payload: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(200_000)),
  result: Schema.Void,
  handler: (text) =>
    Effect.flatMap(DesktopReadAloud.DesktopReadAloud, (speech) => speech.read(text)),
});

export const stopReadAloud = DesktopIpc.makeIpcMethod({
  channel: STOP_READ_ALOUD_CHANNEL,
  payload: Schema.Void,
  result: Schema.Void,
  handler: () => Effect.flatMap(DesktopReadAloud.DesktopReadAloud, (speech) => speech.stop),
});
