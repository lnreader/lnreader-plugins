export function showToast(...message: Parameters<(typeof console)["log"]>) {
    console.log(...message);
}
