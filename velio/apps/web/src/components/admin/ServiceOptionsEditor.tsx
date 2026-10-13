'use client';

import s from '@/components/admin/admin.module.css';
import { MoneyInput } from '@/components/admin/MoneyInput';
import { Button, Field, Input, Select, Switch } from '@/components/ui';
import type { FieldErrors } from '@/lib/admin';

let uidSeq = 0;
/** Identificador local estável para linhas de formulário sem id. */
export function uid(): string {
  uidSeq += 1;
  return `u${uidSeq}-${Date.now().toString(36)}`;
}

export interface OptionDraft {
  uid: string;
  key: string;
  label: string;
  type: 'select' | 'number' | 'boolean' | 'text';
  required: boolean;
  choices: Array<{ uid: string; value: string; label: string; priceDeltaCents: number }>;
  unitPriceCents: number | null;
  min: string;
  max: string;
}

export const emptyOption = (): OptionDraft => ({
  uid: uid(),
  key: '',
  label: '',
  type: 'select',
  required: false,
  choices: [{ uid: uid(), value: '', label: '', priceDeltaCents: 0 }],
  unitPriceCents: null,
  min: '',
  max: '',
});

const TYPES = [
  { value: 'select', label: 'Escolha única' },
  { value: 'number', label: 'Quantidade' },
  { value: 'boolean', label: 'Sim ou não' },
  { value: 'text', label: 'Texto livre' },
];

function RemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" className={s.iconBtn} onClick={onClick} aria-label={label}>
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
      </svg>
    </button>
  );
}

/** Editor das opções configuráveis de um serviço (`Service.options`). */
export function ServiceOptionsEditor({
  options,
  onChange,
  errors,
}: {
  options: OptionDraft[];
  onChange: (o: OptionDraft[]) => void;
  errors: FieldErrors;
}) {
  const update = (i: number, patch: Partial<OptionDraft>) =>
    onChange(options.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
  return (
    <div className="stack-sm">
      {options.length === 0 ? (
        <p className="small muted">Sem opções. O cliente contrata o serviço como está.</p>
      ) : null}
      {options.map((o, i) => (
        <div key={o.uid} className={s.optionRow}>
          <div className={s.optionHead}>
            <strong className="small">Opção {i + 1}</strong>
            <RemoveButton
              onClick={() => onChange(options.filter((_, idx) => idx !== i))}
              label={`Remover opção ${i + 1}`}
            />
          </div>
          <div className={s.formGrid}>
            <Field label="Chave" htmlFor={`opt-${i}-key`} required error={errors[`options.${i}.key`]}>
              <Input
                id={`opt-${i}-key`}
                className="mono"
                value={o.key}
                onChange={(e) => update(i, { key: e.target.value })}
              />
            </Field>
            <Field label="Rótulo" htmlFor={`opt-${i}-label`} required error={errors[`options.${i}.label`]}>
              <Input
                id={`opt-${i}-label`}
                value={o.label}
                onChange={(e) => update(i, { label: e.target.value })}
              />
            </Field>
            <Field label="Tipo" htmlFor={`opt-${i}-type`}>
              <Select
                id={`opt-${i}-type`}
                value={o.type}
                options={TYPES}
                onChange={(e) => update(i, { type: e.target.value as OptionDraft['type'] })}
              />
            </Field>
            <div style={{ alignSelf: 'end', paddingBottom: 8 }}>
              <Switch
                label="Obrigatória"
                checked={o.required}
                onChange={(e) => update(i, { required: e.target.checked })}
              />
            </div>
            {o.type === 'number' ? (
              <>
                <Field
                  label="Preço por unidade"
                  htmlFor={`opt-${i}-unit`}
                  error={errors[`options.${i}.unitPriceCents`]}
                >
                  <MoneyInput
                    id={`opt-${i}-unit`}
                    valueCents={o.unitPriceCents}
                    onChange={(c) => update(i, { unitPriceCents: c })}
                  />
                </Field>
                <div className="row">
                  <Field label="Mínimo" htmlFor={`opt-${i}-min`}>
                    <Input
                      id={`opt-${i}-min`}
                      type="number"
                      value={o.min}
                      onChange={(e) => update(i, { min: e.target.value })}
                    />
                  </Field>
                  <Field label="Máximo" htmlFor={`opt-${i}-max`}>
                    <Input
                      id={`opt-${i}-max`}
                      type="number"
                      value={o.max}
                      onChange={(e) => update(i, { max: e.target.value })}
                    />
                  </Field>
                </div>
              </>
            ) : null}
          </div>
          {o.type === 'select' ? (
            <div className="stack-sm">
              <span className="caption">Escolhas</span>
              {o.choices.map((c, ci) => (
                <div key={c.uid} className={s.choiceRow}>
                  <Field
                    label="Valor"
                    htmlFor={`opt-${i}-c-${ci}-v`}
                    error={errors[`options.${i}.choices.${ci}.value`]}
                  >
                    <Input
                      id={`opt-${i}-c-${ci}-v`}
                      className="mono"
                      value={c.value}
                      onChange={(e) =>
                        update(i, {
                          choices: o.choices.map((x, xi) =>
                            xi === ci ? { ...x, value: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  </Field>
                  <Field
                    label="Rótulo"
                    htmlFor={`opt-${i}-c-${ci}-l`}
                    error={errors[`options.${i}.choices.${ci}.label`]}
                  >
                    <Input
                      id={`opt-${i}-c-${ci}-l`}
                      value={c.label}
                      onChange={(e) =>
                        update(i, {
                          choices: o.choices.map((x, xi) =>
                            xi === ci ? { ...x, label: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  </Field>
                  <Field label="Acréscimo" htmlFor={`opt-${i}-c-${ci}-p`}>
                    <MoneyInput
                      id={`opt-${i}-c-${ci}-p`}
                      valueCents={c.priceDeltaCents}
                      onChange={(cents) =>
                        update(i, {
                          choices: o.choices.map((x, xi) =>
                            xi === ci ? { ...x, priceDeltaCents: cents ?? 0 } : x,
                          ),
                        })
                      }
                    />
                  </Field>
                  <RemoveButton
                    onClick={() => update(i, { choices: o.choices.filter((_, xi) => xi !== ci) })}
                    label={`Remover escolha ${ci + 1}`}
                  />
                </div>
              ))}
              <div>
                <Button
                  size="sm"
                  onClick={() =>
                    update(i, {
                      choices: [...o.choices, { uid: uid(), value: '', label: '', priceDeltaCents: 0 }],
                    })
                  }
                >
                  Adicionar escolha
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ))}
      <div>
        <Button size="sm" variant="secondary" onClick={() => onChange([...options, emptyOption()])}>
          Adicionar opção
        </Button>
      </div>
    </div>
  );
}
