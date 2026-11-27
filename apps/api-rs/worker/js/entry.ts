// Worker 입구: Rust(workers-rs) 빌드 결과 + 컨테이너 클래스(JS 로만 쓸 수 있음).
export * from '../build/worker/shim.mjs';
export { default } from '../build/worker/shim.mjs';
export { DocWorker } from '../../../api/src/container';
