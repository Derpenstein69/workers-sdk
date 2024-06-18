import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fetch } from "undici";
import { beforeAll, describe, expect, it } from "vitest";
import { e2eTest } from "./helpers/e2e-wrangler-test";
import { generateResourceName } from "./helpers/generate-resource-name";
import { makeRoot } from "./helpers/setup";
import { runWrangler } from "./helpers/wrangler";

describe("c3 integration", () => {
	let workerName: string;
	let root: string;
	let c3Packed: string;

	beforeAll(async () => {
		root = await makeRoot();
		workerName = generateResourceName("c3");

		const pathToC3 = path.resolve(__dirname, "../../create-cloudflare");
		execSync("pnpm pack --pack-destination ./pack", { cwd: pathToC3 });
		const version = execSync("ls pack", { encoding: "utf-8", cwd: pathToC3 });
		c3Packed = path.join(pathToC3, "pack", version);
	});

	it("init project via c3", async () => {
		const env = {
			...process.env,
			WRANGLER_C3_COMMAND: `--package ${c3Packed} dlx create-cloudflare`,
			GIT_AUTHOR_NAME: "test-user",
			GIT_AUTHOR_EMAIL: "test-user@cloudflare.com",
			GIT_COMMITTER_NAME: "test-user",
			GIT_COMMITTER_EMAIL: "test-user@cloudflare.com",
		};

		const init = await runWrangler(`wrangler init ${workerName} --yes`, {
			env,
			cwd: root,
		});

		expect(init).toContain("APPLICATION CREATED");

		expect(existsSync(path.join(root, workerName))).toBe(true);
	});

	e2eTest(
		"can run `wrangler dev` on generated worker",
		async ({ run, waitForReady }) => {
			const worker = run(`wrangler dev`, { cwd: path.join(root, workerName) });
			const { url } = await waitForReady(worker);
			const res = await fetch(url);
			expect(await res.text()).toBe("Hello World!");
		}
	);
});
