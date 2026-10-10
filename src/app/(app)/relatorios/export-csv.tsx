"use client";

import { DownloadIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Baixa uma tabela como CSV para o Excel em português: separador ";" e marca
 * de UTF-8 no começo (senão os acentos saem quebrados).
 */
export function ExportCsvButton({ filename, rows }: { filename: string; rows: (string | number)[][] }) {
  function download() {
    const escape = (value: string | number) => {
      const text = String(value);
      return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const csv = rows.map((row) => row.map(escape).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filename}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button variant="outline" size="sm" onClick={download} disabled={rows.length <= 1}>
      <DownloadIcon data-icon="inline-start" />
      Exportar CSV
    </Button>
  );
}
