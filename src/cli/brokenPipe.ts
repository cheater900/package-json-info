/**
 * Lets `stream` drop writes once its reader is gone (`| head`): unhandled,
 * EPIPE crashes the process with a stack trace. Other errors still throw.
 */
export function ignoreBrokenPipe(stream: NodeJS.WritableStream): void {
    stream.on("error", (error: NodeJS.ErrnoException) => {
        if (error.code !== "EPIPE") {
            throw error;
        }
    });
}
