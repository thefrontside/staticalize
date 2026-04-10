import {
  createChannel,
  createSignal,
  each,
  type Operation,
  race,
  resource,
  spawn,
  type Stream,
  until,
} from "effection";
import { createApi } from "@effectionx/context-api";

export const initStdin = resource<Stream<Uint8Array, void>>(
  function* (provide) {
    let channel = createChannel<Uint8Array, void>();

    // todo, use node/process directly.
    let iterator = Deno.stdin.readable[Symbol.asyncIterator]();

    yield* spawn(function* () {
      let next = yield* until(iterator.next());
      while (!next.done) {
        yield* channel.send(next.value);
        next = yield* until(iterator.next());
      }
      yield* channel.close();
    });

    yield* race([provide(channel), drain(channel)]);
  },
);

export const Stdin = createApi("@statical/stdin", {
  *useStdin() {
    return createSignal<Uint8Array, void>() as Stream<Uint8Array, void>;
  },
});

export const { useStdin } = Stdin.operations;

function* drain<T, TClose>(stream: Stream<T, TClose>): Operation<void> {
  for (let _ of yield* each(stream)) {
    yield* each.next();
  }
}
