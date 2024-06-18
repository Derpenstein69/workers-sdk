import assert from "node:assert";
import crypto from "node:crypto";
import kill from "tree-kill";
import { test } from "vitest";
import { generateResourceName } from "./generate-resource-name";
import { makeRoot, seed } from "./setup";
import { runWranglerLongLived, waitForReady, waitForReload } from "./wrangler";
import type { ChildProcess } from "node:child_process";

interface TestContext {
	tmpPath: string;
	seed(files: Record<string, string | Uint8Array>): Promise<void>;
	run(
		cmd: string,
		options?: Partial<Parameters<typeof runWranglerLongLived>[1]>
	): ReturnType<typeof runWranglerLongLived>;
	r2: (isLocal: boolean) => Promise<string>;
	kv: (isLocal: boolean) => Promise<string>;
	d1: (isLocal: boolean) => Promise<{ id: string; name: string }>;
	waitForReady: typeof waitForReady;
	waitForReload: typeof waitForReload;
}

export const e2eTest = test.extend<TestContext>({
	// eslint-disable-next-line no-empty-pattern
	async tmpPath({}, use) {
		const root = await makeRoot();
		await use(root);
		// Note: we deliberately don't clean up this temporary directory since that can cause Windows CI runners to fail with EBUSY
	},
	async seed({ tmpPath }, use) {
		await use((files) => {
			return seed(tmpPath, files);
		});
	},
	async run({ tmpPath }, use) {
		const cleanupWrangler = new Set<ChildProcess>();
		try {
			await use(
				(
					cmd: string,
					{
						debug = false,
						env = process.env,
						cwd,
					}: Partial<Parameters<typeof runWranglerLongLived>[1]> = {}
				) =>
					runWranglerLongLived(
						cmd,
						{ cwd: cwd ?? tmpPath, debug, env },
						cleanupWrangler
					)
			);
		} finally {
			for (const wrangler of cleanupWrangler) {
				assert(wrangler.pid);
				// This library is needed to ensure all descendent processes are also killed,
				// plus it works on Windows!
				kill(wrangler.pid, (e) => {
					if (e) {
						console.error("Failed to kill wrangler process", wrangler.pid, e);
					}
				});
			}
			cleanupWrangler.clear();
		}
	},
	async kv({ run }, use) {
		const created = new Set<string>();

		await use(async (isLocal) => {
			const name = generateResourceName("kv").replaceAll("-", "_");
			if (isLocal) {
				return name;
			}

			const result = await run(`wrangler kv namespace create ${name}`);
			const match = /id = "([0-9a-f]{32})"/.exec(result);
			assert(match !== null, `Cannot find ID in ${JSON.stringify(result)}`);
			const id = match[1];
			created.add(id);
			return id;
		});
		for (const resource of created) {
			await run(`wrangler kv namespace delete --namespace-id ${resource}`);
		}
		created.clear();
	},
	async r2({ run }, use) {
		const created = new Set<string>();

		await use(async (isLocal) => {
			const name = generateResourceName("r2");
			if (isLocal) {
				return name;
			}

			await run(`wrangler r2 bucket create ${name}`);
			created.add(name);

			return name;
		});
		for (const resource of created) {
			await await run(`wrangler r2 bucket delete ${resource}`);
		}
		created.clear();
	},
	async d1({ run }, use) {
		const created = new Set<string>();

		await use(async (isLocal) => {
			const name = generateResourceName("d1");
			if (isLocal) {
				return { id: crypto.randomUUID(), name };
			}

			const result = await run(`wrangler d1 create ${name}`);
			const match = /database_id = "([0-9a-f-]{36})"/.exec(result);
			assert(match !== null, `Cannot find ID in ${JSON.stringify(result)}`);
			const id = match[1];
			created.add(name);

			return { id, name };
		});
		for (const resource of created) {
			await await run(`wrangler d1 delete -y ${resource}`);
		}
		created.clear();
	},
	// eslint-disable-next-line no-empty-pattern
	async waitForReady({}, use) {
		await use(waitForReady);
	},
	// eslint-disable-next-line no-empty-pattern
	async waitForReload({}, use) {
		await use(waitForReload);
	},
});
