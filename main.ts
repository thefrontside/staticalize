import { main } from "effection";
import { staticalize } from "./staticalize.ts";
import { config } from "./config.ts";

await main(function* (args) {
  let parser = config.createParser({
    envs: [{ name: "ENV", value: Deno.env.toObject() }],
    args,
  });

  switch (parser.type) {
    case "help":
    case "version":
      console.log(parser.print());
      break;
    case "main": {
      let result = parser.parse();
      if (result.ok) {
        let { base, site, output } = result.value;
        yield* staticalize({
          base: new URL(base),
          host: new URL(site),
          dir: output,
        });
      } else {
        console.error(result.error.message);
        console.log(`\n\`staticalize --help\` for available options`);
      }
      break;
    }
  }
});
