export type ProjectIdResponse = {
	data: {
		organization: {
			projectsV2: {
				nodes: {
					id: string;
					title: string;
				}[];
			};
		};
	};
};

export type Item = {
	title: string;
	number: number;
	url: string;
	body: string;
	labels: string[];
	assignees: string[];
	comments: {
		body: string;
		author: string;
		createdAt: string;
	}[];
	status: string;
};

export type IssuesResponse = {
	data: {
		node: {
			items: {
				pageInfo: {
					endCursor: string;
					hasNextPage: boolean;
				};
				nodes: Node[];
			};
		};
	};
};

export type Node = {
	fieldValues: {
		nodes: {
			field?: {
				name: string;
			};
			name?: string;
		}[];
	};
	content?: Content;
};

export type NodeWithContent = Node & {
	content: Content;
};

type Content = {
	title: string;
	number: number;
	url: string;
	body: string;
	labels: {
		nodes: {
			name: string;
		}[];
	};
	assignees: {
		nodes: {
			login: string;
		}[];
	};
	comments: {
		nodes: {
			body: string;
			author?: {
				login: string;
			};
			createdAt: string;
		}[];
	};
};
