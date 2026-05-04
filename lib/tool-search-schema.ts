export type ToolSearchRecord = {
  toolId: string;
  toolName: string;
  toolUrl: string;
  categoryId: string;
  categoryTitle: string;
  description: string;
  keywords: string[];
  searchText: string;
  popularityWeight: number;
  updatedAt: string;
};

export type ToolSearchManifest = {
  version: string;
  generatedAt: string;
  source: string;
  recordCount: number;
  records: ToolSearchRecord[];
};

export function buildSearchText(record: Pick<ToolSearchRecord, "toolName" | "categoryTitle" | "description" | "keywords">): string {
  return [
    record.toolName,
    record.categoryTitle,
    record.description,
    record.keywords.join(" "),
  ]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
