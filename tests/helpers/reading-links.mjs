export function withoutCode(text) {
  let fence;
  return text.split("\n").filter(line => {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line);
    if (marker) {
      if (!fence) fence = marker[1][0];
      else if (marker[1][0] === fence) fence = undefined;
      return false;
    }
    return !fence;
  }).join("\n").replace(/`[^`\n]*`/g, "");
}

export function readingLinks(text) {
  const content = withoutCode(text);
  return [
    ...[...content.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)].map(match => ({ href: match[1], kind: "markdown" })),
    ...[...content.matchAll(/\bhref="([^"]+)"/g)].map(match => ({ href: match[1], kind: "html" })),
  ];
}
