// You can write utility functions to expand your code snippet library.
// These can be common utility functions or any functions you want to reuse.

/**
 * Display a notification in the current space
 * @param desc Description of the notification
 */
export function notify(desc: string) {
    eidos.currentSpace.notify({
        title: "Notification",
        description: desc
    })
}


/**
 * sleep for a while
 * @param ms milliseconds
 */
export async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


/**
 * Scripts with a default export can be executed using the "Run" button in the top-left corner,
 * which serves as a testing mechanism.
 */
export default async function () {
    // sleep 1s so that you can see the running icon in the status bar when you click the run button
    await sleep(1000)
    notify('Hello from script!')
}
