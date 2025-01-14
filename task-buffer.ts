import {
  createChannel,
  Err,
  Ok,
  Operation,
  Resolve,
  resource,
  Result,
  spawn,
  Stream,
  Task,
  useScope,
  withResolvers,
} from "effection";

export interface TaskBuffer extends Operation<void> {
  spawn<T>(op: () => Operation<T>): Operation<Operation<Task<T>>>;
}

export function useTaskBuffer(max: number): Operation<TaskBuffer> {
  return resource(function* (provide) {
    let input = createChannel<void, never>();

    let output = createChannel<Result<unknown>, never>();

    let buffer = new Set<Task<unknown>>();

    let scope = yield* useScope();

    let requests: SpawnRequest<unknown>[] = [];

    yield* spawn(function* () {
      while (true) {
        if (requests.length === 0) {
          yield* next(input);
        } else if (buffer.size < max) {
          let request = requests.pop()!;
          let task = yield* scope.spawn(request.operation);
          buffer.add(task);
          yield* spawn(function* () {
            try {
              let result = Ok(yield* task);
              buffer.delete(task);
              yield* output.send(result);
            } catch (error) {
              buffer.delete(task);
              yield* output.send(Err(error as Error));
            }
          });
          request.resolve(task);
        } else {
          yield* next(output);
        }
      }
    });

    yield* provide({
      *[Symbol.iterator]() {
        let outputs = yield* output;
        while (buffer.size > 0 || requests.length > 0) {
          yield* outputs.next();
        }
      },
      *spawn<T>(fn: () => Operation<T>) {
        let { operation, resolve } = withResolvers<Task<T>>();
        requests.unshift({
          operation: fn,
          resolve: resolve as Resolve<unknown>,
        });
        yield* input.send();
        return operation;
      },
    });
  });
}

interface SpawnRequest<T> {
  operation(): Operation<T>;
  resolve: Resolve<Task<T>>;
}

function* next<T, TClose>(
  stream: Stream<T, TClose>,
): Operation<IteratorResult<T, TClose>> {
  let subscription = yield* stream;
  return yield* subscription.next();
}
