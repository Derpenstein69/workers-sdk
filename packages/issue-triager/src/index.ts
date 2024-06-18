import "dotenv/config";
import { classifyIssue } from "./ai/ai";
// import { fetchProjectId, fetchUntriagedItems } from "./github/github";
import { Issue } from "./github/types";

main();

async function main() {
	try {
		// const projectId = await fetchProjectId("cloudflare", "workers-sdk");
		// const issues = await fetchUntriagedItems(projectId);

		// console.log(issues);
		// const classification = await classifyIssue(issues[0]);
		const classification = await classifyIssue({
			title: "bug",
			body: "this is definitely a bug, and I'm angry about it",
		} as Issue);

		console.log(classification);
	} catch (e) {
		console.error("Error:", e);
		process.exit(1);
	}
}
