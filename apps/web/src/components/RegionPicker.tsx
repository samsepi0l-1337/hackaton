import { useEffect, useId, useRef, useState } from 'react';

/** 지역 필터에 쓰는 지역과 그 아래 구·군(경남은 시·군). */
export const AREAS: Record<string, { label: string; districts: string[] }> = {
  부산: { label: '구·군', districts: ['중구', '서구', '동구', '영도구', '부산진구', '동래구', '남구', '북구', '해운대구', '사하구', '금정구', '강서구', '연제구', '수영구', '사상구', '기장군'] },
  울산: { label: '구·군', districts: ['중구', '남구', '동구', '북구', '울주군'] },
  경남: { label: '시·군', districts: ['창원시', '진주시', '통영시', '사천시', '김해시', '밀양시', '거제시', '양산시', '의령군', '함안군', '창녕군', '고성군', '남해군', '하동군', '산청군', '함양군', '거창군', '합천군'] },
};

/** 당근식 지역 선택: 지역을 누르면 바로 아래에 구·군이 펼쳐진다. */
export function RegionPicker({ id, region, district, onChange }: {
  id: string;
  region: string | undefined;
  district: string | undefined;
  onChange: (region: string | undefined, district: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const [area, setArea] = useState<string | undefined>(region);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => { if (open) setArea(region); }, [open, region]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  function pick(r: string | undefined, d: string | undefined) {
    onChange(r, d);
    setOpen(false);
    trigger.current?.focus();
  }

  const current = region ? (district ? `${region} ${district}` : region) : '전체';
  return (
    <div className="region-picker" ref={root}>
      <button ref={trigger} id={id} type="button" className="input region-trigger" aria-haspopup="true" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((v) => !v)}>
        <span>{current}</span><span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="region-panel" id={panelId}>
          <button type="button" className="region-top" aria-pressed={!region} onClick={() => pick(undefined, undefined)}>전체</button>
          {Object.entries(AREAS).map(([name, a]) => {
            const expanded = area === name;
            return (
              <div key={name}>
                <button type="button" className="region-top" aria-expanded={expanded} onClick={() => setArea(expanded ? undefined : name)}>
                  <span>{name}</span><span aria-hidden="true">{expanded ? '−' : '+'}</span>
                </button>
                {expanded && (
                  <div className="region-chips" role="group" aria-label={`${name} ${a.label}`}>
                    <button type="button" className="chip" aria-pressed={region === name && !district} onClick={() => pick(name, undefined)}>{name} 전체</button>
                    {a.districts.map((d) => (
                      <button key={d} type="button" className="chip" aria-pressed={region === name && district === d} onClick={() => pick(name, d)}>{d}</button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
