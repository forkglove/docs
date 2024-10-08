import { Plugin, LoadContext } from "@docusaurus/types";
import child_process from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import stripJsonComments from "strip-json-comments";
import * as typedoc from "typedoc";

/**
 * Generate typedoc for the extension API.
 */
export default async function (_context: LoadContext, _options: unknown): Promise<Plugin> {
  const typedocOutputPath = path.join(__dirname, "..", "..", "static", "extension-api");
  const tmpdir = await fs.mkdtemp(path.join(os.tmpdir(), "foxglove-extension-api-docs"));

  // Install the latest version of @foxglove/studio from NPM into a temp directory
  console.log(`Installing @foxglove/studio in ${tmpdir}...`);
  child_process.spawnSync("npm", ["install", "--prefix", tmpdir, "@foxglove/studio@latest"], {
    encoding: "utf8",
    stdio: "inherit",
  });

  // Configure the TypeDoc project with a tsconfig.json file
  const foxgloveTsconfig = JSON.parse(
    stripJsonComments(await fs.readFile(require.resolve("@foxglove/tsconfig/base.json"), "utf-8")),
  ) as Record<string, unknown>;
  await fs.writeFile(
    path.join(tmpdir, "tsconfig.json"),
    JSON.stringify({
      ...foxgloveTsconfig,
      include: ["node_modules/@foxglove/studio/**/*.ts"],
      compilerOptions: {
        ...(foxgloveTsconfig.compilerOptions ?? {}),
        lib: ["es2022", "dom"],
      },
    }),
  );

  // Configure TypeDoc
  const packageRoot = path.join(tmpdir, "node_modules/@foxglove/studio");
  const typedocApp = await typedoc.Application.bootstrap({
    basePath: packageRoot,
    tsconfig: path.join(tmpdir, "tsconfig.json"),
    entryPoints: [path.join(packageRoot, "src/index.ts")],
    // Since the package is under node_modules, typedoc treats all the classes/symbols as "external"
    // meaning they are hidden from the UI by default. We want them to be visible by default.
    externalPattern: [],
  });
  const reflection = await typedocApp.convert();
  if (!reflection) {
    throw new Error("typedoc convert() failed");
  }

  // Generate the TypeDoc output
  await fs.rm(typedocOutputPath, { recursive: true, force: true });
  await fs.mkdir(typedocOutputPath, { recursive: true });
  await typedocApp.generateDocs(reflection, typedocOutputPath);

  console.log("Generated extension API docs in", typedocOutputPath);

  return {
    name: "foxglove-extension-api-docs",

    async postBuild(_props) {
      console.log("Removing autogenerated typedoc files");
      await fs.rm(typedocOutputPath, { recursive: true, force: true });
      await fs.rm(tmpdir, { recursive: true, force: true });
    },
  };
}
