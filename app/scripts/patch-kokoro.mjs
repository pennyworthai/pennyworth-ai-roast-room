import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const target = path.join(root, "node_modules", "kokoro-js", "dist", "kokoro.js");

if (fs.existsSync(target)) {
  let content = fs.readFileSync(target, "utf8");
  const badPattern = 'const a="undefined"!=typeof __dirname?__dirname:import.meta.dirname,t=s.resolve(a,`../voices/${e}.bin`),{buffer:r}=await i.readFile(t);';
  const goodPattern = 'const t=new URL(`../voices/${e}.bin`,import.meta.url),{buffer:r}=await i.readFile(t);';
  if (content.includes(badPattern)) {
    content = content.replace(badPattern, goodPattern);
    fs.writeFileSync(target, content, "utf8");
    console.log("Patched kokoro-js voice loading successfully.");
  } else {
    console.log("kokoro-js already patched or pattern updated.");
  }
}

