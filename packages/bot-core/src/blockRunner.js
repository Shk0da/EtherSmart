class BlockRunner {
  constructor(handler, log) {
    this.handler = handler;
    this.log = log;
    this.busy = false;
    this.skipped = 0;
  }

  async onBlock(blockNumber) {
    if (this.busy) {
      this.skipped += 1;
      this.log.debug({ blockNumber, skipped: this.skipped }, "block skipped");
      return;
    }
    this.busy = true;
    const started = Date.now();
    try {
      await this.handler(blockNumber);
    } finally {
      this.busy = false;
      this.log.debug(
        { blockNumber, ms: Date.now() - started },
        "block processed"
      );
    }
  }
}

module.exports = { BlockRunner };
