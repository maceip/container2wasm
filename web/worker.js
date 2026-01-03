importScripts("https://cdn.jsdelivr.net/npm/xterm-pty@0.9.4/workerTools.js");
importScripts(location.origin + "/dist/worker-util.js");

var info;
var args;
var started = false;
var opfsPreopen = null;
var ttyClient = null;
var ttyStream = [];
var opfsReadyPromise = null;

onmessage = async (msg) => {
    const req_ = msg.data;
    if ((typeof req_ == "object") && (req_.type == "init")) {
        console.log("[worker] init received");
        info = req_.info;
        args = req_.args;
        opfsReadyPromise = RunContainer.ensureOpfsPreopen();
        try {
            opfsPreopen = await opfsReadyPromise;
            console.log("[worker] OPFS preopen ready");
        } catch (e) {
            console.error("[worker] OPFS preopen failed", e);
        }
        return;
    }
    if ((typeof req_ == "object") && (req_.type == "tty-log")) {
        // Return and clear accumulated TTY output for testing/automation.
        postMessage({ type: "tty-log", data: ttyStream.join("") });
        ttyStream = [];
        return;
    }
    if ((typeof req_ == "object") && (req_.type == "add-opfs-files")) {
        const files = req_.files || [];
        const names = await RunContainer.addFilesToOpfs(files);
        postMessage({ type: "opfs-updated", files: names });
        return;
    }
    if (started) {
        return; // tty is already wired; additional messages are not expected
    }
    if (opfsReadyPromise) {
        try {
            await opfsReadyPromise;
        } catch (e) {
            console.error("[worker] continuing without OPFS due to init failure", e);
        }
    }
    ttyClient = new TtyClient(msg.data);
    const origWrite = ttyClient.onWrite.bind(ttyClient);
    ttyClient.onWrite = (data) => {
        const text = String.fromCharCode.apply(null, data);
        ttyStream.push(text);
        origWrite(data);
    };
    started = true;
    const extraPreopens = opfsPreopen ? [opfsPreopen] : [];
    console.log("[worker] starting container with extraPreopens:", !!opfsPreopen);
    RunContainer.startContainer(info, args, ttyClient, { extraPreopens });
};
