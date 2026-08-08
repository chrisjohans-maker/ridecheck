// Update detection (pure). Compares the build id baked into the running bundle
// against the build id currently deployed (fetched from /version.json).
export function updateAvailable(runningId, deployedId) {
  // Only prompt when both ids are real and different. 'dev' means an un-built
  // (vite dev / test) context where there's nothing to update to.
  return !!(runningId && deployedId && runningId !== 'dev' && runningId !== deployedId);
}
