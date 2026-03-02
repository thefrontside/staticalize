import { build, emptyDir } from "dnt";

const outDir = "./build/npm";

await emptyDir(outDir);

let [version] = Deno.args;
if (!version) {
  throw new Error("a version argument is required to build the npm package");
}

await build({
  entryPoints: [
    "./mod.ts",
    {
      name: "staticalize",
      path: "./main.ts",
      kind: "bin",
    },
  ],
  outDir,
  shims: {
    deno: true,
  },
  scriptModule: false,
  test: false,
  typeCheck: false,
  compilerOptions: {
    lib: ["ESNext"],
    target: "ES2020",
    sourceMap: true,
  },
  package: {
    name: "staticalize",
    version,
    description: "Download a dynamic website and turn it into a static site",
    license: "MIT",
    author: "engineering@frontside.com",
    repository: {
      type: "git",
      url: "git+https://github.com/thefrontside/staticalize.git",
    },
    bugs: {
      url: "https://github.com/thefrontside/staticalize/issues",
    },
    engines: {
      node: ">= 18",
    },
    sideEffects: false,
  },
});

await Deno.copyFile("README.md", `${outDir}/README.md`);
