// prelude·spec 뒤에 붙는다. 결과를 한 줄 JSON 으로 내고 공간을 닫는다. 실패면 다시 던져 종료 코드를 1로 만든다.
console.log('E2E_RESULT ' + JSON.stringify({ spec: SPEC, ok: !__err, steps: __steps }));
try { await task.finish({ keep: [] }); } catch {}
if (__err) throw __err;
