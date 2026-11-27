interface Base<T extends string> { options: readonly T[]; labels?: Record<string, string>; id?: string }

export function Chip({ selected, onClick, children, removable }: { selected?: boolean; onClick?: () => void; children: React.ReactNode; removable?: boolean }) {
  return (
    <button type="button" className={`chip${selected ? ' selected' : ''}${removable ? ' removable' : ''}`} aria-pressed={selected} onClick={onClick}>
      {children}
    </button>
  );
}

export function ChipGroup<T extends string>(p: Base<T> & { value: T | undefined; onChange: (v: T | undefined) => void; allowClear?: boolean }) {
  return (
    <div className="chips" id={p.id}>
      {p.options.map((o) => (
        <Chip key={o} selected={p.value === o} onClick={() => p.onChange(p.value === o && p.allowClear ? undefined : o)}>{p.labels?.[o] ?? o}</Chip>
      ))}
    </div>
  );
}

export function MultiChipGroup<T extends string>(p: Base<T> & { value: T[]; onChange: (v: T[]) => void }) {
  return (
    <div className="chips" id={p.id}>
      {p.options.map((o) => {
        const on = p.value.includes(o);
        return <Chip key={o} selected={on} onClick={() => p.onChange(on ? p.value.filter((x) => x !== o) : [...p.value, o])}>{p.labels?.[o] ?? o}</Chip>;
      })}
    </div>
  );
}
