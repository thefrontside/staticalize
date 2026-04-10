import { createSignal, resource, type Stream } from "effection";
import process from "node:process";

export interface ResizeEvent {
  height: number;
  width: number;
}

export function resize(): Stream<ResizeEvent, never> {
  return resource(function* (provide) {
    let signal = createSignal<ResizeEvent, never>();
    let listener = () => {
      signal.send({
        height: process.stdout.rows ?? 24,
        width: process.stdout.columns ?? 80,
      });
    };
    try {
      process.stdout.on("resize", listener);
    } finally {
      yield* provide(yield* signal);
      process.stdout.off("resize", listener);
    }
  });
}
