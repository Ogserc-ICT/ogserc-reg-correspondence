// Runs once when the server starts.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertClockSafe } = await import("./server/clock");
    assertClockSafe(); // refuses to start in production with APP_NOW set
  }
}
