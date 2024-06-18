import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { generateResourceName } from "./helpers/generate-resource-name";
import { normalizeOutput } from "./helpers/normalize";
import { makeRoot, seed } from "./helpers/setup";
import { runWrangler } from "./helpers/wrangler";

describe("r2", () => {
	let bucketName: string;
	let fileContents: string;
	let normalize: (str: string) => string;
	let root: string;

	beforeAll(async () => {
		root = await makeRoot();
		bucketName = generateResourceName("r2");
		normalize = (str) =>
			normalizeOutput(str, {
				[bucketName]: "tmp-e2e-r2",
				[process.env.CLOUDFLARE_ACCOUNT_ID as string]: "CLOUDFLARE_ACCOUNT_ID",
			});
		fileContents = crypto.randomBytes(64).toString("hex");
	});

	it("create bucket", async () => {
		const output = await runWrangler(`wrangler r2 bucket create ${bucketName}`);

		expect(normalize(output)).toMatchInlineSnapshot(`
			"Creating bucket tmp-e2e-r2-00000000-0000-0000-0000-000000000000 with default storage class set to Standard.
			Created bucket tmp-e2e-r2-00000000-0000-0000-0000-000000000000 with default storage class set to Standard."
		`);
	});

	it("create object", async () => {
		await seed(root, {
			"test-r2.txt": fileContents,
		});
		const output = await runWrangler(
			`wrangler r2 object put ${bucketName}/testr2 --file test-r2.txt --content-type text/html`,
			{ cwd: root }
		);
		expect(normalize(output)).toMatchInlineSnapshot(`
			"Creating object "testr2" in bucket "tmp-e2e-r2-00000000-0000-0000-0000-000000000000".
			Upload complete."
		`);
	});

	it("download object", async () => {
		const output = await runWrangler(
			`wrangler r2 object get ${bucketName}/testr2 --file test-r2o.txt`,
			{ cwd: root }
		);
		expect(normalize(output)).toMatchInlineSnapshot(`
			"Downloading "testr2" from "tmp-e2e-r2-00000000-0000-0000-0000-000000000000".
			Download complete."
		`);
		const file = await readFile(path.join(root, "test-r2o.txt"), "utf8");
		expect(file).toBe(fileContents);
	});

	it("delete object", async () => {
		const output = await runWrangler(
			`wrangler r2 object delete ${bucketName}/testr2`
		);
		expect(normalize(output)).toMatchInlineSnapshot(`
			"Deleting object "testr2" from bucket "tmp-e2e-r2-00000000-0000-0000-0000-000000000000".
			Delete complete."
		`);
	});

	it("check object deleted", async () => {
		const output = await runWrangler(
			`wrangler r2 object get ${bucketName}/testr2 --file test-r2o.txt`,
			{ cwd: root }
		);
		expect(output).toContain("The specified key does not exist");
	});

	it("delete bucket", async () => {
		const output = await runWrangler(`wrangler r2 bucket delete ${bucketName}`);
		expect(normalize(output)).toMatchInlineSnapshot(`
			"Deleting bucket tmp-e2e-r2-00000000-0000-0000-0000-000000000000.
			Deleted bucket tmp-e2e-r2-00000000-0000-0000-0000-000000000000."
		`);
	});

	it("check bucket deleted", async () => {
		await seed(root, {
			"test-r2.txt": fileContents,
		});
		const output = await runWrangler(
			`wrangler r2 object put ${bucketName}/testr2 --file test-r2.txt --content-type text/html`,
			{ cwd: root }
		);
		expect(output).toContain("The specified bucket does not exist");
	});
});
