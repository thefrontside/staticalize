import { exit, main } from "effection";
import { useStaticalizer } from "./staticalize.ts";
import { config } from "./config.ts";
import { initStdin, Stdin } from "./stdio.ts";
import { withProgress } from "./progress.ts";

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

        let stdin = yield* initStdin;

        yield* Stdin.around({
          *useStdin() {
            return stdin;
          },
        });

        let staticalizer = yield* useStaticalizer({
          base: new URL(base),
          host: new URL(site),
          dir: output,
        });

        let { errors } = yield* withProgress({
          host: new URL(site).hostname,
          dir: output,
          staticalizer,
        });

        if (errors.length > 0) {
          console.error(`\n${errors.length} failed downloads:\n`);
          for (let error of errors) {
            console.error(`  ${error.url}`);
            console.error(`    referrer: ${error.referrer}\n`);
          }
          yield* exit(1);
        }
      } else {
        console.error(result.error.message);
        console.log(`\n\`staticalize --help\` for available options`);
      }
      break;
    }
  }
});
