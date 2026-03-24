#!/usr/bin/env node
import { main } from "#src/index.js";

void main(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
});
