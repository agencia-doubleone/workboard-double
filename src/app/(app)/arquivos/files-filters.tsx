"use client";

import { Loader2Icon, SearchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MEDIA_FOLDER_LABELS, MEDIA_FOLDERS, type MediaFolder } from "@/lib/media";
import { FILE_SITUATIONS, filesHref, type FileSituation, type FilesParams } from "./params";

const ALL = "all";

export function FilesFilters({ params }: { params: FilesParams }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState(params.busca ?? "");
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Qualquer mudança de filtro volta para a primeira página.
  function navigate(next: Partial<FilesParams>) {
    startTransition(() => {
      router.replace(filesHref({ ...params, ...next, pagina: 1 }), { scroll: false });
    });
  }

  const folderItems = { [ALL]: "Todas as pastas", ...MEDIA_FOLDER_LABELS };
  const situationItems = { [ALL]: "Todas as situações", ...FILE_SITUATIONS };
  const hasFilters = Boolean(params.busca || params.pasta || params.situacao);

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
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
          placeholder="Buscar pelo nome do arquivo"
          aria-label="Buscar arquivos"
        />
      </InputGroup>

      <Select
        items={folderItems}
        value={params.pasta ?? ALL}
        onValueChange={(value) =>
          navigate({ pasta: MEDIA_FOLDERS.includes(value as MediaFolder) ? (value as MediaFolder) : undefined })
        }
      >
        <SelectTrigger className="sm:w-44" aria-label="Filtrar por pasta">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(folderItems).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        items={situationItems}
        value={params.situacao ?? ALL}
        onValueChange={(value) =>
          navigate({ situacao: value && value in FILE_SITUATIONS ? (value as FileSituation) : undefined })
        }
      >
        <SelectTrigger className="sm:w-48" aria-label="Filtrar por situação">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(situationItems).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setQuery("");
            navigate({ busca: undefined, pasta: undefined, situacao: undefined });
          }}
        >
          Limpar filtros
        </Button>
      )}
      {isPending && <Loader2Icon className="size-4 animate-spin text-muted-foreground" aria-label="Carregando" />}
    </div>
  );
}
