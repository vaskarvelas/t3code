import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import * as DesktopEnvironment from "./DesktopEnvironment.ts";

export class ReadAloudError extends Schema.TaggedError<ReadAloudError>()("ReadAloudError", {
  cause: Schema.Defect(),
}) {
  override get message(): string {
    return "Local read aloud failed. Check ~/.local/bin/omarchy-read-aloud and its voice models.";
  }
}

const isReadAloudError = Schema.is(ReadAloudError);

export class DesktopReadAloud extends Context.Service<
  DesktopReadAloud,
  {
    readonly read: (text: string) => Effect.Effect<void, ReadAloudError>;
    readonly stop: Effect.Effect<void>;
  }
>()("@t3tools/desktop/app/DesktopReadAloud") {}

const make = Effect.gen(function* () {
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const scope = yield* Scope.Scope;
  const mutex = yield* Semaphore.make(1);
  const executable = environment.path.join(
    environment.homeDirectory,
    ".local/bin/omarchy-read-aloud",
  );
  let active: Fiber.Fiber<void, ReadAloudError> | undefined;

  const stopActive = Effect.gen(function* () {
    if (active) {
      yield* Fiber.interrupt(active);
      active = undefined;
    }
  });
  const stop = mutex.withPermit(stopActive);
  const read = Effect.fn("desktop.readAloud.read")(function* (text: string) {
    const fiber = yield* mutex.withPermit(
      Effect.gen(function* () {
        yield* stopActive;
        const playback = Effect.scoped(
          Effect.gen(function* () {
            const child = yield* spawner.spawn(
              ChildProcess.make(executable, ["--stdin", "--replace"], {
                stdin: Stream.make(new TextEncoder().encode(text)),
                stdout: "ignore",
                stderr: "ignore",
                detached: true,
                killSignal: "SIGTERM",
                forceKillAfter: "2 seconds",
              }),
            );
            const exitCode = yield* child.exitCode;
            if (exitCode !== 0) return yield* new ReadAloudError({ cause: { exitCode } });
          }),
        ).pipe(
          Effect.mapError((cause) =>
            isReadAloudError(cause) ? cause : new ReadAloudError({ cause }),
          ),
        );
        active = yield* Effect.forkIn(playback, scope);
        return active;
      }),
    );
    const exit = yield* Fiber.await(fiber);
    if (Exit.isFailure(exit) && !Cause.hasInterruptsOnly(exit.cause)) {
      return yield* Effect.failCause(exit.cause);
    }
  });

  return DesktopReadAloud.of({ read, stop });
});

export const layer = Layer.effect(DesktopReadAloud, make);
