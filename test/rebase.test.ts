import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";

import { rebase, RebaseTextStream } from "../rebase.ts";

let host = new URL("http://localhost:8321");

async function rebased(
  chunks: string[],
  base: URL,
  from: URL = host,
): Promise<string> {
  let stream = ReadableStream.from(chunks)
    .pipeThrough(new RebaseTextStream(from, base));
  let out = "";
  for await (let chunk of stream) {
    out += chunk;
  }
  return out;
}

function cut(text: string, size: number): string[] {
  let chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

describe("rebase", () => {
  it("takes the protocol, host and port of the base", () => {
    expect(rebase(new URL(`${host}about`), new URL("https://fs.com")).href)
      .toEqual("https://fs.com/about");
  });

  it("prefixes the path of the base", () => {
    expect(
      rebase(new URL(`${host}about`), new URL("https://fs.com/effection")).href,
    ).toEqual("https://fs.com/effection/about");
  });

  it("treats a trailing slash on the base as no path at all", () => {
    expect(rebase(new URL(`${host}about`), new URL("https://fs.com/")).href)
      .toEqual("https://fs.com/about");
  });

  it("keeps the query and fragment of the source", () => {
    expect(
      rebase(new URL(`${host}search?q=hi#top`), new URL("https://fs.com")).href,
    ).toEqual("https://fs.com/search?q=hi#top");
  });
});

describe("RebaseTextStream", () => {
  it("replaces every occurrence in a body", async () => {
    await expect(
      rebased(
        [`[API]: ${host}api.md and ${host}b.md`],
        new URL(
          "https://fs.com",
        ),
      ),
    ).resolves.toEqual("[API]: https://fs.com/api.md and https://fs.com/b.md");
  });

  it("leaves urls on other hosts alone", async () => {
    await expect(
      rebased(
        ["see https://google.com/a and http://localhost:9999/b"],
        new URL(
          "https://fs.com",
        ),
      ),
    ).resolves.toEqual("see https://google.com/a and http://localhost:9999/b");
  });

  it("carries the path of the base", async () => {
    await expect(
      rebased([`${host}api.md`], new URL("https://fs.com/effection")),
    ).resolves.toEqual("https://fs.com/effection/api.md");
  });

  it("matches urls split across chunk boundaries", async () => {
    // the interesting cases are a match at the very start, at the very end,
    // back to back with another, and bare with no path of its own
    let body =
      `${host}a.md then ${host}b.md${host}c.md and a bare ${host} to close`;
    let want = body.replaceAll(host.origin, "https://fs.com");

    for (let size of [1, 2, 3, 7, host.origin.length - 1, host.origin.length]) {
      await expect(rebased(cut(body, size), new URL("https://fs.com")))
        .resolves.toEqual(want);
    }
  });

  it("emits a body that ends mid-match as it stands", async () => {
    // a truncated url is not a url, so it survives rather than disappearing
    let partial = host.origin.slice(0, -3);
    await expect(rebased(
      cut(`ends with ${partial}`, 4),
      new URL(
        "https://fs.com",
      ),
    )).resolves.toEqual(`ends with ${partial}`);
  });

  it("passes an empty body through", async () => {
    await expect(rebased([], new URL("https://fs.com"))).resolves.toEqual("");
  });
});
