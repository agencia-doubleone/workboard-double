"use client";

import { Table, TableBody, TableCell, TableFrame, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { POST_KINDS, SOCIAL_NETWORKS } from "@/lib/planning";
import { KIND_ICONS, NetworkIcon } from "./planning-icons";
import type { PlanningPostView } from "./types";

// A lista compacta do mês como o cliente vê (a aba Lista de ClientPlanningMonth).

/** A lista compacta: data, rede, tipo, headline e a situação, para achar rápido o que falta. */
export function PlanningPostList({
  posts,
  renderStatus,
}: {
  posts: PlanningPostView[];
  renderStatus?: (post: PlanningPostView) => React.ReactNode;
}) {
  return (
    <TableFrame>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-24">Data</TableHead>
            <TableHead className="w-36">Formato</TableHead>
            <TableHead>Headline</TableHead>
            <TableHead className="w-40">Situação</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {posts.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                Nenhum post neste mês.
              </TableCell>
            </TableRow>
          )}
          {posts.map((post) => {
            const KindIcon = KIND_ICONS[post.kind];
            const art = post.art.filter((item) => item.role === "art").length;
            return (
              <TableRow key={post.id}>
                <TableCell className="tabular-nums">{post.dateLabel ?? <span className="text-muted-foreground">Sem data</span>}</TableCell>
                <TableCell>
                  <span className="flex items-center gap-2 text-muted-foreground">
                    {post.network && (
                      <span className="flex" title={SOCIAL_NETWORKS[post.network]}>
                        <NetworkIcon network={post.network} />
                      </span>
                    )}
                    <KindIcon className="size-3.5" />
                    {POST_KINDS[post.kind].label}
                  </span>
                </TableCell>
                <TableCell className="max-w-0">
                  <span className="block truncate font-medium">{post.headline || "Sem headline"}</span>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {renderStatus
                    ? renderStatus(post)
                    : post.stage === "arte"
                      ? `Arte · ${art} ${art === 1 ? "arquivo" : "arquivos"}`
                      : "Pauta"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableFrame>
  );
}
