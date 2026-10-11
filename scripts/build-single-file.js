const { mkdir, readFile, writeFile } = require("fs").promises;
const { dirname, resolve } = require("path");

const root = resolve(__dirname, "..");
const templatePath = resolve(root, "src/index.template.html");
const stylePath = resolve(root, "src/styles.css");
const corePath = resolve(root, "src/gedver-core.js");
const appPath = resolve(root, "src/app.js");
const regionalAtlasPath = resolve(root, "src/data/northwest-europe-10m.json");
const outputPath = resolve(root, "dist/gedver.html");

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const [template, styles, coreScript, appScript, regionalAtlasJson] = await Promise.all([
    readFile(templatePath, "utf8"),
    readFile(stylePath, "utf8"),
    readFile(corePath, "utf8"),
    readFile(appPath, "utf8"),
    readFile(regionalAtlasPath, "utf8"),
  ]);

  const html = template
    .replace("__STYLE__", styles.trim())
    .replace("__REGIONAL_ATLAS__", regionalAtlasJson.trim())
    .replace("__CORE_SCRIPT__", escapeInlineScript(coreScript.trim()))
    .replace("__APP_SCRIPT__", escapeInlineScript(appScript.trim()));

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${html}\n`, "utf8");
  console.log(`Wrote ${outputPath}`);
}

function escapeInlineScript(source) {
  return source.replace(/<\/script/gi, "<\\/script");
}
