"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { findPath } from "fumadocs-core/page-tree";
import type * as PageTree from "fumadocs-core/page-tree";
import { ChevronDownIcon, DocumentIcon } from "@/components/icons";

function activeFolderIds(tree: PageTree.Root, pathname: string): Set<string> {
  const path = findPath(tree.children, (node) => node.type === "page" && node.url === pathname);
  const ids = new Set<string>();
  path?.forEach((node) => {
    if (node.type === "folder" && node.$id) ids.add(node.$id);
  });
  return ids;
}

export function DocsNavTree({ tree, collapsed }: { tree: PageTree.Root; collapsed: boolean }) {
  const pathname = usePathname();
  const isActive = pathname === "/documentation" || pathname.startsWith("/documentation/");
  const [open, setOpen] = useState(isActive);
  const [openFolders, setOpenFolders] = useState<Set<string>>(() => activeFolderIds(tree, pathname));

  useEffect(() => {
    if (isActive) {
      setOpen(true);
      setOpenFolders((prev) => new Set([...prev, ...activeFolderIds(tree, pathname)]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (collapsed) {
    return (
      <Link
        href="/documentation"
        title="Documentation"
        className={`flex items-center justify-center px-0 py-2 w-full rounded-md text-sm transition-colors ${
          isActive
            ? "bg-mar-accent/10 text-mar-accent font-medium dark:bg-white/10 dark:text-white"
            : "text-gray-500 hover:text-gray-800 hover:bg-mar-border dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-white/5"
        }`}
      >
        <DocumentIcon size={15} />
      </Link>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-md text-sm transition-colors ${
          isActive
            ? "bg-mar-accent/10 text-mar-accent font-medium dark:bg-white/10 dark:text-white"
            : "text-gray-500 hover:text-gray-800 hover:bg-mar-border dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-white/5"
        }`}
      >
        <span className={`shrink-0 ${isActive ? "text-mar-accent" : "text-gray-400 dark:text-gray-500"}`}>
          <DocumentIcon size={15} />
        </span>
        <span className="flex-1 text-left whitespace-nowrap">Documentation</span>
        <ChevronDownIcon size={12} className={`shrink-0 transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>

      {open && (
        <ul className="mt-0.5 ml-4 border-l border-mar-border pl-2 space-y-0.5">
          {tree.children.map((node, i) => (
            <TreeNode
              key={node.$id ?? i}
              node={node}
              pathname={pathname}
              openFolders={openFolders}
              onToggleFolder={(id) =>
                setOpenFolders((prev) => {
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                })
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function TreeNode({
  node,
  pathname,
  openFolders,
  onToggleFolder,
}: {
  node: PageTree.Node;
  pathname: string;
  openFolders: Set<string>;
  onToggleFolder: (id: string) => void;
}) {
  if (node.type === "separator") {
    return (
      <li className="pt-2 pb-1 px-1 text-[10px] font-semibold uppercase tracking-widest text-gray-400 whitespace-nowrap first:pt-0">
        {node.name}
      </li>
    );
  }

  if (node.type === "page") {
    const active = pathname === node.url;
    return (
      <li>
        <Link
          href={node.url}
          className={`block px-2 py-1.5 rounded-md text-xs whitespace-nowrap truncate transition-colors ${
            active
              ? "text-mar-accent font-medium bg-mar-accent/10"
              : "text-gray-500 hover:text-gray-800 hover:bg-mar-border dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-white/5"
          }`}
        >
          {node.name}
        </Link>
      </li>
    );
  }

  // Folder
  const id = node.$id ?? String(node.name);
  const isOpen = openFolders.has(id);
  return (
    <li>
      <button
        type="button"
        onClick={() => onToggleFolder(id)}
        className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md text-xs text-gray-600 dark:text-gray-300 hover:bg-mar-border dark:hover:bg-white/5 transition-colors whitespace-nowrap"
      >
        <ChevronDownIcon size={10} className={`shrink-0 transition-transform ${isOpen ? "" : "-rotate-90"}`} />
        <span className="truncate">{node.name}</span>
      </button>
      {isOpen && (
        <ul className="ml-3 border-l border-mar-border pl-2 space-y-0.5">
          {node.children.map((child, i) => (
            <TreeNode
              key={child.$id ?? i}
              node={child}
              pathname={pathname}
              openFolders={openFolders}
              onToggleFolder={onToggleFolder}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
