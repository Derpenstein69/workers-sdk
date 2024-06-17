import { graphql } from "@octokit/graphql";

// Define interfaces for the GraphQL responses
interface ProjectResponse {
	data: {
		organization: {
			projectsV2: {
				nodes: Array<{ id: string; title: string }>;
			};
		};
	};
}

interface IssueResponse {
	data: {
		node: {
			items: {
				pageInfo: {
					endCursor: string;
					hasNextPage: boolean;
				};
				nodes: Array<{
					id: string;
					fieldValues: {
						nodes: Array<{
							name?: string;
							text?: string;
							field: { name: string };
						}>;
					};
					content: {
						title: string;
						number: number;
						url: string;
						body: string;
						labels: { nodes: Array<{ name: string }> };
						assignees: { nodes: Array<{ login: string }> };
						comments: {
							nodes: Array<{
								body: string;
								author: { login: string };
								createdAt: string;
							}>;
						};
					};
				}>;
			};
		};
	};
}

// Fetch the GitHub token from environment variables
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

if (!GITHUB_TOKEN) {
	console.error("GITHUB_TOKEN environment variable is required.");
	process.exit(1);
}

// Ensure the script is called with two arguments
if (process.argv.length !== 4) {
	console.error("Usage: ts-node triagist.ts <owner> <project-name>");
	process.exit(1);
}

const [owner, projectName] = process.argv.slice(2);

main();

async function fetchProjectId(owner: string): Promise<string> {
	const query = `
    {
      organization(login: "${owner}") {
        projectsV2(first: 100) {
          nodes {
            id
            title
          }
        }
      }
    }
  `;

	const response = await graphql<ProjectResponse>(query, {
		headers: {
			authorization: `token ${GITHUB_TOKEN}`,
		},
	});

	const project = response.data.organization.projectsV2.nodes.find(
		(node) => node.title === projectName
	);

	if (!project) {
		throw new Error(`Project "${projectName}" not found for owner "${owner}".`);
	}

	return project.id;
}

async function fetchIssues(
	projectId: string,
	cursor: string | null
): Promise<IssueResponse> {
	const cursorParam = cursor ? `, after: "${cursor}"` : "";
	const query = `
    query {
      node(id: "${projectId}") {
        ... on ProjectV2 {
          items(first: 100 ${cursorParam}) {
            pageInfo {
              endCursor
              hasNextPage
            }
            nodes {
              id
              fieldValues(first: 100) {
                nodes {
                  ... on ProjectV2ItemFieldSingleSelectValue {
                    name
                    field {
                      ... on ProjectV2SingleSelectField {
                        name
                      }
                    }
                  }
                  ... on ProjectV2ItemFieldTextValue {
                    text
                    field {
                      ... on ProjectV2FieldCommon {
                        name
                      }
                    }
                  }
                }
              }
              content {
                ... on Issue {
                  title
                  number
                  url
                  body
                  labels(first: 10) {
                    nodes {
                      name
                    }
                  }
                  assignees(first: 10) {
                    nodes {
                      login
                    }
                  }
                  comments(first: 10) {
                    nodes {
                      body
                      author {
                        login
                      }
                      createdAt
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

	const response = await graphql<IssueResponse>(query, {
		headers: {
			authorization: `token ${GITHUB_TOKEN}`,
		},
	});

	return response;
}

async function main() {
	try {
		const projectId = await fetchProjectId(owner);
		let cursor: string | null = null;
		let hasNextPage = true;

		while (hasNextPage) {
			const response = await fetchIssues(projectId, cursor);
			const items = response.data.node.items.nodes;

			items.forEach((item) => {
				const issue = item.content;
				const statusField = item.fieldValues.nodes.find(
					(field) => field.field.name === "Status"
				);
				const status = statusField ? statusField.name : "Unknown";

				console.log({
					title: issue.title,
					number: issue.number,
					url: issue.url,
					body: issue.body,
					labels: issue.labels.nodes.map((label) => label.name),
					assignees: issue.assignees.nodes.map((assignee) => assignee.login),
					comments: issue.comments.nodes.map((comment) => ({
						body: comment.body,
						author: comment.author.login,
						createdAt: comment.createdAt,
					})),
					status,
				});
			});

			cursor = response.data.node.items.pageInfo.endCursor;
			hasNextPage = response.data.node.items.pageInfo.hasNextPage;
		}
	} catch (error) {
		console.error("Error:", error);
	}
}
