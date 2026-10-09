"use client";

import { CheckIcon, CopyIcon, EyeIcon, EyeOffIcon, RefreshCwIcon } from "lucide-react";
import { useState } from "react";

import { Hint } from "@/components/hint";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { generatePassword } from "@/lib/password";

type PasswordFieldProps = {
  id: string;
  name?: string;
  value: string;
  onChange?: (value: string) => void;
  invalid?: boolean;
  disabled?: boolean;
  /** Mostra os botões de gerar e copiar (para o admin definir senhas). */
  generator?: boolean;
  /** Só exibe a senha (visível) com botão de copiar. */
  readOnly?: boolean;
  placeholder?: string;
  autoComplete?: string;
};

export function PasswordField({
  id,
  name,
  value,
  onChange,
  invalid,
  disabled,
  generator,
  readOnly,
  placeholder,
  autoComplete = "new-password",
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(readOnly ?? false);
  const [copied, setCopied] = useState(false);
  const copyable = generator || readOnly;

  async function handleCopy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <InputGroup>
      <InputGroupInput
        id={id}
        name={name}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        aria-invalid={invalid}
        disabled={disabled}
        readOnly={readOnly}
        placeholder={placeholder}
        autoComplete={autoComplete}
        spellCheck={false}
        className="font-mono"
      />
      <InputGroupAddon align="inline-end">
        {!readOnly && (
          <Hint label={visible ? "Ocultar" : "Mostrar"}>
            <InputGroupButton
              size="icon-xs"
              onClick={() => setVisible((v) => !v)}
              disabled={disabled}
              aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
            >
              {visible ? <EyeOffIcon /> : <EyeIcon />}
            </InputGroupButton>
          </Hint>
        )}
        {generator && !readOnly && (
          <Hint label="Gerar senha forte">
            <InputGroupButton
              size="icon-xs"
              onClick={() => {
                onChange?.(generatePassword());
                setVisible(true);
              }}
              disabled={disabled}
              aria-label="Gerar senha forte"
            >
              <RefreshCwIcon />
            </InputGroupButton>
          </Hint>
        )}
        {copyable && (
          <Hint label={copied ? "Copiada" : "Copiar"}>
            <InputGroupButton
              size="icon-xs"
              onClick={handleCopy}
              disabled={disabled || !value}
              aria-label="Copiar senha"
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
            </InputGroupButton>
          </Hint>
        )}
      </InputGroupAddon>
    </InputGroup>
  );
}
