import { collectHeadings } from "./course-coverage.mjs";

export const rpcReadingDestinations = [
  { id: "choice", path: "docs/03-GUIDED-RPC-AND-GRPC.md", anchor: "rpc-choice" },
  { id: "wire", path: "docs/lessons/GRPC-PROTOBUF-AND-EVOLUTION.md" },
  { id: "lifecycle", path: "docs/lessons/GRPC-LIFECYCLE-AND-OPERATIONS.md" },
];

export function mapRpcHeadings(markdown) {
  let family = "choice";
  return collectHeadings(markdown).map(heading => {
    const title = heading.text;
    if (/Before RPC|What is RPC|REST vs RPC|REST vs GraphQL|Good Fit|Not Be Ideal|Should You|Senior-Level|Most Important/.test(title)) {
      family = "choice";
    } else if (/Service Contract|Code Generation|Stub|Proto|HTTP\/[12]|Fast|Field Number|\.proto/.test(title)) {
      family = "wire";
    } else if (/Hidden Challenge|Lifecycle|Types of gRPC|Unary|Streaming|WebSocket|Failure|Deadline|Retries|Balancing|Observability|Architecture|Microservices|Learning Platform/.test(title)) {
      family = "lifecycle";
    }
    const destination = rpcReadingDestinations.find(item => item.id === family);
    return {
      ...heading,
      family,
      source: "docs/03-RPC-AND-GRPC.md",
      recommended: destination.path,
      ...(destination.anchor ? { anchor: destination.anchor } : {}),
    };
  });
}
