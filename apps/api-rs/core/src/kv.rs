//! Durable Object KV 의 메모리 사본. DO 가 시작할 때 전체를 읽어 오고(요청은 동기로 처리),
//! 요청이 끝나면 바뀐 키만 `take_changes` 로 꺼내 저장소에 쓴다. TS `KvLike`(ctx.storage.kv) 와 같은 뜻.
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Debug, Default)]
pub struct MemKv {
    data: BTreeMap<String, Value>,
    dirty: BTreeSet<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Change {
    Put(String, Value),
    Delete(String),
}

impl MemKv {
    pub fn from_entries(entries: impl IntoIterator<Item = (String, Value)>) -> Self {
        MemKv {
            data: entries.into_iter().collect(),
            dirty: BTreeSet::new(),
        }
    }
    pub fn get(&self, key: &str) -> Option<&Value> {
        self.data.get(key)
    }
    pub fn put(&mut self, key: &str, v: Value) {
        self.data.insert(key.to_string(), v);
        self.dirty.insert(key.to_string());
    }
    /// 있었으면 true (TS `kv.delete`).
    pub fn delete(&mut self, key: &str) -> bool {
        self.dirty.insert(key.to_string());
        self.data.remove(key).is_some()
    }
    /// 키 오름차순(바이트 순 = JS 의 KV list 순서). TS `kv.list({ prefix })`.
    pub fn list(&self, prefix: &str) -> Vec<(String, Value)> {
        self.data
            .range(prefix.to_string()..)
            .take_while(|(k, _)| k.starts_with(prefix))
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect()
    }
    pub fn keys(&self, prefix: &str) -> Vec<String> {
        self.data
            .range(prefix.to_string()..)
            .take_while(|(k, _)| k.starts_with(prefix))
            .map(|(k, _)| k.clone())
            .collect()
    }
    pub fn take_changes(&mut self) -> Vec<Change> {
        let keys = std::mem::take(&mut self.dirty);
        keys.into_iter()
            .map(|k| match self.data.get(&k) {
                Some(v) => Change::Put(k, v.clone()),
                None => Change::Delete(k),
            })
            .collect()
    }
    pub fn len(&self) -> usize {
        self.data.len()
    }
    pub fn is_empty(&self) -> bool {
        self.data.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn list_prefix_and_changes() {
        let mut kv = MemKv::from_entries([
            ("user:b".to_string(), json!(2)),
            ("user:a".to_string(), json!(1)),
            ("v:x".to_string(), json!(0)),
        ]);
        assert_eq!(kv.keys("user:"), vec!["user:a", "user:b"]);
        kv.put("user:c", json!(3));
        assert!(kv.delete("v:x"));
        assert_eq!(
            kv.take_changes(),
            vec![
                Change::Put("user:c".into(), json!(3)),
                Change::Delete("v:x".into())
            ]
        );
        assert!(kv.take_changes().is_empty());
    }
}
