const { ESLint } = require("eslint");

(async function main() {
  const eslint = new ESLint({
    extensions: [".js", ".jsx", ".ts", ".tsx"],
  });
  const results = await eslint.lintFiles(["app", "components", "hooks", "lib"]);
  const formatter = await eslint.loadFormatter("stylish");
  const resultText = formatter.format(results);
  console.log(resultText);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
