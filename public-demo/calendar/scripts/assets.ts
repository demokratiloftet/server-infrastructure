import { build } from "esbuild";
import { copyFile, mkdir } from "node:fs/promises";
await mkdir(new URL("../dist/public/", import.meta.url), { recursive: true });
for (const file of ["index.html", "style.css"])
  await copyFile(
    new URL("../public/" + file, import.meta.url),
    new URL("../dist/public/" + file, import.meta.url),
  );

await build({
  entryPoints: ["public/app.ts"],
  bundle: true,
  outfile: "dist/public/app.js",
  format: "esm",
  platform: "browser",
  target: "es2023",
});
