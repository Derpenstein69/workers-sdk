import "dotenv/config";
import { fetchProjectId, fetchUntriagedItems } from "./github/github";

main();

async function main() {
	try {
		const projectId = await fetchProjectId("cloudflare", "workers-sdk");
		const items = await fetchUntriagedItems(projectId);

		console.log(items);
	} catch (e) {
		console.error("Error:", e);
		process.exit(1);
	}
}
