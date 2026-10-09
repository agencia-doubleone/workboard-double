"use client";

import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";

const HEX = /^#[0-9a-f]{6}$/i;

/** Campo de cor: quadrado que abre o seletor do sistema + o código hex (#rrggbb). */
export function ColorField({
  id,
  value,
  onChange,
  invalid,
  disabled,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  disabled?: boolean;
}) {
  const valid = HEX.test(value);
  return (
    <InputGroup>
      <InputGroupAddon>
        <label className="relative block size-6 cursor-pointer overflow-hidden rounded-[calc(var(--radius)-3px)] border">
          <span className="absolute inset-0" style={{ backgroundColor: valid ? value : "transparent" }} />
          <input
            type="color"
            value={valid ? value : "#000000"}
            onChange={(event) => onChange(event.target.value)}
            disabled={disabled}
            aria-label="Escolher cor"
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
        </label>
      </InputGroupAddon>
      <InputGroupInput
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value.trim())}
        maxLength={7}
        spellCheck={false}
        autoComplete="off"
        aria-invalid={invalid || !valid}
        disabled={disabled}
        className="font-mono"
      />
    </InputGroup>
  );
}
