import { call, main } from "effection";
import { parser } from "npm:zod-opts";
import { z } from "npm:zod";
import { staticalize } from "./staticalize.ts";
import { join } from "jsr:@std/path";

const url = () =>
  z.string().refine((str) => str.match(/^http/), {
    message: `must be a hypertext (http) url`,
  });

await main(function* (args) {
  let options = parser()
    .name("staticalize")
    .description(
      "Create a static version of a website by traversing a dynamically evaluated sitemap.xml",
    )
    .version(yield* version())
    .options({
      site: {
        alias: "s",
        type: url(),
        description:
          "URL of the website to staticalize. E.g. http://localhost:8000",
      },
      output: {
        type: z.string().default("dist"),
        description: "Directory to place the downloaded site",
        alias: "o",
      },
      "base": {
        type: url(),
        description:
          "Base URL of the public website. E.g. http://frontside.com",
      },
    })
    .parse(args);

  yield* staticalize({
    base: new URL(options.base),
    host: new URL(options.site),
    dir: options.output,
  });
});

function* version() {
  try {
    return yield* call(() => Deno.readTextFile(join(import.meta.dirname ?? "./", "VERSION")));
  } catch {
    return "0.0.0"
  }
}