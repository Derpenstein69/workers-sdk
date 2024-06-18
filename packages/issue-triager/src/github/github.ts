import { isNodeWithContent, isUntriaged, toFormattedItem } from "../helpers";
import { Issue, IssuesResponse, ProjectIdResponse } from "./types";

const GITHUB_TOKEN = process.env.GITHUB_API_TOKEN;
const GRAPHQL_ENDPOINT = "https://api.github.com/graphql";

export async function fetchUntriagedItems(projectId: string): Promise<Issue[]> {
	let cursor: string | null = null;
	let hasNextPage = true;
	const allItems: Issue[] = [];

	while (hasNextPage) {
		const response = await fetchIssues(projectId, cursor);

		const filteredResults = response.data.node.items.nodes
			.filter(isNodeWithContent)
			.filter(isUntriaged)
			.map(toFormattedItem);

		allItems.push(...filteredResults);

		cursor = response.data.node.items.pageInfo.endCursor;
		hasNextPage = response.data.node.items.pageInfo.hasNextPage;
	}

	return allItems;
}

export async function fetchProjectId(
	owner: string,
	projectName: string
): Promise<string> {
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

	const response = (await fetchGraphQlResponse(query)) as ProjectIdResponse;

	if (!response.data || !response.data.organization) {
		console.error("Error: Invalid response data structure");
		process.exit(1);
	}

	const project = response.data.organization.projectsV2.nodes.find(
		(node) => node.title === projectName
	);

	if (!project) {
		console.error(
			`Error: Project "${projectName}" not found for owner "${owner}".`
		);
		process.exit(1);
	}

	return project.id;
}

export async function fetchIssues(
	projectId: string,
	cursor: string | null
): Promise<IssuesResponse> {
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
                  comments(first: 100) {
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

	return (await fetchGraphQlResponse(query)) as IssuesResponse;
}

export async function fetchGraphQlResponse(query: string) {
	const response = await fetch(GRAPHQL_ENDPOINT, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${GITHUB_TOKEN}`,
		},
		body: JSON.stringify({ query }),
	});

	return await response.json();
}
