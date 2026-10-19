import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Queue from "effect/Queue";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import { ChildProcessSpawner } from "effect/process";

import * as DesktopEnvironment from "./DesktopEnvironment.ts";
import * as DesktopReadAloud from "./DesktopReadAloud.ts";

const environment = DesktopEnvironment.layer({
  dirname: "/test/desktop",
  homeDirectory: "/test/home",
  platform: "linux",
  processArch: "x64",
  appVersion: "0.0.0-nightly.test",
  appPath: "/test/app",
  isPackaged: false,
  resourcesPath: "/test/resources",
  runningUnderArm64Translation: false,
});

const harness = Effect.gen(function* () {
  const started = yield* Queue.unbounded<{
    exit: Deferred.Deferred<ChildProcessSpawner.ExitCode>;
    released: Deferred.Deferred<void>;
  }>();
  let running = 0;
  let maximumRunning = 0;
  const spawner = ChildProcessSpawner.make(() =>
    Effect.gen(function* () {
      const exit = yield* Deferred.make<ChildProcessSpawner.ExitCode>();
      const released = yield* Deferred.make<void>();
      yield* Effect.acquireRelease(
        Effect.sync(() => {
          running++;
          maximumRunning = Math.max(maximumRunning, running);
        }),
        () =>
          Effect.sync(() => {
            running--;
          }).pipe(Effect.andThen(Deferred.succeed(released, undefined))),
      );
      yield* Queue.offer(started, { exit, released });
      return ChildProcessSpawner.makeHandle({
        pid: ChildProcessSpawner.ProcessId(1),
        exitCode: Deferred.await(exit),
        isRunning: Effect.succeed(true),
        kill: () => Effect.void,
        unref: Effect.succeed(Effect.void),
        stdin: Sink.drain,
        stdout: Stream.empty,
        stderr: Stream.empty,
        all: Stream.empty,
        getInputFd: () => Sink.drain,
        getOutputFd: () => Stream.empty,
      });
    }),
  );
  return { started, spawner, maximumRunning: () => maximumRunning };
});

it.effect(
  "replacing a reply releases its process before starting the next; Stop cancels playback",
  () =>
    Effect.gen(function* () {
      const h = yield* harness;
      yield* Effect.gen(function* () {
        const speech = yield* DesktopReadAloud.DesktopReadAloud;
        const first = yield* speech.read("Πρώτη απάντηση").pipe(Effect.forkChild);
        const firstProcess = yield* Queue.take(h.started);
        const second = yield* speech.read("Second reply").pipe(Effect.forkChild);
        const secondProcess = yield* Queue.take(h.started);
        expect(yield* Deferred.isDone(firstProcess.released)).toBe(true);
        yield* Fiber.join(first);
        yield* speech.stop;
        yield* Fiber.join(second);
        expect(yield* Deferred.isDone(secondProcess.released)).toBe(true);
        expect(h.maximumRunning()).toBe(1);
      }).pipe(
        Effect.provide(DesktopReadAloud.layer),
        Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, h.spawner),
        Effect.provide(environment),
      );
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

it.effect("reports a failed speech process and permits the next reply to finish", () =>
  Effect.gen(function* () {
    const h = yield* harness;
    yield* Effect.gen(function* () {
      const speech = yield* DesktopReadAloud.DesktopReadAloud;
      const failed = yield* speech.read("Failure").pipe(Effect.flip, Effect.forkChild);
      const failedProcess = yield* Queue.take(h.started);
      yield* Deferred.succeed(failedProcess.exit, ChildProcessSpawner.ExitCode(1));
      expect((yield* Fiber.join(failed))._tag).toBe("ReadAloudError");
      const next = yield* speech.read("Επόμενη απάντηση").pipe(Effect.forkChild);
      const nextProcess = yield* Queue.take(h.started);
      yield* Deferred.succeed(nextProcess.exit, ChildProcessSpawner.ExitCode(0));
      yield* Fiber.join(next);
      expect(yield* Deferred.isDone(nextProcess.released)).toBe(true);
    }).pipe(
      Effect.provide(DesktopReadAloud.layer),
      Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, h.spawner),
      Effect.provide(environment),
    );
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);
