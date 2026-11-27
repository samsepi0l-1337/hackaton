//! TS 원본: apps/api/src/explore/routes.ts (summary, result, conditions, prep, feedback)
use crate::api::{ai::{solar::create_text_ai,tasks::create_ai_tasks}, app::common::{bad,bad_fields,conditions_from_profile,mask_email}, explore::{ai::{ExploreAi,Limiter}, state::{actor_id,ai_context,ai_sig,bump,clean_edit,compute_result,conditions_text,field_sig,local_tasks,new_exploration,open,peek,rule_field_questions,sanitize_conditions,save,text,touch,user_texts}}, store::Store};
use crate::app::Cx;
use crate::http::{HResult,HttpError,Req,Resp};
use crate::jsstr::iso;
use crate::shared::{data,explore_rules as rules,likes::{self,LikeProfile}};
use serde_json::{json,Map,Value};

fn context(cx: &mut Cx<'_>, id: &str, resources: &[Value]) -> (Value, Option<LikeProfile>) {
    let store=Store::new(cx.kv,cx.now);
    let defaults=conditions_from_profile(&store.basic_profile(id)).unwrap_or(Value::Null);
    let ids=store.likes(id); let ids=ids.as_array().map(Vec::as_slice).unwrap_or(&[]);
    let liked:Vec<_>=resources.iter().filter(|r|ids.contains(&r["id"])).cloned().collect();
    (defaults,(!ids.is_empty()).then(||likes::like_profile(&liked)))
}
fn result(cx: &mut Cx<'_>, id: &str, s: &Value) -> Value {
    let resources=data::resources(); let (defaults,prefs)=context(cx,id,&resources); compute_result(s,cx.now,&resources,&defaults,prefs.as_ref())
}
fn summary(s: &Value) -> Value { if s["summary"].is_null(){rules::build_summary(&json!({"start":s["start"],"exploration":s["exploration"],"answers":s["answers"]}))}else{s["summary"].clone()} }
async fn rank(cx: &Cx<'_>, s: &Value, resources: &[Value], defaults: &Value, prefs: Option<&LikeProfile>, limiter: &mut Limiter, id: &str) -> Option<Value> {
    let tasks=create_ai_tasks(cx.env,cx.ports); if !tasks.decide_enabled || !limiter.allow(id,cx.now) {return None;}
    let start=&s["start"];let ex=&s["exploration"];
    let conditions=rules::merge_conditions(&start["conditions"],defaults);
    let pref=prefs.map(|p|json!({"count":p.count,"caps":{"$map":p.caps},"industries":{"$map":p.industries},"types":{"$map":p.types},"agencies":{"$map":p.agencies},"ids":{"$set":p.ids}})).unwrap_or(Value::Null);
    let input=json!({"readiness":start["readiness"],"problemId":ex["problemId"],"direction":ex["direction"],"reviewRegion":start["reviewRegion"],"conditions":conditions,"now":cx.now,"resources":resources,"likes":pref});
    let candidates=rules::decide_candidates(&input);if candidates.len()<2{return None;}
    let mut pieces=vec![ai_context(s)];
    if !s["summary"].is_null(){pieces.push(format!("도움받을 사람: {} / 해결해볼 불편: {}",s["summary"]["target"]["text"].as_str().unwrap_or(""),s["summary"]["value"]["text"].as_str().unwrap_or("")));}
    pieces.push(format!("접근 방향: {}",ex["direction"].as_str().unwrap_or("아직 탐색 중")));
    let cond=conditions_text(&conditions);if !cond.is_empty(){pieces.push(cond);}
    if prefs.is_some(){pieces.push(format!("관심 표시한 공고의 주제: {}",likes::like_topics(prefs).join(", ")));}
    let choices:Vec<_>=candidates.iter().map(|r|json!({"id":r["id"],"text":rules::decide_choice_text(r)})).collect();
    tasks.rank(&pieces.join("\n"),&choices,rules::DECIDE_INSTRUCTIONS).await
}
pub async fn post_summary(cx: &mut Cx<'_>, req: &Req) -> HResult {
    let id=actor_id(cx)?;let mut s=open(cx,&id)?;let errors=rules::validate_start(&s["start"]);if !errors.is_empty(){return Err(bad_fields("시작 정보를 먼저 입력해 주세요",json!(errors)));}
    let base=rules::build_summary(&json!({"start":s["start"],"exploration":s["exploration"],"answers":s["answers"]}));
    let raw=create_text_ai(cx.env,cx.ports);let mut limiter=Limiter::load(cx.opts.explore_ai_limit.unwrap_or(40) as usize,&cx.kv.scratch);let mut ai=ExploreAi{ai:&raw,limiter:&mut limiter,actor_id:&id,now:cx.now,local:local_tasks(req)};
    let ctx=ai_context(&s);let (fill,hypothesis,failed)=ai.fill(&ctx,&user_texts(&s),base["target"]["provenance"]=="unknown",base["value"]["provenance"]=="unknown").await;
    let summary=rules::build_summary(&json!({"start":s["start"],"exploration":s["exploration"],"answers":s["answers"],"aiFill":fill}));
    let regional=rules::build_regional(&json!({"start":s["start"],"exploration":s["exploration"],"now":cx.now,"aiHypothesis":hypothesis}))["card"].clone();
    let had=!s["summary"].is_null();let prep_reset=had&&s["prepDone"].as_object().is_some_and(|m|!m.is_empty());if had{s["prepDone"]=json!({});}s["summary"]=summary.clone();s["regional"]=regional.clone();
    let resources=data::resources();let (defaults,prefs)=context(cx,&id,&resources);let ranked=rank(cx,&s,&resources,&defaults,prefs.as_ref(),ai.limiter,&id).await;
    let mut input=json!({"readiness":s["start"]["readiness"],"problemId":s["exploration"]["problemId"],"direction":s["exploration"]["direction"],"reviewRegion":s["start"]["reviewRegion"],"conditions":rules::merge_conditions(&s["start"]["conditions"],&defaults),"now":cx.now,"resources":resources,"relevance":ranked});
    if let Some(p)=prefs.as_ref(){input["likes"]=json!({"count":p.count,"caps":{"$map":p.caps},"industries":{"$map":p.industries},"types":{"$map":p.types},"agencies":{"$map":p.agencies},"ids":{"$set":p.ids}});}
    let rec=rules::recommend_resources(&input);let mut reasons=Map::new();
    for r in rec["items"].as_array().into_iter().flatten(){let resource=&r["resource"];let rule=rules::reason_for(resource,s["start"]["readiness"].as_str(),r["linked"]==true);if let Some(t)=ai.reason(resource,&rule,&ctx).await{if let Some(id)=resource["id"].as_str(){reasons.insert(id.into(),json!(t));}}}
    limiter.save(&mut cx.kv.scratch);
    s["ai"]=json!({"sig":ai_sig(&s),"reasons":reasons,"rank":ranked});s["step"]=json!("summary");touch(&mut s,cx.now);save(cx,&id,&s)?;
    Resp::ok(json!({"summary":summary,"regional":regional,"prepReset":prep_reset,"failed":failed}))
}
pub async fn put_summary(cx: &mut Cx<'_>, req: &Req) -> HResult {
    let id=actor_id(cx)?;let b=req.json_object()?;let raw=b.get("summary").filter(|v|v.is_object()).ok_or_else(||bad("summary가 필요해요"))?;
    let mut s=open(cx,&id)?;let edit=clean_edit(raw);let applied=rules::apply_summary_edit(&summary(&s),&edit);let updated=applied["summary"].clone();let changed=applied["changed"]==true;s["summary"]=updated.clone();
    if changed {
        let exedit=&edit["exploration"];
        if exedit.get("direction").is_some()||exedit.get("reason").is_some(){let mut ex=if s["exploration"].is_null(){new_exploration()}else{s["exploration"].clone()};
            if exedit.get("reason").is_some(){ex["selectionReason"]=if updated["exploration"]["reason"]["provenance"]=="user"{updated["exploration"]["reason"]["text"].clone()}else{Value::Null};}
            if exedit.get("direction").is_some(){ex["direction"]=if updated["exploration"]["direction"]["provenance"]=="user"{updated["exploration"]["direction"]["text"].clone()}else{Value::Null};ex["directionStatus"]=json!(if ex["direction"].is_null(){"hold"}else{"user"});ex["suggestions"]=json!([]);}s["exploration"]=ex;}
        s["regional"]=rules::build_regional(&json!({"start":s["start"],"exploration":s["exploration"],"now":cx.now}))["card"].clone();s["ai"]=Value::Null;
    }
    let prep_reset=changed&&s["prepDone"].as_object().is_some_and(|o|!o.is_empty());if changed{s["prepDone"]=json!({});}touch(&mut s,cx.now);save(cx,&id,&s)?;
    Resp::ok(json!({"summary":updated,"regional":s["regional"],"prepReset":prep_reset}))
}
pub async fn get_result(cx: &mut Cx<'_>, req: &Req) -> HResult {
    let id=actor_id(cx)?;let saved=Store::new(cx.kv,cx.now).explore(&id).is_some();let mut s=peek(cx,&id);
    if saved{bump(&mut s,"result");s["step"]=json!("result");touch(&mut s,cx.now);}
    let mut limiter=Limiter::load(cx.opts.explore_ai_limit.unwrap_or(40) as usize,&cx.kv.scratch);
    if saved && !s["summary"].is_null() && (s["ai"]["sig"]!=ai_sig(&s)||s["ai"]["rank"].is_null()) {
        let resources=data::resources();let (defaults,prefs)=context(cx,&id,&resources);
        if let Some(r)=rank(cx,&s,&resources,&defaults,prefs.as_ref(),&mut limiter,&id).await{let reasons=if s["ai"]["sig"]==ai_sig(&s){s["ai"]["reasons"].clone()}else{json!({})};s["ai"]=json!({"sig":ai_sig(&s),"reasons":reasons,"rank":r});touch(&mut s,cx.now);}
    }
    let mut out=result(cx,&id,&s);
    if saved && s["fieldQ"]["sig"]!=field_sig(&s) && !local_tasks(req).contains("field") {
        let raw=create_text_ai(cx.env,cx.ports);let mut ai=ExploreAi{ai:&raw,limiter:&mut limiter,actor_id:&id,now:cx.now,local:local_tasks(req)};
        let (items,changed)=ai.field(&rule_field_questions(&s,&out["summary"]),&ai_context(&s)).await;if changed{s["fieldQ"]=json!({"sig":field_sig(&s),"items":items});out["fieldQuestions"]=json!(items);}
    }
    limiter.save(&mut cx.kv.scratch);
    if saved{save(cx,&id,&s)?;}Resp::ok(out)
}
pub async fn put_conditions(cx: &mut Cx<'_>, req: &Req) -> HResult {
    let id=actor_id(cx)?;let b=req.json_object()?;let conditions=b.get("conditions").filter(|v|v.is_object()).ok_or_else(||bad("conditions가 필요해요"))?;let mut s=open(cx,&id)?;
    if let Some(cond)=sanitize_conditions(conditions){s["start"]["conditions"]=cond;}else if let Some(o)=s["start"].as_object_mut(){o.remove("conditions");}
    s["regional"]=Value::Null;touch(&mut s,cx.now);save(cx,&id,&s)?;Resp::ok(result(cx,&id,&s))
}
pub async fn put_prep(cx: &mut Cx<'_>, req: &Req) -> HResult {
    let id=actor_id(cx)?;let b=req.json_object()?;let prep_id=b.get("id").and_then(Value::as_str).ok_or_else(||bad("id와 done이 필요해요"))?;let done=b.get("done").and_then(Value::as_bool).ok_or_else(||bad("id와 done이 필요해요"))?;let mut s=open(cx,&id)?;let prep=result(cx,&id,&s)["prep"].clone();
    if prep["primary"]["id"]!=prep_id&&!prep["followUps"].as_array().is_some_and(|a|a.iter().any(|v|v["id"]==prep_id)){return Err(HttpError::not_found("지금 준비 안내에 없는 항목이에요"));}
    s["prepDone"][prep_id]=json!(done);touch(&mut s,cx.now);save(cx,&id,&s)?;Resp::ok(json!({"prep":result(cx,&id,&s)["prep"]}))
}
fn pair(v: &Value) -> Option<Value> {
    let mut out=Map::new();for key in ["before","after"]{if let Some(n)=v.get(key).and_then(Value::as_f64).filter(|n|(1.0..=5.0).contains(n)){out.insert(key.into(),json!(n));}}
    (!out.is_empty()).then_some(Value::Object(out))
}
pub async fn post_feedback(cx: &mut Cx<'_>, req: &Req) -> HResult {
    let id=actor_id(cx)?;let b=req.json_object()?;let mut s=open(cx,&id)?;let mut feedback=Map::new();
    for key in ["helpful","directionClear","foundRegionalPath"]{if let Some(v)=b.get(key).filter(|v|v.is_boolean()){feedback.insert(key.into(),v.clone());}}
    for (key,max) in [("reason",500),("wantToExplore",500),("pathName",200)]{if let Some(t)=b.get(key).and_then(|v|text(v,max)){feedback.insert(key.into(),json!(t));}}
    for key in ["knowWhatToPrepare","regionIntent"]{if let Some(v)=b.get(key).and_then(pair){feedback.insert(key.into(),v);}}
    feedback.insert("at".into(),json!(iso(cx.now)));s["feedback"]=Value::Object(feedback);bump(&mut s,"feedback");touch(&mut s,cx.now);
    let f=&s["feedback"];let bytes=cx.ports.random_bytes(16);let mut bytes:Vec<u8>=bytes.into_iter().take(16).collect();bytes.resize(16,0);bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;let h=hex::encode(bytes);let fid=format!("fb-{}-{}-{}-{}-{}",&h[0..8],&h[8..12],&h[12..16],&h[16..20],&h[20..32]);
    let email=cx.user.as_ref().and_then(|u|u["email"].as_str()).map(mask_email).unwrap_or_default();
    let record=json!({"id":fid,"createdAt":f["at"],"user":email,"readiness":s["start"]["readiness"],"problemId":s["exploration"]["problemId"],"reviewRegion":s["start"]["reviewRegion"],"helpful":f["helpful"],"reason":f["reason"],"directionClear":f["directionClear"],"wantToExplore":f["wantToExplore"],"knowWhatToPrepare":f["knowWhatToPrepare"],"regionIntent":f["regionIntent"],"foundRegionalPath":f["foundRegionalPath"],"pathName":f["pathName"]});
    Store::new(cx.kv,cx.now).add_feedback(record).map_err(|_|bad("요청을 처리하지 못했어요"))?;save(cx,&id,&s)?;Resp::ok(json!({"ok":true}))
}
