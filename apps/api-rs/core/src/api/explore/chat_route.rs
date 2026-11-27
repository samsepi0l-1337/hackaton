//! TS 원본: apps/api/src/explore/routes.ts (POST /api/explore/chat)
use crate::api::{ai::solar::create_text_ai, app::common::{bad,bad_fields}, explore::{ai::{ExploreAi,Limiter}, chat::{self,MAX_QUESTIONS}, quota::{quota_config,quota_keys,quota_status,record_consult,limit_message,exempt_quota}, state::{actor_id, ai_context_for, bump, local_tasks, new_exploration, open, save, touch, user_texts}}, store::Store};
use crate::app::Cx;
use crate::http::{HResult,HttpError,Req,Resp};
use crate::jsstr::{iso,js_trim,len16,parse_ms};
use crate::shared::explore_rules::validate_start;
use serde_json::{json,Value};

async fn ask(s: &mut Value, ai: &mut ExploreAi<'_>, key: &str, last: &str, at: &str, resources: &[Value]) -> bool {
    let focused = (key == "focus").then(|| resources.iter().find(|r| r["id"] == s["start"]["focusResourceId"])).flatten();
    let text = match (key, focused) {
        ("focus", Some(r)) => format!("‘{}’ 공고를 보고 오셨네요. 이 지원을 받는다면 무엇부터 해 보고 싶으세요?", r["title"].as_str().unwrap_or("")),
        ("region", _) => chat::region_question(&s["start"]),
        ("more", _) => follow_up(s).to_owned(),
        _ => chat::question(key).unwrap_or("").to_owned(),
    };
    let (question,failed)=ai.question(&text,last).await;
    let message=json!({"role":"mentor","text":question,"at":at,"questionIndex":s["questionIndex"]});
    if let Some(a)=s["messages"].as_array_mut(){a.push(message);} failed
}
fn follow_up(s: &Value) -> &'static str {
    let count = s["plan"].as_array().into_iter().flatten().filter(|k| *k == "more").count();
    chat::FOLLOW_UPS[count.saturating_sub(1) % chat::FOLLOW_UPS.len()]
}
fn plan_len(s: &Value) -> usize { s["plan"].as_array().map(Vec::len).filter(|n| *n > 0).unwrap_or(MAX_QUESTIONS) }
pub async fn chat(cx: &mut Cx<'_>, req: &Req) -> HResult {
    let id=actor_id(cx)?; let b=req.json_or_empty(); let cfg=quota_config(cx.opts.consult_limit); let keys=quota_keys(cx.user.as_ref());
    let exempt=cx.user.as_ref().is_some_and(|u|u["isTeam"]==true);
    let mut s=open(cx,&id)?; let errors=validate_start(&s["start"]);
    if !errors.is_empty(){return Err(bad_fields("시작 정보를 먼저 입력해 주세요",json!(errors)));}
    let message=js_trim(b.get("message").and_then(Value::as_str).unwrap_or(""));
    if len16(message)>1000 {return Err(bad("메시지는 1000자 이하로 써 주세요"));}
    let skip=b.get("skip")==Some(&json!(true)); let unknown=b.get("unknown")==Some(&json!(true)); let finish=b.get("finish")==Some(&json!(true)); let want=b.get("wantSuggestions")==Some(&json!(true)); let more=b.get("more")==Some(&json!(true));
    let has_answer=!message.is_empty()||skip||unknown; let index=s["questionIndex"].as_u64().unwrap_or(0) as usize;
    let sig=json!([message,skip,unknown]).to_string();
    let duplicate=has_answer && (b.get("questionIndex").and_then(Value::as_f64).is_some_and(|n|n < index as f64) || (!message.is_empty() && s["lastBody"]["sig"]==sig && s["lastBody"]["at"].as_str().and_then(parse_ms).is_some_and(|t|cx.now-t<2000)));
    let done=s["finished"]==true||index>=plan_len(&s); let at=iso(cx.now);
    let opening=s["messages"].as_array().is_some_and(Vec::is_empty);
    if !exempt && (opening || more || (has_answer && !duplicate && !done)) {
        let mut quota=quota_status(&Store::new(cx.kv,cx.now),&keys,cx.now,cfg);
        if quota["blocked"]==true { Store::new(cx.kv,cx.now).add_limit_hit(); if let Some(o)=quota.as_object_mut(){o.remove("blocked");} return Err(HttpError::new(429,"limit",&limit_message(&quota,cfg)).with_quota(quota)); }
    }
    if more && (!done || plan_len(&s)>=chat::MAX_TOTAL_QUESTIONS) { return Err(HttpError::new(409,"conflict","더 이어서 이야기할 수 없어요")); }
    if more {
        let next=plan_len(&s);
        s["questionIndex"]=json!(next); s["finished"]=json!(false); s["step"]=json!("chat");
        if let Some(p)=s["plan"].as_array_mut(){p.push(json!("more"));}
        let text=follow_up(&s);
        if let Some(a)=s["messages"].as_array_mut(){a.push(json!({"role":"mentor","text":text,"at":at,"questionIndex":next}));}
    }
    let resources=crate::api::explore::state::resources_now(cx);
    let ctx=ai_context_for(cx,&id,&s,&resources);
    let raw=create_text_ai(cx.env,cx.ports); let mut limiter=Limiter::load(cx.opts.explore_ai_limit.unwrap_or(40) as usize,&cx.kv.scratch); let mut ai=ExploreAi{ai:&raw,limiter:&mut limiter,actor_id:&id,now:cx.now,local:local_tasks(req)}; let mut failed=false;
    if !more && !done && !duplicate {
        if s["messages"].as_array().is_some_and(Vec::is_empty) {
            s["counted"]=json!(true);
            if s["plan"].as_array().is_some_and(Vec::is_empty) {s["plan"]=json!(chat::plan_questions(&s["start"],&s["exploration"],s["answers"].as_array().map(Vec::as_slice).unwrap_or(&[])));}
            if let Some(a)=s["messages"].as_array_mut(){a.push(json!({"role":"mentor","text":chat::OPENING,"at":at}));}
            let key=s["plan"][0].as_str().unwrap_or("").to_owned(); failed |= ask(&mut s,&mut ai,&key,"",&at,&resources).await;
        }
        if has_answer {
            let key=s["plan"][index].as_str().unwrap_or("").to_owned(); let how=if unknown{"unknown"}else if skip&&message.is_empty(){"skipped"}else{"answered"};
            let answer_text=if how=="answered"{message}else if how=="unknown"{"아직 모르겠어요"}else{""};
            let mut item=json!({"role":"user","text":answer_text,"at":at,"questionIndex":index}); if how=="skipped"{item["skipped"]=json!(true);}
            if !exempt {record_consult(&mut Store::new(cx.kv,cx.now),&keys,cx.now,cfg).map_err(|_|bad("요청을 처리하지 못했어요"))?;}
            if let Some(a)=s["messages"].as_array_mut(){a.push(item);}
            if let Some(a)=s["answers"].as_array_mut(){a.push(json!({"key":key,"text":if how=="answered"{Some(message)}else{None},"how":how}));}
            s["questionIndex"]=json!(index+1); s["lastBody"]=json!({"sig":sig,"at":at});
            if key=="more" && !finish && plan_len(&s)<chat::MAX_TOTAL_QUESTIONS { if let Some(p)=s["plan"].as_array_mut(){p.push(json!("more"));} }
            if !finish && index+1<plan_len(&s) {let key=s["plan"][index+1].as_str().unwrap_or("").to_owned(); failed |= ask(&mut s,&mut ai,&key,message,&at,&resources).await;}
        }
        if finish||s["questionIndex"].as_u64().unwrap_or(0)>=plan_len(&s) as u64 {s["finished"]=json!(true);if let Some(a)=s["messages"].as_array_mut(){a.push(json!({"role":"mentor","text":chat::CLOSING,"at":at}));}bump(&mut s,"chat_done");s["step"]=json!("summary");} else {s["step"]=json!("chat");}
    }
    if want {
        let mut ex=if s["exploration"].is_null(){new_exploration()}else{s["exploration"].clone()};
        let rejected:Vec<String>=s["rejected"].as_array().into_iter().flatten().filter_map(Value::as_str).map(str::to_owned).collect();
        let (mut items, ai_failed)=ai.suggestions(&ctx,&user_texts(&s),&rejected).await; failed |= ai_failed;
        let mut avoid=rejected; avoid.extend(items.clone());items.extend(chat::rule_suggestions(&s["start"],&ex,&avoid,None));items.truncate(2);ex["suggestions"]=json!(items);
        if ex["directionStatus"]=="hold"||ex["directionStatus"]=="ai_suggested"{ex["directionStatus"]=json!("ai_suggested");}s["exploration"]=ex;
    }
    limiter.save(&mut cx.kv.scratch);
    touch(&mut s,cx.now);save(cx,&id,&s)?;
    let mut quota=if exempt {exempt_quota(cfg)} else {quota_status(&Store::new(cx.kv,cx.now),&keys,cx.now,cfg)};
    if let Some(o)=quota.as_object_mut(){o.remove("blocked");}
    Resp::ok(json!({"quota":quota,"maxQuestions":plan_len(&s),"messages":s["messages"],"questionIndex":s["questionIndex"],"done":s["finished"]==true||s["questionIndex"].as_u64().unwrap_or(0)>=plan_len(&s) as u64,"suggestions":s["exploration"]["suggestions"].as_array().cloned().unwrap_or_default(),"failed":failed}))
}
