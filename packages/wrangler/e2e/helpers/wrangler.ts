import { spawn } from "node:child_process";
import events from "node:events";
import rl from "node:readline";
import { PassThrough } from "node:stream";
import { ReadableStream } from "node:stream/web";
import { setTimeout } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { readUntil } from "./read-until";
import type { ChildProcess } from "node:child_process";

// Replace all backslashes with forward slashes to ensure that their use
// in scripts doesn't break.
export const WRANGLER = process.env.WRANGLER?.replaceAll("\\", "/") ?? "";
export const WRANGLER_IMPORT = pathToFileURL(
	process.env.WRANGLER_IMPORT?.replaceAll("\\", "/") ?? ""
);

const DEFAULT_WRANGLER_RUN_TIMEOUT = 50_000;

export async function runWrangler(
	wranglerCommand: string,
	options: {
		cwd?: string;
		env?: typeof process.env;
		debug?: boolean;
		timeout?: number;
	} = {}
) {
	const timeout = options.timeout ?? DEFAULT_WRANGLER_RUN_TIMEOUT;
	const wranglerProcess = runWranglerLongLived(wranglerCommand, options);
	return Promise.race([
		wranglerProcess.finalOutput(),
		setTimeout(timeout).then(() =>
			Promise.reject(
				`Running "${wranglerCommand}" took too long (${timeout}).\nCommand output:` +
					wranglerProcess.output
			)
		),
	]);
}

export function runWranglerLongLived(
	wranglerCommand: string,
	options: { cwd?: string; env?: typeof process.env; debug?: boolean } = {},
	// The caller is responsible for cleaning up Wrangler processes. `runWrangler` will register started processes in this Set
	cleanup?: Set<ChildProcess>
) {
	if (options.debug) {
		process.env.WRANGLER_LOG = "debug";
	}
	// Enforce a `wrangler` prefix to make commands clearer to read
	if (!wranglerCommand.startsWith("wrangler ")) {
		throw new Error(
			"Commands must start with `wrangler` (e.g. `wrangler dev`)"
		);
	}
	const runnableCommand = `${WRANGLER} ${wranglerCommand.slice(
		"wrangler ".length
	)}`;
	const wranglerProcess = spawn(runnableCommand, [], {
		shell: true,
		cwd: options.cwd,
		stdio: "pipe",
		env: options.env,
	});
	if (cleanup) {
		cleanup.add(wranglerProcess);
	}
	const output = new PassThrough();
	wranglerProcess.stdout.pipe(output);
	wranglerProcess.stderr.pipe(output);

	const exitPromise = events.once(wranglerProcess, "exit");

	const lineBuffer: string[] = [];

	const lines = new ReadableStream<string>({
		start(controller) {
			const lineInterface = rl.createInterface(output);
			lineInterface.on("line", (line) => {
				// eslint-disable-next-line turbo/no-undeclared-env-vars
				if (process.env.VITEST_MODE === "WATCH") {
					console.log(line);
				}
				lineBuffer.push(line);
				try {
					controller.enqueue(line);
				} catch {}
			});
			void exitPromise.then(() => controller.close());
		},
	});

	return {
		// Wait for changes in the output of this Wrangler process.
		async readUntil(
			regexp: RegExp,
			timeout?: number
		): Promise<RegExpMatchArray> {
			return readUntil(lines, regexp, timeout);
		},
		// Return a snapshot of the output so far
		get output() {
			return lineBuffer.join("\n");
		},
		// This is a custom thenable—awaiting `runWrangler` will wait for the process to exit
		async then(
			resolve: (output: string) => void,
			reject: (output: string) => void
		) {
			const [exitCode] = await exitPromise;
			if (exitCode !== 0) {
				lineBuffer.unshift(`Failed to run ${JSON.stringify(wranglerCommand)}:`);
				reject(lineBuffer.join("\n"));
			} else {
				resolve(lineBuffer.join("\n"));
			}
		},
		async finalOutput() {
			await exitPromise;
			return lineBuffer.join("\n");
		},
	};
}

export async function waitForReady(
	worker: ReturnType<typeof runWranglerLongLived>
): Promise<{ url: string }> {
	const match = await worker.readUntil(/Ready on (?<url>https?:\/\/.*)/, 5_000);
	return match.groups as { url: string };
}

export async function waitForReload(
	worker: ReturnType<typeof runWranglerLongLived>
): Promise<void> {
	await worker.readUntil(
		/Detected changes, restarted server|Reloading local server\.\.\./
	);
}
