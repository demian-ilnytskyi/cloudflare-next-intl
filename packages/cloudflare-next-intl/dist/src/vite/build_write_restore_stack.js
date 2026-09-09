import { writeFileSync } from "node:fs";
const restoreStack = [];
let registered = false;
export function registerBuildWriteRestore(originals) {
    if (originals.size === 0)
        return;
    restoreStack.push(() => {
        for (const [file, contents] of originals) {
            try {
                writeFileSync(file, contents, "utf8");
            }
            catch {
            }
        }
    });
    if (registered)
        return;
    registered = true;
    armProcessRestoreHandlers();
}
function runAllRestores() {
    while (restoreStack.length > 0) {
        const restore = restoreStack.pop();
        restore();
    }
}
function armProcessRestoreHandlers() {
    process.once("exit", runAllRestores);
    for (const signal of ["SIGINT", "SIGTERM"]) {
        process.once(signal, () => {
            runAllRestores();
            process.kill(process.pid, signal);
        });
    }
    process.once("uncaughtException", (err) => {
        runAllRestores();
        throw err;
    });
    process.once("unhandledRejection", (reason) => {
        runAllRestores();
        throw reason;
    });
}
