import { copyFile, mkdir } from "node:fs/promises";
await mkdir("dist/spaces-demo/public", { recursive: true });
for (const name of ["index.html", "style.css"])
  await copyFile(
    "spaces-demo/public/" + name,
    "dist/spaces-demo/public/" + name,
  );
