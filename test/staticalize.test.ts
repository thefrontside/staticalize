import { expect } from "@std/expect";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";

import { emptyDir, exists } from "@std/fs";
import { useStaticalizer } from "../mod.ts";

import { parse } from "@libs/xml";
import { run, type Task } from "effection";
import { Hono } from "@hono/hono";

describe("staticalize", () => {
  let server: ReturnType<typeof Deno.serve>;
  let address: Deno.NetAddr;
  let host: URL;
  let app: Hono;

  // deno-lint-ignore no-explicit-any
  let sitemap: (paths: string[]) => any;

  beforeEach(async () => {
    await emptyDir("test/dist");
    app = new Hono();
    let listening = Promise.withResolvers<Deno.NetAddr>();

    server = Deno.serve({
      // port 0 asks the os for a free port, so the suite does not collide with
      // whatever happens to be on deno's default 8000
      port: 0,
      onListen: (addr) => listening.resolve(addr),
    }, app.fetch);

    address = await listening.promise;
    host = new URL(`http://${address.hostname}:${address.port}`);
    // deno-lint-ignore no-explicit-any
    sitemap = (paths) => ["/sitemap.xml", (c: any) =>
      c.text(
        `
<urlset>
  ${paths.map((path) => `<url><loc>${new URL(path, host)}</loc></url>`)}
</urlset>
`,
        200,
        { "Content-Type": "application/xml" },
      )];
  });

  afterEach(async () => {
    await server.shutdown();
  });

  it("generates a site from static urls", async () => {
    app.get("/", (c) => c.html("<h1>Index</h1>"));
    app.get("/about", (c) => c.html("<h1>About</h1>"));
    app.get("/contact", (c) => c.html("<h1>Contact</h1>"));
    app.get(...sitemap(["/", "/about", "/contact"]));

    await staticalize({
      host,
      base: new URL("https://frontside.com"),
      dir: "test/dist",
    });

    await expect(content("test/dist/index.html")).resolves.toEqual(
      "<html><head></head><body><h1>Index</h1></body></html>",
    );
    await expect(content("test/dist/about/index.html")).resolves.toEqual(
      "<html><head></head><body><h1>About</h1></body></html>",
    );
    await expect(content("test/dist/contact/index.html")).resolves.toEqual(
      "<html><head></head><body><h1>Contact</h1></body></html>",
    );

    let text = await Deno.readTextFile("test/dist/sitemap.xml");

    // entries are `<url>`, as https://www.sitemaps.org/protocol.html requires
    expect(text).not.toContain("<urls>");

    let xml = parse(text);

    //@ts-expect-error this is an unknown xml doc
    let [one, two, three] = xml.urlset.url.map((u) => u.loc);
    expect([one, two, three]).toEqual([
      "https://frontside.com/",
      "https://frontside.com/about",
      "https://frontside.com/contact",
    ]);
  });

  it("handles nested subdirectories", async () => {
    app.get("/deeply/nested/page", (c) => c.html("<h1>Nested</h1>"));
    app.get(...sitemap(["/deeply/nested/page"]));

    await staticalize({
      base: new URL("https://fs.com"),
      host,
      dir: "test/dist",
    });
    expect(content("test/dist/deeply/nested/page/index.html")).resolves.toEqual(
      "<html><head></head><body><h1>Nested</h1></body></html>",
    );
  });

  it("fetches assets from downloaded html pages", async () => {
    app.get("/spa", (c) =>
      c.html(`
<html>
  <head>
    <link rel="stylesheet" href="assets/styles.css"/>
  </head>
  <body>
    <script src="assets/script.js">
  </body>
</html>
`));

    app.get(
      "/assets/styles.css",
      (c) =>
        c.text("body { font-size: 100px; }", 200, {
          "Content-Type": "text/css",
        }),
    );
    app.get(
      "/assets/script.js",
      (c) =>
        c.text("console.log('hello world');", 200, {
          "Content-Type": "text/javascript",
        }),
    );

    app.get(...sitemap(["/spa"]));

    await staticalize({
      base: new URL("htts:/fs.com"),
      host,
      dir: "test/dist",
    });

    await expect(exists("test/dist/assets/styles.css")).resolves.toEqual(true);
    await expect(content("test/dist/assets/styles.css")).resolves.toEqual(
      "body { font-size: 100px; }",
    );
    await expect(exists("test/dist/assets/script.js")).resolves.toEqual(true);
    await expect(content("test/dist/assets/script.js")).resolves.toEqual(
      "console.log('hello world');",
    );
  });

  it("keeps going and does not crash when a page fails to download", async () => {
    app.get("/", (c) => c.html("<h1>Index</h1>"));
    // advertises gzip but the body is not valid gzip — decoding this response
    // throws `Invalid gzip header`, which used to escape uncaught and crash the
    // whole run with no indication of which url was at fault.
    app.get("/bad", (c) =>
      c.body("this is definitely not gzip", 200, {
        "Content-Type": "text/html",
        "Content-Encoding": "gzip",
      }));
    app.get("/good", (c) => c.html("<h1>Good</h1>"));
    app.get(...sitemap(["/", "/bad", "/good"]));

    // the run resolves rather than rejecting with the decode error
    await staticalize({
      host,
      base: new URL("https://frontside.com"),
      dir: "test/dist",
    });

    // the healthy pages were still written to disk
    await expect(exists("test/dist/index.html")).resolves.toEqual(true);
    await expect(exists("test/dist/good/index.html")).resolves.toEqual(true);
    // the page that could not be decoded was skipped, not written
    await expect(exists("test/dist/bad/index.html")).resolves.toEqual(false);
  });

  it("fails fast on the first download error when strict", async () => {
    app.get("/", (c) => c.html("<h1>Index</h1>"));
    // same bad-gzip fixture as above: decoding this response throws.
    app.get("/bad", (c) =>
      c.body("this is definitely not gzip", 200, {
        "Content-Type": "text/html",
        "Content-Encoding": "gzip",
      }));
    app.get("/good", (c) => c.html("<h1>Good</h1>"));
    app.get(...sitemap(["/", "/bad", "/good"]));

    // in strict mode the failure aborts the run rather than being collected
    await expect(
      staticalize({
        host,
        base: new URL("https://frontside.com"),
        dir: "test/dist",
        strict: true,
      }),
    ).rejects.toThrow(/could not download/);
  });

  it("does not download assets that are in a different domain", async () => {
    app.get("/spa", (c) =>
      c.html(`
<html>
  <head>
    <link rel="stylesheet" href="https://google.com/cdn/mui.css"/>
  </head>
</html>
`));
    app.get(...sitemap(["/spa"]));
    await staticalize({
      base: new URL("htts:/fs.com"),
      host,
      dir: "test/dist",
    });

    await expect(exists("test/dist/cdn/mui.css")).resolves.toEqual(false);
  });

  it("downloads absolute assets that have the same host as the host that we're scraping", async () => {
    let styles = new URL(host);
    styles.pathname = "assets/styles.css";
    app.get("/spa", (c) =>
      c.html(`
<html>
  <head>
    <link rel="stylesheet" href="${styles.toString()}"/>
  </head>
</html>
`));

    app.get(
      "/assets/styles.css",
      (c) =>
        c.text("body { font-size: 100px; }", 200, {
          "Content-Type": "text/css",
        }),
    );

    app.get(...sitemap(["/spa"]));

    await staticalize({
      base: new URL("htts:/fs.com"),
      host,
      dir: "test/dist",
    });

    await expect(exists("test/dist/assets/styles.css")).resolves.toEqual(true);
  });

  it("replaces references to absolute assets that have the sae host that we're scraping", async () => {
    const html = `
<html>
  <head>
    <link rel="canonical"  href="${host}"/>
    <meta property="og:url" content="${host}image.png"/>
    <script src="${host}main.js"></script>
  </head>
  <body></body>
</html>
`;
    app.get("/", (c) => c.html(html))
      .get("/alt", (c) => c.html(html))
      .get("/image.png", (c) => c.text(""))
      .get("/main.js", (c) => c.text("console.log('hi')"))
      .get(...sitemap(["/"]));

    await staticalize({
      base: new URL("https://fs.com"),
      host,
      dir: "test/dist",
    });

    await expect(content("test/dist/index.html")).resolves.toContain(
      `<link rel="canonical" href="https://fs.com/">`,
    );
    await expect(content("test/dist/index.html")).resolves.toContain(
      `<script src="https://fs.com/main.js">`,
    );
    await expect(content("test/dist/index.html")).resolves.toContain(
      `<meta property="og:url" content="https://fs.com/image.png">`,
    );
  });

  it("carries the path of the base url into every rewritten url", async () => {
    app.get(
      "/",
      (c) =>
        c.html(`
<html>
  <head>
    <link rel="canonical" href="${host}"/>
    <meta property="og:url" content="${host}image.png"/>
    <script src="${host}main.js"></script>
  </head>
  <body></body>
</html>
`),
    )
      .get("/about", (c) => c.html("<h1>About</h1>"))
      .get("/image.png", (c) => c.text(""))
      .get("/main.js", (c) => c.text("console.log('hi')"))
      .get(...sitemap(["/", "/about"]));

    await staticalize({
      base: new URL("https://frontside.com/effection"),
      host,
      dir: "test/dist",
    });

    let index = await content("test/dist/index.html");
    expect(index).toContain(
      `<link rel="canonical" href="https://frontside.com/effection/">`,
    );
    expect(index).toContain(
      `<script src="https://frontside.com/effection/main.js">`,
    );
    expect(index).toContain(
      `<meta property="og:url" content="https://frontside.com/effection/image.png">`,
    );

    let sitemapXML = await Deno.readTextFile("test/dist/sitemap.xml");
    expect(sitemapXML).toContain(
      "<loc>https://frontside.com/effection/</loc>",
    );
    expect(sitemapXML).toContain(
      "<loc>https://frontside.com/effection/about</loc>",
    );
  });

  it("replaces self-referencing urls in anchors", async () => {
    app.get(
      "/",
      (c) => c.html(`<a href="${host}about">about</a>`),
    )
      .get("/about", (c) => c.html("<h1>About</h1>"))
      .get(...sitemap(["/", "/about"]));

    await staticalize({
      base: new URL("https://fs.com"),
      host,
      dir: "test/dist",
    });

    await expect(content("test/dist/index.html")).resolves.toContain(
      `<a href="https://fs.com/about">about</a>`,
    );
  });

  it("does not download pages that are only linked from an anchor", async () => {
    app.get("/", (c) => c.html(`<a href="${host}unlisted">unlisted</a>`))
      .get("/unlisted", (c) => c.html("<h1>Unlisted</h1>"))
      .get(...sitemap(["/"]));

    await staticalize({
      base: new URL("https://fs.com"),
      host,
      dir: "test/dist",
    });

    await expect(exists("test/dist/unlisted/index.html")).resolves.toEqual(
      false,
    );
  });

  it("replaces self-referencing urls in text bodies", async () => {
    app.get("/llms.txt", (c) =>
      c.text(`[API]: ${host}api.md\n`, 200, {
        "Content-Type": "text/plain; charset=utf-8",
      }))
      .get("/AGENTS.md", (c) =>
        c.text(`see ${host}api.md\n`, 200, {
          "Content-Type": "text/markdown; charset=utf-8",
        }))
      .get("/feed.xml", (c) =>
        c.text(`<link>${host}about</link>`, 200, {
          "Content-Type": "application/rss+xml",
        }))
      .get("/data.json", (c) =>
        c.text(`{"self":"${host}data.json"}`, 200, {
          "Content-Type": "application/json",
        }))
      .get(
        "/styles.css",
        (c) =>
          c.text(`body { background: url(${host}bg.png); }`, 200, {
            "Content-Type": "text/css",
          }),
      )
      .get(
        ...sitemap([
          "/llms.txt",
          "/AGENTS.md",
          "/feed.xml",
          "/data.json",
          "/styles.css",
        ]),
      );

    await staticalize({
      base: new URL("https://fs.com"),
      host,
      dir: "test/dist",
    });

    await expect(content("test/dist/llms.txt")).resolves.toEqual(
      "[API]: https://fs.com/api.md\n",
    );
    await expect(content("test/dist/AGENTS.md")).resolves.toEqual(
      "see https://fs.com/api.md\n",
    );
    await expect(content("test/dist/feed.xml")).resolves.toEqual(
      "<link>https://fs.com/about</link>",
    );
    await expect(content("test/dist/data.json")).resolves.toEqual(
      `{"self":"https://fs.com/data.json"}`,
    );
    await expect(content("test/dist/styles.css")).resolves.toEqual(
      "body { background: url(https://fs.com/bg.png); }",
    );
  });

  it("carries the path of the base url into text bodies", async () => {
    app.get("/llms.txt", (c) =>
      c.text(`[API]: ${host}api.md\n`, 200, {
        "Content-Type": "text/plain; charset=utf-8",
      }))
      .get(...sitemap(["/llms.txt"]));

    await staticalize({
      base: new URL("https://frontside.com/effection"),
      host,
      dir: "test/dist",
    });

    await expect(content("test/dist/llms.txt")).resolves.toEqual(
      "[API]: https://frontside.com/effection/api.md\n",
    );
  });

  it("streams bodies that are not text byte for byte", async () => {
    // a png that would be corrupted by a decode/encode round trip
    let png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    app.get("/logo.png", (c) =>
      c.body(png.buffer, 200, {
        "Content-Type": "image/png",
      }))
      .get(...sitemap(["/logo.png"]));

    await staticalize({
      base: new URL("https://fs.com"),
      host,
      dir: "test/dist",
    });

    await expect(Deno.readFile("test/dist/logo.png")).resolves.toEqual(png);
  });
});

async function content(path: string): Promise<string> {
  if (!await exists(path)) {
    expect("did not exist").toEqual(path);
  }
  let bytes = await Deno.readFile(path);
  return new TextDecoder().decode(bytes);
}

function staticalize(
  ...options: Parameters<typeof useStaticalizer>
): Task<void> {
  return run(function* () {
    let staticalizer = yield* useStaticalizer(...options);
    yield* staticalizer.staticalize();
  });
}
