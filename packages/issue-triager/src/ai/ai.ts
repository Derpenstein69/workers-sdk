import chalk from "chalk";
import { dedent } from "ts-dedent";
import type { Issue } from "../github/types";

const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CLOUDFLARE_API_KEY = process.env.CLOUDFLARE_API_KEY;
const MODEL = "@cf/meta/llama-3-8b-instruct";

export async function classifyIssue(issue: Issue): Promise<string | null> {
	const aiResponse = await fetchAIClassification(issue);

	if (!aiResponse) {
		return null;
	}

	const response = dedent`

        ${chalk.gray("====================")}
        ${chalk.gray(chalk.italic("ISSUE DETAILS"))}
        ${chalk.gray("====================")}

        Issue Number: ${issue.number}
        Link: ${chalk.underline(`https://github.com/cloudflare/workers-sdk/issues/${issue.number}`)}
        Title: ${issue.title}
        Labels: ${JSON.stringify(issue.labels)}
        Comment Count: ${issue.comments.length}

        ${chalk.gray("====================")}
        ${chalk.gray(chalk.italic("AI RESPONSE"))}
        ${chalk.gray("====================")}

        ${aiResponse}

        ${chalk.gray("====================")}

        `;

	return response;
}

export async function fetchAIClassification(issue: Issue) {
	const endpoint = buildEndpoint(CLOUDFLARE_ACCOUNT_ID as string, MODEL);

	const messages = [
		{
			role: "system",
			content: "Your job is to assist with classifying GitHub issues.",
		},
		{
			role: "user",
			content: buildPrompt(issue),
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

	const {
		result: { response },
	} = await res.json();

	return response as string;
}

function buildEndpoint(accountId: string, model: string) {
	return `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;
}

function buildPrompt(issue: Issue) {
	return dedent`
        Classify the following GitHub issue based on the given criteria:

        1. **Can we close this issue?**:
        - The issue has been waiting for a user response for over 1 month.
        - The issue is already solved.
        - Comments suggest it shouldn't be solved (if so, include a comment).

        2. **Should this go into the backlog of work?**:
        - Comments show it is something that can be done on our end.
        - The issue is obvious.
        - The issue has a reproduction.

        3. **Should we request a minimal reproduction from the user?**:
        - There is not enough information to determine whether or not it's a bug/issue.

        4. **Classify by severity and priority**:
        - Severity: Major, Minor, Trivial.
        - Priority: Critical, High, Medium, Low.

        Note that 1, 2, and 3, are mutually exclusive. It should either be closed, go into the backlog, or we should request a minimal reproduction.

        **Issue Details:**

        ${JSON.stringify(issue)}

        Based on these criteria, classify the issue and return the classification in the following format:

        Close issue: "Yes" | "No"
        Close reason: [string]
        Add to backlog: "Yes" | "No"
        Request reproduction: "Yes" | "No"
        Severity: "Major" | "Minor" | "Trivial"
        Priority: "Critical" | "High" | "Medium" | "Low"

        Then give your reasoning for each of those outputs.

        Do not put any text decoration in your response.
    `;
}
