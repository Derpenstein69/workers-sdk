#!/bin/bash

# Ensure the script is called with two arguments
if [ "$#" -ne 2 ]; then
  echo "Usage: $0 <owner> <project-name>"
  exit 1
fi

# Assign arguments to variables
OWNER=$1
PROJECT_NAME=$2

# Fetch project ID
fetch_project_id() {
  gh api graphql -f query="
  {
    organization(login: \"$OWNER\") {
      projectsV2(first: 100) {
        nodes {
          id
          title
        }
      }
    }
  }"
}

# Get the project ID
project_response=$(fetch_project_id)
PROJECT_ID=$(echo "$project_response" | jq -r ".data.organization.projectsV2.nodes[] | select(.title == \"$PROJECT_NAME\") | .id")

# Ensure a valid project ID is obtained
if [ -z "$PROJECT_ID" ]; then
  echo "Error: Project \"$PROJECT_NAME\" not found for owner \"$OWNER\"."
  exit 1
fi

# Initialize cursor and hasNextPage
cursor=null
hasNextPage=true

# Function to fetch issues with Untriaged status
fetch_issues() {
  local cursor_param=""
  if [ "$cursor" != "null" ]; then
    cursor_param=", after: \"$cursor\""
  fi

  gh api graphql -f query="
  query {
    node(id: \"$PROJECT_ID\") {
      ... on ProjectV2 {
        items(first: 100 $cursor_param) {
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
  }"
}

# Loop through pages and collect results
all_results=""
while [ "$hasNextPage" == "true" ]; do
  response=$(fetch_issues)

  # Filter and append results
  filtered=$(echo "$response" | jq '
    .data.node.items.nodes[]
    | select(.content != null and .content.title != null and .content.number != null and .content.url != null)
    | {
        title: .content.title,
        number: .content.number,
        url: .content.url,
        body: .content.body,
        labels: (.content.labels.nodes | map(.name)),
        assignees: (.content.assignees.nodes | map(.login)),
        comments: (.content.comments.nodes | map({body, author: .author.login, createdAt})),
        status: (.fieldValues.nodes[] | select(.field.name == "Status").name)
      }
    | select(.status == "Untriaged")
  ')

  all_results="$all_results$filtered"

  # Update cursor and hasNextPage for next iteration
  cursor=$(echo "$response" | jq -r '.data.node.items.pageInfo.endCursor')
  hasNextPage=$(echo "$response" | jq -r '.data.node.items.pageInfo.hasNextPage')
done

# Output all results
echo "$all_results" | jq -s .
