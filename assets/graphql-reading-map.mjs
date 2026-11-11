import { collectHeadings } from "./course-coverage.mjs";

export const graphqlReadingDestinations = [
  { id: "choice", path: "docs/02-GUIDED-GRAPHQL.md", anchor: "graphql-choice" },
  { id: "schema", path: "docs/02-GUIDED-GRAPHQL.md", anchor: "graphql-schema" },
  { id: "query", path: "docs/02-GUIDED-GRAPHQL.md", anchor: "graphql-query" },
  { id: "mutation", path: "docs/02-GUIDED-GRAPHQL.md", anchor: "graphql-mutation" },
  { id: "execution", path: "docs/lessons/GRAPHQL-EXECUTION-AND-BATCHING.md" },
  { id: "cost", path: "docs/lessons/GRAPHQL-COST-CACHING-AND-EVOLUTION.md" },
];

export function mapGraphqlHeadings(markdown) {
  let family = "choice";
  return collectHeadings(markdown).map(heading => {
    if (heading.level <= 2) {
      const title = heading.text;
      if (/Part 1|What Exactly|REST vs GraphQL/.test(title)) family = "choice";
      else if (/Schema/.test(title)) family = "schema";
      else if (/GraphQL Query/.test(title)) family = "query";
      else if (/Mutation/.test(title)) family = "mutation";
      else if (/Architecture|Resolver|Hidden Problem|DataLoader/.test(title) && !/Production/.test(title)) family = "execution";
      else if (/Part 2|Next Lesson|Depth|Complexity|Caching|Security|Federation|Production/.test(title)) family = "cost";
    }
    const destination = graphqlReadingDestinations.find(item => item.id === family);
    return {
      ...heading,
      family,
      source: "docs/02-GRAPHQL.md",
      recommended: destination.path,
      ...(destination.anchor ? { anchor: destination.anchor } : {}),
    };
  });
}
