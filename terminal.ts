import { forEach } from "@effectionx/stream-helpers";
import {
  createTerm,
  cursor,
  type CursorEvent,
  DSR,
  type Op,
  saveCursorPosition,
} from "clayterm";
import {
  createChannel,
  ensure,
  type Operation,
  scoped,
  spawn,
  until,
} from "effection";
import process from "node:process";
import { resize } from "./resize.ts";
import { useInput } from "./use-input.ts";

const renders = createChannel<Op[], never>();

export function render(ops: Op[]): Operation<void> {
  return renders.send(ops);
}

export function withRegion<T>(
  height: number,
  body: () => Operation<T>,
): Operation<T> {
  return process.stdout.isTTY
    ? withTerminalRegion(height, body)
    : withPipeRegion(height, body);
}

function withTerminalRegion<T>(
  ...[height, body]: Parameters<typeof withRegion<T>>
): Operation<T> {
  let encoder = new TextEncoder();

  let hideCursor = cursor(false);
  let saveCursor = saveCursorPosition();

  return scoped(function* () {
    let term = yield* until(createTerm({
      height,
      width: process.stdout.columns,
    }));

    process.stdout.write(hideCursor.apply);
    yield* ensure(() => {
      process.stdout.write(hideCursor.revert);
    });

    yield* spawn(() =>
      forEach(function* ({ width }) {
        term = yield* until(createTerm({ height, width }));
      }, resize())
    );

    // allocate region
    let lines = encoder.encode("\n".repeat(height));
    process.stdout.write(lines);

    // save the cursor and make sure it's in the same place when we're done.
    process.stdout.write(saveCursor.apply);
    yield* ensure(() => {
      process.stdout.write(saveCursor.revert);
    });

    // find the ending row
    let end = yield* queryCursorPosition();

    yield* spawn(() =>
      forEach(function* (ops) {
        let { output } = term.render(ops, { row: end.row - height });
        process.stdout.write(output);
      }, renders)
    );

    return yield* body();
  });
}

function withPipeRegion<T>(
  ...[height, body]: Parameters<typeof withRegion<T>>
): Operation<T> {
  return scoped(function* () {
    let last: Op[] = [];

    yield* spawn(() =>
      forEach(function* (ops) {
        last = ops;
      }, renders)
    );

    let result = yield* body();

    let term = yield* until(createTerm({
      height,
      width: process.stdout.columns ?? 80,
    }));

    let { output } = term.render(last, { mode: "line" });

    process.stdout.write(output);

    return result;
  });
}

function queryCursorPosition(): Operation<CursorEvent> {
  return scoped(function* () {
    let events = yield* useInput();
    let originalRawMode = process.stdin.isRaw;
    try {
      process.stdin.setRawMode(true);
      process.stdout.write(DSR());

      let next = yield* events.next();

      while (!next.done) {
        let event = next.value;
        if (event.type === "cursor") {
          return event;
        }
        next = yield* events.next();
      }

      throw new Error(`input closed, but never received cursor position`);
    } finally {
      process.stdin.setRawMode(originalRawMode);
    }
  });
}
