//! TS 원본: apps/api/src/explore/routes.ts (options, problems, session, start, exploration)
use crate::api::{app::common::bad, explore::state::{actor_id, empty_state, new_exploration, open, peek, sanitize_conditions, save, text, touch, view}, store::Store};
use crate::app::Cx;
use crate::http::{HResult, Req, Resp};
use crate::jsstr::{js_trim, len16};
use crate::shared::{data, explore, explore_rules, kstartup_resource};
use serde_json::{json, Value};

pub async fn options(cx: &mut Cx<'_>, _req: &Req) -> HResult {
    let interests: Vec<_> = explore::INDUSTRY_TAGS.iter().chain(explore::INTEREST_EXTRA.iter()).copied().collect();
    let active = kstartup_resource::active_resources(&crate::api::explore::state::resources_now(cx), cx.now);
    Resp::ok(json!({"readiness":explore::READINESS_OPTIONS,"interests":interests,"regions":explore::REVIEW_REGIONS,"coverage":explore_rules::coverage_by_region(&data::problems(), &active, &data::contexts()),"dataVersion":explore::EXPLORE_DATA_VERSION,"privacy":"입력한 내용은 이 서비스 서버에 저장되고, 문장 정리를 위해 외부 AI(Upstage Solar)로 전송될 수 있어요. 내 계정에 저장되어 다른 기기에서도 이어져요. \"처음부터 다시\"를 누르면 서버에 저장된 내 탐색 기록이 지워지고, 익명 집계(횟수)만 남아요."}))
}
pub async fn problems(_cx: &mut Cx<'_>, req: &Req) -> HResult {
    let interests: Vec<Value> = req.query("interests").unwrap_or("").split(',').map(js_trim).filter(|s| !s.is_empty()).map(|s| json!(s)).collect();
    let result = explore_rules::problems_for(&interests, req.query("region"), &data::problems());
    Resp::ok(json!({"items":result["items"],"dataVersion":explore::EXPLORE_DATA_VERSION,"emptyReason":result["emptyReason"]}))
}
pub async fn get_session(cx: &mut Cx<'_>, _req: &Req) -> HResult {
    let id=actor_id(cx)?; let state=peek(cx,&id);
    let focus=state["start"]["focusResourceId"].as_str().and_then(|id| crate::api::explore::state::resources_now(cx).into_iter().find(|r| r["id"]==id)).map(|r| json!({"id":r["id"],"title":r["title"],"agency":r["agency"],"type":r["type"],"endDate":r["endDate"],"recruitStatus":r["recruitStatus"],"url":r["url"]})).unwrap_or(Value::Null);
    let mut result=view(cx,&state); if state["start"]["focusResourceId"].as_str().is_some_and(|id| !id.is_empty()) { result["focus"]=focus; } Resp::ok(result)
}
pub async fn delete_session(cx: &mut Cx<'_>, _req: &Req) -> HResult {
    let id=actor_id(cx)?; Store::new(cx.kv,cx.now).delete_explore(&id);
    let state=empty_state(cx.now,"user"); Resp::ok(json!({"ok":true,"session":view(cx,&state)}))
}
fn set_optional(start: &mut Value, key: &str, value: Option<Value>) {
    if let Some(o)=start.as_object_mut() { if let Some(v)=value {o.insert(key.into(),v);}else{o.remove(key);} }
}
pub async fn put_start(cx: &mut Cx<'_>, req: &Req) -> HResult {
    let id=actor_id(cx)?; let body=req.json_object()?;
    let p=body.get("start").and_then(Value::as_object).ok_or_else(||bad("start가 필요해요"))?;
    let focus_resources=crate::api::explore::state::resources_now(cx);
    let mut s=open(cx,&id)?;
    let prev=json!([s["start"]["readiness"],s["start"]["idea"],s["start"]["interests"],s["start"]["interestNote"]]);
    let prev_region=json!([s["start"]["reviewRegion"],s["start"]["district"],s["start"]["conditions"],s["start"]["focusResourceId"]]);
    let start=&mut s["start"]; let mut errors=Vec::new();
    if let Some(v)=p.get("readiness") {
        if v.is_null() || v=="" {set_optional(start,"readiness",None)}
        else if v.as_str().is_some_and(|x|explore::READINESS_STAGES.contains(&x)){set_optional(start,"readiness",Some(v.clone()))}
        else {errors.push(json!({"field":"readiness","message":"준비 상태 값이 올바르지 않아요"}));}
    }
    if let Some(v)=p.get("idea") {
        let raw=js_trim(v.as_str().unwrap_or(""));
        if len16(raw)>200 {errors.push(json!({"field":"idea","message":"해보고 싶은 일은 200자 이내로 적어 주세요"}));}
        else {set_optional(start,"idea",(!raw.is_empty()).then(||json!(raw)));}
    }
    if let Some(v)=p.get("interests") {
        let arr:Vec<_>=v.as_array().into_iter().flatten().filter_map(Value::as_str).collect();
        let allowed=|s:&str| explore::INDUSTRY_TAGS.contains(&s)||explore::INTEREST_EXTRA.contains(&s);
        if arr.iter().any(|x|!allowed(x)){errors.push(json!({"field":"interests","message":"목록에 없는 관심 분야는 \"직접 적기\"에 써 주세요"}));}
        let mut selected:Vec<&str>=Vec::new(); for x in &arr {if allowed(x)&&!selected.contains(x){selected.push(x);}}
        set_optional(start,"interests",(!arr.is_empty()).then(||json!(selected)));
    }
    for (key,max) in [("interestNote",200),("district",20)] {if let Some(v)=p.get(key){set_optional(start,key,text(v,max).map(|x|json!(x)));}}
    if let Some(v)=p.get("reviewRegion") {
        if v.is_null()||v=="" {set_optional(start,"reviewRegion",None)}
        else if v.as_str().is_some_and(|x|explore::REVIEW_REGIONS.contains(&x)){set_optional(start,"reviewRegion",Some(v.clone()))}
        else {errors.push(json!({"field":"reviewRegion","message":"창업 검토 지역 값이 올바르지 않아요"}));}
    }
    if let Some(v)=p.get("focusResourceId") {
        if v.is_null() || v=="" {set_optional(start,"focusResourceId",None)}
        else if v.as_str().is_some_and(|id| focus_resources.iter().any(|r| r["id"]==id)) {set_optional(start,"focusResourceId",Some(v.clone()))}
        else {errors.push(json!({"field":"focusResourceId","message":"공고를 찾을 수 없어요"}));}
    }
    if let Some(v)=p.get("conditions"){set_optional(start,"conditions",sanitize_conditions(v));}
    if json!([s["start"]["readiness"],s["start"]["idea"],s["start"]["interests"],s["start"]["interestNote"]])!=prev{s["summary"]=Value::Null;}
    if json!([s["start"]["reviewRegion"],s["start"]["district"],s["start"]["conditions"],s["start"]["focusResourceId"]])!=prev_region||s["summary"].is_null(){s["regional"]=Value::Null;}
    let validation=explore_rules::validate_start(&s["start"]);
    if s["step"]=="start" && validation.is_empty(){s["step"]=json!("chat");}
    touch(&mut s,cx.now); save(cx,&id,&s)?;
    for e in validation {if !errors.iter().any(|x|x["field"]==e["field"]){errors.push(e);}}
    let mut result=view(cx,&s); result["errors"]=json!(errors); Resp::ok(result)
}
pub async fn put_exploration(cx: &mut Cx<'_>, req: &Req) -> HResult {
    let id=actor_id(cx)?; let b=req.json_object()?; let mut s=open(cx,&id)?;
    let cur=s["exploration"].clone(); let mut next=if cur.is_null(){new_exploration()}else{cur.clone()};
    if b.contains_key("origin")||b.contains_key("problemId")||b.contains_key("customProblem") {
        let truthy=|v: &Value| match v { Value::Null=>false, Value::Bool(b)=>*b, Value::Number(n)=>n.as_f64().is_some_and(|n|n!=0.0), Value::String(s)=>!s.is_empty(), _=>true };
        let inferred=if b.get("problemId").is_some_and(truthy){"card"}else if b.get("customProblem").is_some_and(truthy){"custom"}else{cur["origin"].as_str().unwrap_or("hold")};
        let origin=match b.get("origin") {None|Some(Value::Null)=>inferred,Some(Value::String(s))=>s.as_str(),Some(_)=>return Err(bad("origin 값이 올바르지 않아요"))};
        match origin {
            "card" => {let id=b.get("problemId").and_then(Value::as_str).or_else(||cur["problemId"].as_str()).unwrap_or(""); if id.is_empty()||!data::problems().iter().any(|p|p["id"]==id){return Err(bad("없거나 바뀐 문제 카드예요. 다른 카드를 고르거나 직접 입력해 주세요"));} next["origin"]=json!("card");next["problemId"]=json!(id);next["customProblem"]=Value::Null;},
            "custom" => {let t=if let Some(v)=b.get("customProblem"){text(v,300)}else{cur["customProblem"].as_str().map(str::to_owned)}.ok_or_else(||bad("직접 입력할 문제를 적어 주세요"))?;next["origin"]=json!("custom");next["problemId"]=Value::Null;next["customProblem"]=json!(t);},
            "hold" => {next["origin"]=json!("hold");next["problemId"]=Value::Null;next["customProblem"]=Value::Null;},
            _ => return Err(bad("origin 값이 올바르지 않아요")),
        }
    }
    if let Some(v)=b.get("selectionReason"){next["selectionReason"]=text(v,300).map_or(Value::Null,|x|json!(x));}
    let status=b.get("directionStatus");
    if status.is_some_and(|v|!v.as_str().is_some_and(|x|["user","user_selected","hold"].contains(&x))){return Err(bad("directionStatus 는 user, user_selected, hold 만 보낼 수 있어요"));}
    if let Some(v)=b.get("direction"){next["direction"]=text(v,300).map_or(Value::Null,|x|json!(x));if status.is_none(){next["directionStatus"]=json!(if next["direction"].is_null(){"hold"}else{"user"});}}
    if let Some(v)=status {next["directionStatus"]=v.clone();if v=="hold"&&!b.contains_key("direction"){next["direction"]=Value::Null;}}
    if ["user","user_selected"].contains(&next["directionStatus"].as_str().unwrap_or(""))&&next["direction"].is_null(){return Err(bad("방향을 선택하려면 방향 내용이 필요해요"));}
    if next["directionStatus"]=="hold" {let mut rejected=s["rejected"].as_array().cloned().unwrap_or_default();for v in cur["suggestions"].as_array().into_iter().flatten(){if !rejected.contains(v){rejected.push(v.clone());}}if rejected.len()>20{rejected.drain(..rejected.len()-20);}s["rejected"]=json!(rejected);}
    if ["user","user_selected","hold"].contains(&next["directionStatus"].as_str().unwrap_or("")){next["suggestions"]=json!([]);}
    let changed=!cur.is_null()&&(cur["problemId"]!=next["problemId"]||cur["origin"]!=next["origin"]||cur["customProblem"]!=next["customProblem"]);
    if changed {next["dataVersion"]=json!(explore::EXPLORE_DATA_VERSION);for k in ["summary","regional","ai","lastBody","fieldQ"]{s[k]=Value::Null;}s["prepDone"]=json!({});if s["step"]=="result"||s["step"]=="summary"{s["step"]=json!("summary");}}
    else if !s["summary"].is_null(){s["summary"]["exploration"]["reason"]=match next["selectionReason"].as_str().filter(|s|!s.is_empty()){Some(t)=>json!({"text":t,"provenance":"user"}),None=>json!({"text":"미정","provenance":"unknown"})};s["summary"]["exploration"]["direction"]=match next["direction"].as_str().filter(|s|!s.is_empty()){Some(t)=>json!({"text":t,"provenance":"user","status":next["directionStatus"]}),None=>json!({"text":"아직 탐색 중","provenance":"unknown","status":"hold"})};}
    s["exploration"]=next; touch(&mut s,cx.now);save(cx,&id,&s)?;let mut result=view(cx,&s);result["problemChanged"]=json!(changed);Resp::ok(result)
}
