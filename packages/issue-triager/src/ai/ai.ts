import type { Issue } from "../github/types";

const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CLOUDFLARE_API_KEY = process.env.CLOUDFLARE_API_KEY;

console.log(CLOUDFLARE_API_KEY);

export async function classifyIssue(item: Issue) {
	const endpoint = buildEndpoint(
		CLOUDFLARE_ACCOUNT_ID as string,
		"@cf/meta/llama-3-8b-instruct"
	);

	const messages = [
		{
			role: "system",
			content: "Your job is to assist with classifying GitHub issues.",
		},
		{
			role: "user",
			content: `Please classify this issue: ${JSON.stringify(item)}`,
		},
	];

	const res = await fetch(endpoint, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${CLOUDFLARE_API_KEY}`,
		},
		body: JSON.stringify({ messages }),
	});

	return await res.json();
}

function buildEndpoint(accountId: string, model: string) {
	return `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;
}
