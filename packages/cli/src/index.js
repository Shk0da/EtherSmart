const { run } = require("./commands");

run(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    console.error(`ethersmart: ${err.message}`);
    process.exitCode = 1;
  });
