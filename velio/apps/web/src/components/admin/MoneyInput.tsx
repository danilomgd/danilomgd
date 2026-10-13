'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui';
import { centsToInput, parseBRL } from '@/lib/format';

export interface MoneyInputProps {
  id: string;
  valueCents: number | null | undefined;
  onChange: (cents: number | null) => void;
  invalid?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

/** Campo em reais que entrega centavos inteiros (ADR-016). */
export function MoneyInput({
  id,
  valueCents,
  onChange,
  invalid,
  disabled,
  placeholder = '0,00',
}: MoneyInputProps) {
  const [text, setText] = useState(centsToInput(valueCents));
  useEffect(() => {
    setText(centsToInput(valueCents));
  }, [valueCents]);
  return (
    <Input
      id={id}
      prefix="R$"
      inputMode="decimal"
      className="mono"
      value={text}
      placeholder={placeholder}
      disabled={disabled}
      invalid={invalid}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const cents = text.trim() === '' ? null : parseBRL(text);
        if (cents === null) {
          onChange(null);
          setText('');
        } else {
          onChange(cents);
          setText(centsToInput(cents));
        }
      }}
    />
  );
}
