//! TS 원본: apps/api/src/store.ts

use crate::app::AppOpts;
use crate::kv::MemKv;
use crate::ports::Ports;

/// TS createStore 의 시드 사용자·스키마 버전·테스트 기록 정리.
pub fn init(_kv: &mut MemKv, _now: i64, _opts: &AppOpts, _ports: &dyn Ports) {}
