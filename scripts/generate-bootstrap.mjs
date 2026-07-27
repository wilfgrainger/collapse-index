import { mkdir, writeFile } from "node:fs/promises";
import { buildIllustrativeHistory, createPrototypeSnapshot } from "../src/demo.js";

const outputDirectory = new URL("../public/data/", import.meta.url);
await mkdir(outputDirectory, { recursive: true });

const payload = {
  index: createPrototypeSnapshot("2026-07-27T12:00:00.000Z"),
  history: {
    seriesKind: "illustrative-backcast",
    warning: "This is a visual prototype, not a historically calculated index.",
    points: buildIllustrativeHistory()
  }
};

await writeFile(new URL("bootstrap.json", outputDirectory), `${JSON.stringify(payload, null, 2)}\n`);
console.log("Generated public/data/bootstrap.json");
