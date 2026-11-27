export function StepIndicator({ steps, current, maxReached, onGo }: { steps: string[]; current: number; maxReached: number; onGo?: (i: number) => void }) {
  return (
    <div className="stepper" role="list">
      {steps.map((s, i) => {
        const cls = i === current ? 'current' : i <= maxReached ? 'done' : '';
        return (
          <button key={s} type="button" role="listitem" className={`step ${cls}`} disabled={i > maxReached || i === current} onClick={() => onGo?.(i)}>
            {s}
          </button>
        );
      })}
    </div>
  );
}
