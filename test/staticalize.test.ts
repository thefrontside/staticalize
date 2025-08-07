import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { expect } from "https://deno.land/x/expect@v0.3.0/mod.ts";

import { staticalize as $staticalize } from "../mod.ts";
import { emptyDir, exists } from "@std/fs";

import { Hono } from "jsr:@hono/hono";
import { parse } from "@libs/xml";
import { run, Task } from "effection";

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
      "<h1>Index</h1>",
    );
    await expect(content("test/dist/about/index.html")).resolves.toEqual(
      "<h1>About</h1>",
    );
    await expect(content("test/dist/contact/index.html")).resolves.toEqual(
      "<h1>Contact</h1>",
    );

    let xml = parse(await Deno.readTextFile("test/dist/sitemap.xml"));

    //@ts-expect-error this is an unknown xml doc
    let [one, two, three] = xml.urlset.urls.map((u) => u.loc);
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
      "<h1>Nested</h1>",
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

  it.skip("replaces references to absolute assets that have the sae host that we're scraping", async () => {
    const html = `
<html>
  <head>
    <link rel="canonical"  href="${host}"/>
    <link rel="alternate"  href="${host}alt"/>
  </head>
</html>
`
    app.get("/", (c) =>
      c.html(html))
      .get("/alt", (c) => c.html(html))
      .get(...sitemap(["/"]));

    await staticalize({
      base: new URL("https://fs.com"),
      host,
      dir: "test/dist",
    });

    await expect(content("test/dist/index.html")).resolves.toEqual(`
<html>
  <head>
    <link rel="canonical"  href="https://fs.com/"/>
    <link rel="alternate"  href="https://fs.com/alt"/>
  </head>
</html>
`);
  });
});

async function content(path: string): Promise<string> {
  if (!await exists(path)) {
    expect("did not exist").toEqual(path);
  }
  let bytes = await Deno.readFile(path);
  return new TextDecoder().decode(bytes);
}

function staticalize(...options: Parameters<typeof $staticalize>): Task<void> {
  return run(() => $staticalize(...options));
}
