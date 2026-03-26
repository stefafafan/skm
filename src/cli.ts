#!/usr/bin/env node
import { main } from "./cli/main.js";

void main(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
});
