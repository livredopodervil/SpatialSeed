export const DEFAULT_DEMO_LAUNCH_POLICY_VERSION =
  "default-demo-launch-policy-v1-recovery-first";

const RECOVERY_MODES_WITHOUT_PERSISTED_PROJECT = new Set([
  "empty",
  "unavailable",
  "error",
  "discarded"
]);

/**
 * The default demo is a route fallback, not persisted session state.
 * A restored project always wins and reopens in authoring mode.
 */
export function shouldStartDefaultDemoAfterRecovery(
  launch,
  recoveryStatus
) {
  if (launch?.mode !== "game") return false;
  const recoveryMode = String(recoveryStatus?.mode ?? "").trim();
  return RECOVERY_MODES_WITHOUT_PERSISTED_PROJECT.has(recoveryMode);
}
