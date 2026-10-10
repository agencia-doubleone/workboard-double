"use client";

import { SearchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WHITEBOARD_SCOPES, type WhiteboardScope } from "@/lib/whiteboards";
import { WHITEBOARD_SCOPE_LABELS, whiteboardsHref, type WhiteboardsParams } from "./params";

export function WhiteboardsToolbar({ params }: { params: WhiteboardsParams }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [query, setQuery] = useState(params.busca ?? "");
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Qualquer mudança de filtro volta para a primeira página.
  function navigate(next: Partial<WhiteboardsParams>) {
    startTransition(() => {
      router.replace(whiteboardsHref({ ...params, ...next, pagina: 1 }), { scroll: false });
    });
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <InputGroup className="sm:max-w-xs">
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          value={query}
          onChange={(event) => {
            const value = event.target.value;
            setQuery(value);
            clearTimeout(searchTimer.current);
            searchTimer.current = setTimeout(() => navigate({ busca: value.trim() || undefined }), 300);
          }}
          placeholder="Buscar pelo nome ou trabalho"
          aria-label="Buscar quadros"
        />
      </InputGroup>
      <Select
        items={WHITEBOARD_SCOPE_LABELS}
        value={params.escopo ?? "todos"}
        onValueChange={(value) =>
          navigate({ escopo: WHITEBOARD_SCOPES.includes(value as WhiteboardScope) ? (value as WhiteboardScope) : undefined })
        }
      >
        <SelectTrigger className="sm:w-56" aria-label="Quais quadros">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {WHITEBOARD_SCOPES.map((scope) => (
            <SelectItem key={scope} value={scope}>
              {WHITEBOARD_SCOPE_LABELS[scope]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
