import crypto from "node:crypto";
import path from "node:path";
import dedent from "ts-dedent";
import { beforeAll, chai, describe, expect, it } from "vitest";
import { CLOUDFLARE_ACCOUNT_ID } from "./helpers/account-id";
import { normalizeOutput } from "./helpers/normalize";
import { makeRoot, seed } from "./helpers/setup";
import { runWrangler } from "./helpers/wrangler";

chai.config.truncateThreshold = 1e6;

function matchVersionId(stdout: string): string {
	return stdout.match(/Version ID:\s+([a-f\d-]+)/)?.[1] as string;
}
function countOccurrences(stdout: string, substring: string) {
	return stdout.split(substring).length - 1;
}

const TIMEOUT = 50_000;

describe("versions deploy", { timeout: TIMEOUT }, () => {
	let workerName: string;
	let workerPath: string;
	let normalize: (str: string) => string;
	let versionId0: string;
	let versionId1: string;
	let versionId2: string;

	beforeAll(async () => {
		const root = await makeRoot();
		workerName = `tmp-e2e-wrangler-${crypto.randomBytes(4).toString("hex")}`;
		workerPath = path.join(root, workerName);
		normalize = (str) =>
			normalizeOutput(
				str,
				new Map<string | RegExp, string>([
					[workerName, "tmp-e2e-wrangler"],
					[CLOUDFLARE_ACCOUNT_ID, "CLOUDFLARE_ACCOUNT_ID"],
					[/^Author:(\s+).+@.+$/gm, "Author:$1person@example.com"],
				])
			);

		await seed(workerPath, {
			"wrangler.toml": dedent`
							name = "${workerName}"
							main = "src/index.ts"
							compatibility_date = "2023-01-01"
					`,
			"src/index.ts": dedent`
							export default {
								fetch(request) {
									return new Response("Hello World!")
								}
							}`,
			"package.json": dedent`
							{
								"name": "${workerName}",
								"version": "0.0.0",
								"private": true
							}
							`,
		});
	});

	it("deploy worker", async () => {
		// TEMP: regular deploy needed for the first time to *create* the worker (will create 1 extra version + deployment in snapshots below)
		const deploy = await runWrangler("wrangler deploy", { cwd: workerPath });
		versionId0 = matchVersionId(deploy);
	});

	it("upload 1st worker version", async () => {
		const upload = await runWrangler(
			`wrangler versions upload --message "Upload via e2e test" --tag "e2e-upload"  --x-versions`,
			{ cwd: workerPath }
		);

		versionId1 = matchVersionId(upload);

		expect(normalize(upload)).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Worker Version ID: 00000000-0000-0000-0000-000000000000
			Uploaded tmp-e2e-wrangler (TIMINGS)
			To deploy this version to production traffic use the command wrangler versions deploy --experimental-versions
			Changes to non-versioned settings (config properties 'logpush' or 'tail_consumers') take effect after your next deployment using the command wrangler versions deploy --experimental-versions
			Changes to triggers (routes, custom domains, cron schedules, etc) must be applied with the command wrangler triggers deploy --experimental-versions"
		`);
	});

	it("list 1 version", async () => {
		const list = await runWrangler(`wrangler versions list  --x-versions`, {
			cwd: workerPath,
		});

		expect(normalize(list)).toMatchInlineSnapshot(`
			"Version ID:  00000000-0000-0000-0000-000000000000
			Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Unknown (version_upload)
			Tag:         e2e-upload
			Message:     Upload via e2e test
			Version ID:  00000000-0000-0000-0000-000000000000
			Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Upload
			Tag:         -
			Message:     -"
		`);

		expect(list).toMatch(/Message:\s+Upload via e2e test/);
		expect(list).toMatch(/Tag:\s+e2e-upload/);
	});

	it("deploy 1st worker version", async () => {
		const deploy = await runWrangler(
			`wrangler versions deploy ${versionId1}@100% --message "Deploy via e2e test" --yes  --x-versions`,
			{ cwd: workerPath }
		);

		expect(normalize(deploy)).toMatchInlineSnapshot(`
			"╭ Deploy Worker Versions by splitting traffic between multiple versions
			│
			├ Fetching latest deployment
			│
			├ Your current deployment has 1 version(s):
			│
			│ (100%) 00000000-0000-0000-0000-000000000000
			│       Created:  TIMESTAMP
			│           Tag:  -
			│       Message:  -
			│
			├ Fetching deployable versions
			│
			├ Which version(s) do you want to deploy?
			├ 1 Worker Version(s) selected
			│
			├     Worker Version 1:  00000000-0000-0000-0000-000000000000
			│              Created:  TIMESTAMP
			│                  Tag:  e2e-upload
			│              Message:  Upload via e2e test
			│
			├ What percentage of traffic should Worker Version 1 receive?
			├ 100% of traffic
			├
			├ Add a deployment message
			│ Deployment message Deploy via e2e test
			│
			├ Deploying 1 version(s)
			│
			│ No non-versioned settings to sync. Skipping...
			│
			╰  SUCCESS  Deployed tmp-e2e-wrangler version 00000000-0000-0000-0000-000000000000 at 100% (TIMINGS)"
		`);
	});

	it("list 1 deployment", async () => {
		const list = await runWrangler(`wrangler deployments list  --x-versions`, {
			cwd: workerPath,
		});

		expect(normalize(list)).toMatchInlineSnapshot(`
			"Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Unknown (deployment)
			Message:     Deploy via e2e test
			Version(s):  (100%) 00000000-0000-0000-0000-000000000000
			                 Created:  TIMESTAMP
			                     Tag:  e2e-upload
			                 Message:  Upload via e2e test
			Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Upload
			Message:     Automatic deployment on upload.
			Version(s):  (100%) 00000000-0000-0000-0000-000000000000
			                 Created:  TIMESTAMP
			                     Tag:  -
			                 Message:  -"
		`);

		expect(list).toContain(versionId1);
	});

	it("modify & upload 2nd worker version", async () => {
		await seed(workerPath, {
			"src/index.ts": dedent`
				export default {
					fetch(request) {
						return new Response("Hello World AGAIN!")
					}
				}`,
		});

		const upload = await runWrangler(
			`wrangler versions upload --message "Upload AGAIN via e2e test" --tag "e2e-upload-AGAIN"  --x-versions`,
			{ cwd: workerPath }
		);

		versionId2 = matchVersionId(upload);

		expect(normalize(upload)).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Worker Version ID: 00000000-0000-0000-0000-000000000000
			Uploaded tmp-e2e-wrangler (TIMINGS)
			To deploy this version to production traffic use the command wrangler versions deploy --experimental-versions
			Changes to non-versioned settings (config properties 'logpush' or 'tail_consumers') take effect after your next deployment using the command wrangler versions deploy --experimental-versions
			Changes to triggers (routes, custom domains, cron schedules, etc) must be applied with the command wrangler triggers deploy --experimental-versions"
		`);

		const versionsList = await runWrangler(
			`wrangler versions list  --x-versions`,
			{ cwd: workerPath }
		);

		expect(normalize(versionsList)).toMatchInlineSnapshot(`
			"Version ID:  00000000-0000-0000-0000-000000000000
			Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Unknown (version_upload)
			Tag:         e2e-upload-AGAIN
			Message:     Upload AGAIN via e2e test
			Version ID:  00000000-0000-0000-0000-000000000000
			Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Unknown (version_upload)
			Tag:         e2e-upload
			Message:     Upload via e2e test
			Version ID:  00000000-0000-0000-0000-000000000000
			Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Upload
			Tag:         -
			Message:     -"
		`);

		expect(versionsList).toMatch(/Message:\s+Upload AGAIN via e2e test/);
		expect(versionsList).toMatch(/Tag:\s+e2e-upload-AGAIN/);
	});

	it("deploy 2nd worker version", async () => {
		const deploy = await runWrangler(
			`wrangler versions deploy ${versionId2}@100% --message "Deploy AGAIN via e2e test" --yes  --x-versions`,
			{ cwd: workerPath }
		);

		const deploymentsList = await runWrangler(
			`wrangler deployments list  --x-versions`,
			{ cwd: workerPath }
		);

		expect(normalize(deploy)).toMatchInlineSnapshot(`
			"╭ Deploy Worker Versions by splitting traffic between multiple versions
			│
			├ Fetching latest deployment
			│
			├ Your current deployment has 1 version(s):
			│
			│ (100%) 00000000-0000-0000-0000-000000000000
			│       Created:  TIMESTAMP
			│           Tag:  e2e-upload
			│       Message:  Upload via e2e test
			│
			├ Fetching deployable versions
			│
			├ Which version(s) do you want to deploy?
			├ 1 Worker Version(s) selected
			│
			├     Worker Version 1:  00000000-0000-0000-0000-000000000000
			│              Created:  TIMESTAMP
			│                  Tag:  e2e-upload-AGAIN
			│              Message:  Upload AGAIN via e2e test
			│
			├ What percentage of traffic should Worker Version 1 receive?
			├ 100% of traffic
			├
			├ Add a deployment message
			│ Deployment message Deploy AGAIN via e2e test
			│
			├ Deploying 1 version(s)
			│
			│ No non-versioned settings to sync. Skipping...
			│
			╰  SUCCESS  Deployed tmp-e2e-wrangler version 00000000-0000-0000-0000-000000000000 at 100% (TIMINGS)"
		`);

		// list 2 deployments (+ old deployment)
		expect(normalize(deploymentsList)).toMatchInlineSnapshot(`
			"Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Unknown (deployment)
			Message:     Deploy AGAIN via e2e test
			Version(s):  (100%) 00000000-0000-0000-0000-000000000000
			                 Created:  TIMESTAMP
			                     Tag:  e2e-upload-AGAIN
			                 Message:  Upload AGAIN via e2e test
			Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Unknown (deployment)
			Message:     Deploy via e2e test
			Version(s):  (100%) 00000000-0000-0000-0000-000000000000
			                 Created:  TIMESTAMP
			                     Tag:  e2e-upload
			                 Message:  Upload via e2e test
			Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Upload
			Message:     Automatic deployment on upload.
			Version(s):  (100%) 00000000-0000-0000-0000-000000000000
			                 Created:  TIMESTAMP
			                     Tag:  -
			                 Message:  -"
		`);

		expect(countOccurrences(deploymentsList, versionId0)).toBe(1); // once for regular deploy, only
		expect(countOccurrences(deploymentsList, versionId1)).toBe(1); // once for versions deploy, only
		expect(countOccurrences(deploymentsList, versionId2)).toBe(1); // once for versions deploy, only
	});

	it("rollback to implicit worker version (1st version)", async () => {
		const rollback = await runWrangler(
			`wrangler rollback --message "Rollback via e2e test" --yes  --x-versions`,
			{ cwd: workerPath }
		);

		const versionsList = await runWrangler(
			`wrangler versions list  --x-versions`,
			{ cwd: workerPath }
		);

		const deploymentsList = await runWrangler(
			`wrangler deployments list  --x-versions`,
			{ cwd: workerPath }
		);

		expect(normalize(rollback)).toMatchInlineSnapshot(`
			"├ Fetching latest deployment
			│
			├ Your current deployment has 1 version(s):
			│
			│ (100%) 00000000-0000-0000-0000-000000000000
			│       Created:  TIMESTAMP
			│           Tag:  e2e-upload-AGAIN
			│       Message:  Upload AGAIN via e2e test
			│
			├ Finding latest stable Worker Version to rollback to
			│
			│
			├ Please provide a message for this rollback (120 characters max, optional)?
			│ Message Rollback via e2e test
			│
			│
			├  WARNING  You are about to rollback to Worker Version 00000000-0000-0000-0000-000000000000.
			│ This will immediately replace the current deployment and become the active deployment across all your deployed triggers.
			│ However, your local development environment will not be affected by this rollback.
			│ Rolling back to a previous deployment will not rollback any of the bound resources (Durable Object, D1, R2, KV, etc).
			│
			│ (100%) 00000000-0000-0000-0000-000000000000
			│       Created:  TIMESTAMP
			│           Tag:  e2e-upload
			│       Message:  Upload via e2e test
			│
			├ Are you sure you want to deploy this Worker Version to 100% of traffic?
			│ yes Rollback
			│
			├ Performing rollback
			│
			│
			│
			╰  SUCCESS  Worker Version 00000000-0000-0000-0000-000000000000 has been deployed to 100% of traffic."
		`);

		expect(rollback).toContain(
			`Worker Version ${versionId1} has been deployed to 100% of traffic`
		);

		// list same versions as before (no new versions created)
		expect(normalize(versionsList)).toMatchInlineSnapshot(`
			"Version ID:  00000000-0000-0000-0000-000000000000
			Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Unknown (version_upload)
			Tag:         e2e-upload-AGAIN
			Message:     Upload AGAIN via e2e test
			Version ID:  00000000-0000-0000-0000-000000000000
			Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Unknown (version_upload)
			Tag:         e2e-upload
			Message:     Upload via e2e test
			Version ID:  00000000-0000-0000-0000-000000000000
			Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Upload
			Tag:         -
			Message:     -"
		`);

		// list deployments with new rollback deployment of 1st version (1 new deployment created)
		expect(normalize(deploymentsList)).toMatchInlineSnapshot(`
			"Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Unknown (deployment)
			Message:     Rollback via e2e test
			Version(s):  (100%) 00000000-0000-0000-0000-000000000000
			                 Created:  TIMESTAMP
			                     Tag:  e2e-upload
			                 Message:  Upload via e2e test
			Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Unknown (deployment)
			Message:     Deploy AGAIN via e2e test
			Version(s):  (100%) 00000000-0000-0000-0000-000000000000
			                 Created:  TIMESTAMP
			                     Tag:  e2e-upload-AGAIN
			                 Message:  Upload AGAIN via e2e test
			Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Unknown (deployment)
			Message:     Deploy via e2e test
			Version(s):  (100%) 00000000-0000-0000-0000-000000000000
			                 Created:  TIMESTAMP
			                     Tag:  e2e-upload
			                 Message:  Upload via e2e test
			Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Upload
			Message:     Automatic deployment on upload.
			Version(s):  (100%) 00000000-0000-0000-0000-000000000000
			                 Created:  TIMESTAMP
			                     Tag:  -
			                 Message:  -"
		`);

		expect(countOccurrences(deploymentsList, versionId0)).toBe(1); // once for regular deploy, only
		expect(countOccurrences(deploymentsList, versionId1)).toBe(2); // once for versions deploy, once for rollback
		expect(countOccurrences(deploymentsList, versionId2)).toBe(1); // once for versions deploy, only
	});

	it("rollback to specific worker version (0th version)", async () => {
		const rollback = await runWrangler(
			`wrangler rollback ${versionId0} --message "Rollback to old version" --yes  --x-versions`,
			{ cwd: workerPath }
		);

		const versionsList = await runWrangler(
			`wrangler versions list  --x-versions`,
			{ cwd: workerPath }
		);

		const deploymentsList = await runWrangler(
			`wrangler deployments list  --x-versions`,
			{ cwd: workerPath }
		);

		expect(normalize(rollback)).toMatchInlineSnapshot(`
			"├ Fetching latest deployment
			│
			├ Your current deployment has 1 version(s):
			│
			│ (100%) 00000000-0000-0000-0000-000000000000
			│       Created:  TIMESTAMP
			│           Tag:  e2e-upload
			│       Message:  Upload via e2e test
			│
			├ Please provide a message for this rollback (120 characters max, optional)?
			│ Message Rollback to old version
			│
			│
			├  WARNING  You are about to rollback to Worker Version 00000000-0000-0000-0000-000000000000.
			│ This will immediately replace the current deployment and become the active deployment across all your deployed triggers.
			│ However, your local development environment will not be affected by this rollback.
			│ Rolling back to a previous deployment will not rollback any of the bound resources (Durable Object, D1, R2, KV, etc).
			│
			│ (100%) 00000000-0000-0000-0000-000000000000
			│       Created:  TIMESTAMP
			│           Tag:  -
			│       Message:  -
			│
			├ Are you sure you want to deploy this Worker Version to 100% of traffic?
			│ yes Rollback
			│
			├ Performing rollback
			│
			│
			│
			╰  SUCCESS  Worker Version 00000000-0000-0000-0000-000000000000 has been deployed to 100% of traffic."
		`);

		expect(rollback).toContain(
			`Worker Version ${versionId0} has been deployed to 100% of traffic`
		);

		// list same versions as before (no new versions created)
		expect(normalize(versionsList)).toMatchInlineSnapshot(`
			"Version ID:  00000000-0000-0000-0000-000000000000
			Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Unknown (version_upload)
			Tag:         e2e-upload-AGAIN
			Message:     Upload AGAIN via e2e test
			Version ID:  00000000-0000-0000-0000-000000000000
			Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Unknown (version_upload)
			Tag:         e2e-upload
			Message:     Upload via e2e test
			Version ID:  00000000-0000-0000-0000-000000000000
			Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Upload
			Tag:         -
			Message:     -"
		`);

		// list deployments with new rollback deployment of 0th version (1 new deployment created)
		expect(normalize(deploymentsList)).toMatchInlineSnapshot(`
			"Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Unknown (deployment)
			Message:     Rollback to old version
			Version(s):  (100%) 00000000-0000-0000-0000-000000000000
			                 Created:  TIMESTAMP
			                     Tag:  -
			                 Message:  -
			Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Unknown (deployment)
			Message:     Rollback via e2e test
			Version(s):  (100%) 00000000-0000-0000-0000-000000000000
			                 Created:  TIMESTAMP
			                     Tag:  e2e-upload
			                 Message:  Upload via e2e test
			Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Unknown (deployment)
			Message:     Deploy AGAIN via e2e test
			Version(s):  (100%) 00000000-0000-0000-0000-000000000000
			                 Created:  TIMESTAMP
			                     Tag:  e2e-upload-AGAIN
			                 Message:  Upload AGAIN via e2e test
			Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Unknown (deployment)
			Message:     Deploy via e2e test
			Version(s):  (100%) 00000000-0000-0000-0000-000000000000
			                 Created:  TIMESTAMP
			                     Tag:  e2e-upload
			                 Message:  Upload via e2e test
			Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Upload
			Message:     Automatic deployment on upload.
			Version(s):  (100%) 00000000-0000-0000-0000-000000000000
			                 Created:  TIMESTAMP
			                     Tag:  -
			                 Message:  -"
		`);

		expect(countOccurrences(deploymentsList, versionId0)).toBe(2); // once for regular deploy, once for rollback
		expect(countOccurrences(deploymentsList, versionId1)).toBe(2); // once for versions deploy, once for rollback
		expect(countOccurrences(deploymentsList, versionId2)).toBe(1); // once for versions deploy, only
	});

	it("delete worker", async () => {
		const stdout = await runWrangler(`wrangler delete`, { cwd: workerPath });

		expect(normalize(stdout)).toMatchInlineSnapshot(`
			"? Are you sure you want to delete tmp-e2e-wrangler? This action cannot be undone.
			🤖 Using fallback value in non-interactive context: yes
			Successfully deleted tmp-e2e-wrangler"
		`);
	});
});
