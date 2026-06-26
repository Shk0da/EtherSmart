const { run } = require("./commands");

run(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`ethersmart: ${err.message}`);
    process.exit(1);
  });
