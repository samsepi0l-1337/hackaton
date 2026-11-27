//! 탐색 상태와 경로들이 함께 쓰는 순수 도우미.
use crate::api::{app::common::{bad, require_user}, explore::{ai::problem_context, quota::{exempt_quota, quota_config, quota_keys, quota_status}}, store::Store};
use crate::app::Cx;
use crate::http::{HttpError, Req};
use crate::jsstr::{iso, js_trim, take16};
use crate::shared::{data, explore::{self, EXPLORE_DATA_VERSION}, explore_rules as rules, kstartup_resource, likes::LikeProfile};
use serde_json::{json, Map, Value};
use std::collections::HashSet;

pub fn resources_now(cx: &Cx<'_>) -> Vec<Value> {
    kstartup_resource::merge_resources(&data::resources(), &crate::api::kstartup::store::resources(cx.kv))
}

pub fn require_verified(cx: &Cx<'_>) -> Result<Value, HttpError> {
    let user = require_user(cx)?;
    if user["emailVerified"] != true { return Err(HttpError::new(403,"email_unverified","이메일 인증을 마치면 창업 준비를 시작할 수 있어요")); }
    Ok(user)
}
pub fn actor_id(cx: &Cx<'_>) -> Result<String, HttpError> {
    let u = require_verified(cx)?;
    u["id"].as_str().map(str::to_owned).ok_or_else(|| bad("요청을 처리하지 못했어요"))
}
pub fn empty_state(now: i64, kind: &str) -> Value {
    json!({"kind":kind,"createdAt":iso(now),"updatedAt":null,"step":"start","start":{},"exploration":null,"messages":[],"questionIndex":0,"plan":[],"answers":[],"finished":false,"summary":null,"regional":null,"prepDone":{},"ai":null,"rejected":[],"lastBody":null,"feedback":null,"events":{"start":1},"counted":false,"fieldQ":null})
}
pub fn new_exploration() -> Value { json!({"problemId":null,"origin":"hold","customProblem":null,"selectionReason":null,"direction":null,"directionStatus":"hold","dataVersion":EXPLORE_DATA_VERSION,"suggestions":[]}) }
pub fn peek(cx: &mut Cx<'_>, id: &str) -> Value { Store::new(cx.kv,cx.now).explore(id).unwrap_or_else(|| empty_state(cx.now,"user")) }
pub fn save(cx: &mut Cx<'_>, id: &str, state: &Value) -> Result<(), HttpError> { Store::new(cx.kv,cx.now).set_explore(id,state.clone()).map_err(|_| bad("요청을 처리하지 못했어요")) }
pub fn open(cx: &mut Cx<'_>, id: &str) -> Result<Value, HttpError> {
    let existing = Store::new(cx.kv,cx.now).explore(id);
    let mut state = match existing { Some(s) => s, None => { let s = empty_state(cx.now,"user"); save(cx,id,&s)?; s } };
    touch(&mut state,cx.now); Ok(state)
}
pub fn touch(state: &mut Value, now: i64) { state["updatedAt"] = json!(iso(now)); }
pub fn bump(state: &mut Value, event: &str) {
    let value = if ["start","chat_done","result"].contains(&event) { 1 } else { state["events"][event].as_i64().unwrap_or(0)+1 };
    state["events"][event] = json!(value);
}
pub fn view(cx: &mut Cx<'_>, state: &Value) -> Value {
    let cfg = quota_config(cx.opts.consult_limit);
    let quota = if cx.user.as_ref().is_some_and(|u| u["isTeam"] == true) { exempt_quota(cfg) } else {
        let keys = quota_keys(cx.user.as_ref());
        let mut q = quota_status(&Store::new(cx.kv,cx.now),&keys,cx.now,cfg);
        if let Some(o)=q.as_object_mut() { o.remove("blocked"); } q
    };
    json!({"step":state["step"],"start":state["start"],"exploration":state["exploration"],"messages":state["messages"],"questionIndex":state["questionIndex"],"maxQuestions":3,"summary":state["summary"],"regional":state["regional"],"updatedAt":state["updatedAt"],"quota":quota,"counted":state["counted"]})
}
pub fn text(v: &Value, max: usize) -> Option<String> { let s=js_trim(v.as_str()?); (!s.is_empty()).then(|| take16(s,max)) }
pub fn sanitize_conditions(v: &Value) -> Option<Value> {
    let o=v.as_object()?; let mut out=Map::new();
    if let Some(a)=o.get("age") { if a=="unknown" || a.as_f64().is_some_and(|n| n.fract()==0.0 && (0.0..=120.0).contains(&n)) { out.insert("age".into(),a.clone()); } }
    for k in ["residence","affiliation"] { if let Some(x)=o.get(k) { if x=="unknown" { out.insert(k.into(),x.clone()); } else if let Some(t)=text(x,40) { out.insert(k.into(),json!(t)); } } }
    if let Some(x)=o.get("hasBusiness") { if x=="unknown" || x.is_boolean() { out.insert("hasBusiness".into(),x.clone()); } }
    (!out.is_empty()).then_some(Value::Object(out))
}
pub fn clean_edit(raw: &Value) -> Value {
    let mut out=Map::new();
    let clean=|v: &Value| v.get("text").and_then(Value::as_str).map(|s| json!({"text":take16(s,1000)}));
    for k in ["interest","target","value","unknowns"] { if let Some(v)=clean(&raw[k]) { out.insert(k.into(),v); } }
    let mut ex=Map::new(); for k in ["reason","direction","hypotheses"] { if let Some(v)=clean(&raw["exploration"][k]) { ex.insert(k.into(),v); } }
    out.insert("exploration".into(),Value::Object(ex)); Value::Object(out)
}
pub fn local_tasks(req: &Req) -> HashSet<String> { req.header("x-local-ai").unwrap_or("").split(',').map(js_trim).map(str::to_lowercase).filter(|s| ["mentor","reason","field"].contains(&s.as_str())).collect() }
pub fn field_sig(s: &Value) -> String { ["problemId","origin","customProblem","direction"].iter().map(|k| s["exploration"][*k].as_str().unwrap_or("")).collect::<Vec<_>>().join("|") }
pub fn ai_sig(s: &Value) -> String { [s["start"]["readiness"].as_str().unwrap_or(""),s["exploration"]["problemId"].as_str().unwrap_or(""),s["exploration"]["direction"].as_str().unwrap_or("")].join("|") }
pub fn rule_field_questions(s: &Value, summary: &Value) -> Vec<Value> {
    let p=rules::problem_of(s["exploration"]["problemId"].as_str(),&data::problems()).unwrap_or(Value::Null);
    rules::build_field_questions(&p,&s["exploration"],summary,p["unknowns"].as_array().map(Vec::as_slice).unwrap_or(&[]))
}
pub fn user_texts(s: &Value) -> Vec<String> {
    [&s["start"]["idea"],&s["start"]["interestNote"],&s["exploration"]["customProblem"],&s["exploration"]["selectionReason"],&s["exploration"]["direction"]].into_iter().chain(s["answers"].as_array().into_iter().flatten().map(|a| &a["text"])).filter_map(Value::as_str).filter(|v| !v.is_empty()).map(str::to_owned).collect()
}
pub fn ai_context(s: &Value, resources: &[Value], likes: &[Value], views: &[Value]) -> String {
    let start=&s["start"]; let ex=&s["exploration"];
    let readiness=explore::READINESS_OPTIONS.iter().find(|o| Some(o.value)==start["readiness"].as_str()).map(|o| o.label).unwrap_or("미정");
    let interests=start["interests"].as_array().into_iter().flatten().filter_map(Value::as_str).collect::<Vec<_>>().join(", ");
    let answers=s["answers"].as_array().into_iter().flatten().filter_map(|a| a["text"].as_str().filter(|x| !x.is_empty()).map(|t| format!("{}={t}",a["key"].as_str().unwrap_or("")))).collect::<Vec<_>>().join(" / ");
    let p=rules::problem_of(ex["problemId"].as_str(),&data::problems());
    let mut lines=vec![format!("준비 상태: {readiness}"),format!("하고 싶은 일: {}",start["idea"].as_str().unwrap_or("미정")),format!("관심: {} {}",if interests.is_empty(){"미정"}else{&interests},start["interestNote"].as_str().unwrap_or("")),format!("검토 지역: {}",start["reviewRegion"].as_str().unwrap_or("미정")),problem_context(p.as_ref())];
    if let Some(t)=ex["customProblem"].as_str().filter(|s| !s.is_empty()) { lines.push(format!("직접 쓴 문제(외부 검증 전): {t}")); }
    if let Some(focus) = start["focusResourceId"].as_str().and_then(|id| resources.iter().find(|r|r["id"]==id)) {
        lines.push(format!("관심 공고(사용자가 직접 골라 상담을 시작함): {} / {} / 대상: {} / 지원 내용: {} / 마감: {}", focus["title"].as_str().unwrap_or(""), focus["agency"].as_str().unwrap_or(""), take16(focus["target"].as_str().unwrap_or(""),120), take16(focus["content"].as_str().unwrap_or(""),200), focus["endDate"].as_str().filter(|s|!s.is_empty()).unwrap_or("미정")));
    }
    let titles = |ids: &[Value], exclude_focus: bool| ids.iter().filter(|id| !exclude_focus || **id != start["focusResourceId"]).filter_map(|id|resources.iter().find(|r|r["id"]==*id)).filter_map(|r|r["title"].as_str()).take(5).collect::<Vec<_>>().join(", ");
    let liked=titles(likes,false); if !liked.is_empty(){lines.push(format!("하트한 공고: {liked}"));}
    let seen=titles(views,true); if !seen.is_empty(){lines.push(format!("최근 본 공고: {seen}"));}
    lines.push(format!("사용자 답변: {}",if answers.is_empty(){"없음"}else{&answers})); lines.join("\n")
}
pub fn ai_context_for(cx: &mut Cx<'_>, id: &str, s: &Value, resources: &[Value]) -> String {
    let store=Store::new(cx.kv,cx.now);
    let likes=store.likes(id); let views=store.recent_views(id);
    ai_context(s, resources, likes.as_array().map(Vec::as_slice).unwrap_or(&[]), views.as_array().map(Vec::as_slice).unwrap_or(&[]))
}
pub fn conditions_text(u: &Value) -> String {
    let mut p=Vec::new(); if u["age"].is_number(){ p.push(format!("나이 {}세",crate::jsstr::js_value_string(&u["age"]))); }
    if let Some(t)=u["residence"].as_str().filter(|s| !s.is_empty() && *s!="unknown"){p.push(format!("거주 {t}"));}
    if let Some(b)=u["hasBusiness"].as_bool(){p.push(if b{"사업자 있음"}else{"사업자 없음(예비창업자)"}.into());}
    if let Some(t)=u["affiliation"].as_str().filter(|s| !s.is_empty() && *s!="unknown"){p.push(format!("현재 {t}"));}
    if p.is_empty(){String::new()}else{format!("사용자 정보: {}",p.join(", "))}
}
fn likes_value(p: Option<&LikeProfile>) -> Value { match p {None=>Value::Null,Some(p)=>json!({"count":p.count,"caps":{"$map":p.caps},"industries":{"$map":p.industries},"types":{"$map":p.types},"agencies":{"$map":p.agencies},"ids":{"$set":p.ids}})} }
pub fn compute_result(s: &Value, now: i64, resources: &[Value], defaults: &Value, likes: Option<&LikeProfile>, views: Option<&LikeProfile>) -> Value {
    let start=&s["start"]; let ex=&s["exploration"]; let problems=data::problems(); let contexts=data::contexts();
    let summary=if s["summary"].is_null(){rules::build_summary(&json!({"start":start,"exploration":ex,"answers":s["answers"]}))}else{s["summary"].clone()};
    let sig=ai_sig(s); let matches=s["ai"]["sig"]==sig; let relevance=if matches {&s["ai"]["rank"]}else{&Value::Null};
    let input=json!({"readiness":start["readiness"],"problemId":ex["problemId"],"direction":ex["direction"],"reviewRegion":start["reviewRegion"],"conditions":rules::merge_conditions(&start["conditions"],defaults),"now":now,"resources":resources,"likes":likes_value(likes),"views":likes_value(views),"focusResourceId":start["focusResourceId"],"relevance":relevance});
    let rec=rules::recommend_resources(&input); let items=rec["items"].as_array().map(Vec::as_slice).unwrap_or(&[]);
    let cards: Vec<_>=items.iter().map(|r| { let resource=&r["resource"]; let id=resource["id"].as_str().unwrap_or(""); let ai=if matches{s["ai"]["reasons"][id].as_str()}else{None}; let focus=start["focusResourceId"]==id; let reason=if focus {format!("직접 관심을 보인 공고예요. {}",rules::reason_for(resource,start["readiness"].as_str(),r["linked"]==true))} else {ai.map(str::to_owned).unwrap_or_else(|| rules::reason_for(resource,start["readiness"].as_str(),r["linked"]==true))}; let mut card=json!({"resource":resource,"reason":reason,"reasonProvenance":if ai.is_some() && !focus {"ai"}else{"rule"},"condition":{"status":r["condition"]["status"],"checks":r["condition"]["checks"]},"regionMatch":r["regionMatch"],"liked":likes.is_some_and(|p|p.ids.iter().any(|i|i==id))}); if focus {card["focus"]=json!(true);} card }).collect();
    let regional=if s["regional"].is_null(){rules::build_regional(&json!({"start":start,"exploration":ex,"now":now}))["card"].clone()}else{s["regional"].clone()};
    let context_cards: Vec<_>=contexts.iter().filter(|c| regional["sourceIds"].as_array().is_some_and(|a|a.contains(&c["id"]))).cloned().collect();
    let selected: Vec<_>=items.iter().map(|r|r["resource"].clone()).collect(); let mut prep=rules::build_prep(start["readiness"].as_str(),&summary,ex,&selected,&problems);
    let mark=|p: &mut Value| { let done=p["id"].as_str().and_then(|id|s["prepDone"].get(id)).is_some_and(|v|v==true); p["done"]=json!(done); };
    mark(&mut prep["primary"]); if let Some(a)=prep["followUps"].as_array_mut(){for p in a {mark(p);}}
    let field=if s["fieldQ"]["sig"]==field_sig(s) {s["fieldQ"]["items"].clone()} else {json!(rule_field_questions(s,&summary))};
    let active=kstartup_resource::active_resources(resources,now);
    json!({"summary":summary,"regional":regional,"contexts":context_cards,"prep":prep,"resources":cards,"noMatchReason":rec["noMatchReason"],"coverageNote":rules::coverage_note(start["reviewRegion"].as_str(),&problems,&active,&contexts),"conditionNote":explore::CONDITION_NOTE,"fieldQuestions":field,"ranking":if relevance.as_object().is_some_and(|o|!o.is_empty()){ "ai" } else { "rule" }})
}
pub fn explore_stats(store: &Store<'_>) -> Value {
    let team: HashSet<String> = store.all_users().into_iter().filter(|u| u["isTeam"] == true).filter_map(|u| u["id"].as_str().map(str::to_owned)).collect();
    let rows = store.all_explores();
    let tally = |kind: &str| { let selected: Vec<_> = rows.iter().filter(|(id, s)| s["kind"] == kind && !team.contains(id)).map(|(_, s)| s).collect(); let feedback: Vec<_> = selected.iter().filter(|s| s.get("feedback").and_then(|f| f.get("helpful")).is_some()).collect(); let helpful = feedback.iter().filter(|s| s["feedback"]["helpful"] == true).count(); let count = |event: &str| selected.iter().filter(|s| s["events"][event].as_i64().unwrap_or(0) > 0).count(); let links: i64 = selected.iter().map(|s| s["events"]["resource_link"].as_i64().unwrap_or(0)).sum(); json!({"sessions":selected.len(),"chatDone":count("chat_done"),"resultReached":count("result"),"feedback":feedback.len(),"helpfulRate":if feedback.is_empty(){None}else{Some(helpful as f64 / feedback.len() as f64)},"resourceLinks":links}) };
    json!({"unit":"비회원은 기기(쿠키) 세션 1개, 회원은 계정 1개. 실제 사람 수가 아니에요.","guests":tally("guest"),"accounts":tally("user"),"limitHits":store.limit_hits()})
}
