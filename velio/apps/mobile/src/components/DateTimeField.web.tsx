import { Input } from '@velio/ui/native';
import { useState } from 'react';
import type { DateTimeFieldProps } from './DateTimeField';

function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** Web (ambiente de desenvolvimento): texto "DD/MM/AAAA HH:MM". */
export function DateTimeField({ label, value, onChange, minimumDate }: DateTimeFieldProps) {
  const [text, setText] = useState(
    `${pad(value.getDate())}/${pad(value.getMonth() + 1)}/${value.getFullYear()} ${pad(value.getHours())}:${pad(value.getMinutes())}`,
  );
  const [error, setError] = useState<string | null>(null);
  return (
    <Input
      label={label}
      value={text}
      placeholder="DD/MM/AAAA HH:MM"
      error={error}
      onChangeText={(t) => {
        setText(t);
        const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/);
        if (!m) {
          setError('Use o formato DD/MM/AAAA HH:MM');
          return;
        }
        const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4]), Number(m[5]));
        if (Number.isNaN(d.getTime()) || (minimumDate && d < minimumDate)) {
          setError('Escolha uma data futura.');
          return;
        }
        setError(null);
        onChange(d);
      }}
    />
  );
}
