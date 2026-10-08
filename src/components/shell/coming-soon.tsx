import { ConstructionIcon } from "lucide-react";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

/** Placeholder para seções que ainda serão definidas no roadmap. */
export function ComingSoon({ section }: { section: string }) {
  return (
    <Empty className="min-h-80 border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ConstructionIcon />
        </EmptyMedia>
        <EmptyTitle>Em construção</EmptyTitle>
        <EmptyDescription>
          A área de {section} será definida nas próximas etapas do roadmap.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
