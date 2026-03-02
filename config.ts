import { cli, field, object, program } from "configliere";
import z from "zod";
import denoJSON from "./deno.json" with { type: "json" };

const url = () =>
  z.string().refine((str) => str.match(/^http/), {
    message: `must be a hypertext (http) url`,
  });

export const config = program({
  name: "staticalize",
  version: denoJSON.version,
  config: object({
    site: {
      description:
        "URL of the website to staticalize. E.g. http://localhost:8000",
      ...field(url(), cli.argument()),
    },
    output: {
      description: "Directory to place the downloaded site",
      ...field(z.string(), field.default("dist")),
    },
    base: {
      description: "Base URL of the public website. E.g. http://frontside.com",
      ...field(url()),
    },
  }),
});
