//! 시간 제한. TS 의 Promise.race([work, setTimeout(ms)]) 와 같다.
use crate::ports::Ports;
use std::future::Future;
use std::pin::pin;
use std::task::Poll;

/// `fut` 이 `ms` 안에 끝나면 Some(결과), 아니면 None. 둘 다 같은 순간에 준비되면 작업 쪽을 먼저 본다.
pub async fn timeout<F: Future>(ports: &dyn Ports, ms: u64, fut: F) -> Option<F::Output> {
    let mut work = pin!(fut);
    let mut timer = pin!(ports.sleep(ms));
    std::future::poll_fn(|cx| {
        if let Poll::Ready(v) = work.as_mut().poll(cx) {
            return Poll::Ready(Some(v));
        }
        if timer.as_mut().poll(cx).is_ready() {
            return Poll::Ready(None);
        }
        Poll::Pending
    })
    .await
}
