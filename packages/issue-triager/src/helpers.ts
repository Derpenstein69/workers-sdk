import { Item, Node, NodeWithContent } from "./types";

export function isUntriaged(node: NodeWithContent) {
	return (
		node.fieldValues.nodes.find((field) => field.field?.name === "Status")
			?.name === "Untriaged"
	);
}

export function toFormattedItem(node: NodeWithContent): Item {
	return {
		title: node.content.title,
		number: node.content.number,
		url: node.content.url,
		body: node.content.body,
		labels: node.content.labels.nodes.map((label) => label.name),
		assignees: node.content.assignees.nodes.map((assignee) => assignee.login),
		comments: node.content.comments.nodes.map((comment) => ({
			body: comment.body,
			author: comment.author?.login || "Unknown",
			createdAt: comment.createdAt,
		})),
		status:
			node.fieldValues.nodes.find((field) => field.field?.name === "Status")
				?.name || "Unknown",
	};
}

export function isNodeWithContent(node: Node): node is NodeWithContent {
	return Boolean(
		node.content &&
			node.content.title &&
			node.content.number &&
			node.content.url
	);
}
