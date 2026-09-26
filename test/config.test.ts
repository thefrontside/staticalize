import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";

import { config } from "../config.ts";

// the three flags the deploy workflow has always passed, and nothing else
let deploy = [
  "--site=http://127.0.0.1:8000",
  "--output=www/built",
  "--base=https://frontside.com/effection",
];

function parse(args: string[]) {
  // an empty env, so a STATICALIZE_* variable on the machine cannot sway this
  let parser = config.createParser({
    envs: [{ name: "ENV", value: {} }],
    args,
  });
  if (parser.type !== "main") {
    throw new Error(`expected a main parser, got ${parser.type}`);
  }
  return parser.parse();
}

function value(args: string[]) {
  let result = parse(args);
  if (!result.ok) {
    throw result.error;
  }
  return result.value;
}

describe("config", () => {
  it("accepts an invocation that passes no --retries", () => {
    expect(parse(deploy).ok).toEqual(true);
  });

  it("leaves retries unset, so its default can depend on --strict", () => {
    expect(value(deploy).retries).toEqual(undefined);
  });

  it("takes --retries when it is given", () => {
    expect(value([...deploy, "--retries=1"]).retries).toEqual(1);
  });

  it("defaults concurrency", () => {
    expect(value(deploy).concurrency).toEqual(75);
  });

  it("defaults strict to off", () => {
    expect(value(deploy).strict).toEqual(false);
  });

  it("still refuses an invocation with no --base", () => {
    expect(parse(["--site=http://127.0.0.1:8000"]).ok).toEqual(false);
  });
});
