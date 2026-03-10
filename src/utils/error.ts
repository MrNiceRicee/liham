// shared error helpers — safe process kill, signal send, error extraction.

// safe process kill — wraps try/catch for already-exited processes
export function safeKill(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- accepts Bun Subprocess, Node ChildProcess, etc.
	proc: { kill: (...args: any[]) => void },
	signal: string = 'SIGKILL',
): void {
	try {
		proc.kill(signal)
	} catch {
		// already exited
	}
}

// safe signal send — wraps process.kill(pid, signal) for SIGSTOP/SIGCONT
export function safeSendSignal(pid: number, signal: string): void {
	try {
		process.kill(pid, signal)
	} catch {
		// already exited
	}
}

// extract error message from unknown catch value
export function extractError(err: unknown, fallback: string): string {
	if (err instanceof Error) return err.message
	return fallback
}
