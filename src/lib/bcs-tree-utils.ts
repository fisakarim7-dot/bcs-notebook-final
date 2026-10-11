import type { StudyNodeDTO, TreeNodeDTO } from "./bcs-types";

export interface TreeNodeWithChildren extends TreeNodeDTO {
  children: TreeNodeWithChildren[];
  depth: number;
}

export function buildTree(nodes: TreeNodeDTO[]): TreeNodeWithChildren[] {
  const byId = new Map<string, TreeNodeWithChildren>();
  nodes.forEach((n) => byId.set(n.id, { ...n, children: [], depth: 1 }));

  const roots: TreeNodeWithChildren[] = [];
  byId.forEach((node) => {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  const assignDepth = (list: TreeNodeWithChildren[], depth: number) => {
    list.forEach((n) => {
      n.depth = depth;
      assignDepth(n.children, depth + 1);
    });
  };
  assignDepth(roots, 1);
  return roots;
}

export function ancestorsOf(nodes: TreeNodeDTO[], id: string): string[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const chain: string[] = [];
  let cur = byId.get(id);
  while (cur?.parentId) {
    chain.unshift(cur.parentId);
    cur = byId.get(cur.parentId);
  }
  return chain;
}

export function namePathOf(nodes: TreeNodeDTO[], id: string): string[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const names: string[] = [];
  let cur = byId.get(id);
  while (cur) {
    names.unshift(cur.name);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return names;
}

export function countDescendants(
  nodes: TreeNodeDTO[],
  id: string
): { folders: number; notes: number } {
  const byParent = new Map<string, TreeNodeDTO[]>();
  nodes.forEach((n) => {
    if (!n.parentId) return;
    const arr = byParent.get(n.parentId) ?? [];
    arr.push(n);
    byParent.set(n.parentId, arr);
  });

  let folders = 0;
  let notes = 0;
  let frontier = [id];
  while (frontier.length) {
    const kids = frontier.flatMap((pid) => byParent.get(pid) ?? []);
    kids.forEach((k) => (k.type === "note" ? notes++ : folders++));
    frontier = kids.map((k) => k.id);
  }
  return { folders, notes };
}

/** Breadcrumb "Subject / Level / …" for the INDEPENDENT study tree. */
export function studyNodePathOf(
  nodes: StudyNodeDTO[],
  id: string | null | undefined
): string | null {
  if (!id) return null;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const names: string[] = [];
  let cur = byId.get(id);
  while (cur) {
    names.unshift(cur.name);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return names.length ? names.join(" / ") : null;
}
