import "dotenv/config";
import { fetchUntriagedItems } from "./github";

fetchUntriagedItems("cloudflare", "workers-sdk")
	.then((items) => {
		console.log(items);
	})
	.catch((e) => {
		console.error("Error:", e);
		process.exit(1);
	});
