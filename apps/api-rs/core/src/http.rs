//! 요청·응답·오류. 오류 본문은 TS `app.onError` 와 같다: `{ error: { code, message, fields?, quota? } }`.
use serde_json::{json, Map, Value};

#[derive(Clone, Debug, Default)]
pub struct Req {
    pub method: String,
    /// 전체 URL (예: https://host/api/x?q=1).
    pub url: String,
    pub path: String,
    pub query: Vec<(String, String)>,
    pub headers: Vec<(String, String)>,
    pub body: Option<String>,
}

impl Req {
    pub fn header(&self, name: &str) -> Option<&str> {
        self.headers
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case(name))
            .map(|(_, v)| v.as_str())
    }
    pub fn query(&self, name: &str) -> Option<&str> {
        self.query
            .iter()
            .find(|(k, _)| k == name)
            .map(|(_, v)| v.as_str())
    }
    pub fn cookie(&self, name: &str) -> Option<String> {
        let raw = self.header("cookie")?;
        raw.split(';').map(|p| p.trim()).find_map(|p| {
            let (k, v) = p.split_once('=')?;
            (k == name).then(|| v.to_string())
        })
    }
    pub fn is_https(&self) -> bool {
        self.url.starts_with("https:")
    }
    /// TS `json(c)`: 객체 본문이 아니면 400 'JSON 본문이 필요해요'.
    pub fn json_object(&self) -> Result<Map<String, Value>, HttpError> {
        match self
            .body
            .as_deref()
            .and_then(|b| serde_json::from_str::<Value>(b).ok())
        {
            Some(Value::Object(m)) => Ok(m),
            _ => Err(HttpError::bad("JSON 본문이 필요해요")),
        }
    }
    /// TS `jsonOrEmpty(c)`.
    pub fn json_or_empty(&self) -> Map<String, Value> {
        self.json_object().unwrap_or_default()
    }
}

#[derive(Clone, Debug)]
pub struct Resp {
    pub status: u16,
    pub headers: Vec<(String, String)>,
    pub body: String,
}

impl Resp {
    pub fn json(status: u16, v: &Value) -> Resp {
        Resp {
            status,
            headers: vec![("content-type".into(), "application/json".into())],
            body: serde_json::to_string(&js_numbers(v)).unwrap_or_default(),
        }
    }
    pub fn ok(v: Value) -> Result<Resp, HttpError> {
        Ok(Resp::json(200, &v))
    }
    pub fn created(v: Value) -> Result<Resp, HttpError> {
        Ok(Resp::json(201, &v))
    }
    pub fn with_header(mut self, k: &str, v: &str) -> Resp {
        self.headers.push((k.into(), v.into()));
        self
    }
}

/// Hono `setCookie` 와 같은 Set-Cookie 문자열. 차등 하네스로 TS 출력과 맞춘다.
pub fn set_cookie(
    name: &str,
    value: &str,
    max_age: i64,
    http_only: bool,
    same_site: &str,
    secure: bool,
) -> String {
    let mut s = format!("{name}={value}; Max-Age={max_age}; Path=/");
    if http_only {
        s.push_str("; HttpOnly");
    }
    if secure {
        s.push_str("; Secure");
    }
    s.push_str(&format!("; SameSite={same_site}"));
    s
}
/// Hono `deleteCookie(c, name, { path: '/' })`.
pub fn delete_cookie(name: &str) -> String {
    format!("{name}=; Max-Age=0; Path=/")
}

#[derive(Clone, Debug)]
pub struct HttpError {
    pub status: u16,
    pub code: String,
    pub message: String,
    pub fields: Option<Value>,
    pub quota: Option<Value>,
}

impl HttpError {
    pub fn new(status: u16, code: &str, message: &str) -> Self {
        HttpError {
            status,
            code: code.into(),
            message: message.into(),
            fields: None,
            quota: None,
        }
    }
    pub fn bad(message: &str) -> Self {
        Self::new(400, "bad_request", message)
    }
    pub fn not_found(message: &str) -> Self {
        Self::new(404, "not_found", message)
    }
    /// 아직 옮기지 않은 라우트. 동일성 검사에서 실패로 보인다.
    pub fn not_implemented(what: &str) -> Self {
        Self::new(501, "not_implemented", what)
    }
    pub fn with_fields(mut self, f: Value) -> Self {
        self.fields = Some(f);
        self
    }
    pub fn with_quota(mut self, q: Value) -> Self {
        self.quota = Some(q);
        self
    }
    pub fn to_resp(&self) -> Resp {
        let mut e = Map::new();
        e.insert("code".into(), json!(self.code));
        e.insert("message".into(), json!(self.message));
        if let Some(f) = &self.fields {
            e.insert("fields".into(), f.clone());
        }
        if let Some(q) = &self.quota {
            e.insert("quota".into(), q.clone());
        }
        Resp::json(self.status, &json!({ "error": Value::Object(e) }))
    }
}

pub type HResult = Result<Resp, HttpError>;

/// JSON.stringify 처럼 정수인 f64 (1.0, -0.0) 를 정수로 쓴다. serde_json 은 `1.0` 으로 쓴다.
pub fn js_numbers(v: &Value) -> Value {
    match v {
        Value::Number(n) => match n.as_f64() {
            Some(f) if n.is_f64() && f.fract() == 0.0 && f.abs() <= 9_007_199_254_740_991.0 => {
                Value::from(f as i64)
            }
            _ => v.clone(),
        },
        Value::Array(a) => Value::Array(a.iter().map(js_numbers).collect()),
        Value::Object(m) => {
            Value::Object(m.iter().map(|(k, x)| (k.clone(), js_numbers(x))).collect())
        }
        _ => v.clone(),
    }
}

#[cfg(test)]
mod js_number_tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn whole_floats_print_as_integers() {
        let r = Resp::json(
            200,
            &json!({"a": 1.0, "b": [30.0, 0.5, -0.0], "c": {"d": 2.25}}),
        );
        assert_eq!(r.body, r#"{"a":1,"b":[30,0.5,0],"c":{"d":2.25}}"#);
    }
}
