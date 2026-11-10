#!/usr/bin/env node
import { ignoreBrokenPipe } from "./brokenPipe";
import { run } from "./run";

ignoreBrokenPipe(process.stdout);
ignoreBrokenPipe(process.stderr);
process.exitCode = await run(process.argv.slice(2), {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
});
