import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl=Deno.env.get("SUPABASE_URL")!;
const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const openaiKey=Deno.env.get("OPENAI_API_KEY")||"";
const model=Deno.env.get("OPENAI_NEWS_MODEL")||"gpt-5.6";
const supabase=createClient(supabaseUrl,serviceKey);
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};

const schema={
  type:"object",
  properties:{articles:{type:"array",minItems:1,maxItems:3,items:{type:"object",properties:{
    category:{type:"string",enum:["breaking","recap","rankings","preview","sportsbook","feature"]},
    headline:{type:"string"},dek:{type:"string"},body:{type:"string"}
  },required:["category","headline","dek","body"],additionalProperties:false}}},
  required:["articles"],additionalProperties:false
};

function outputText(payload:any){
  if(typeof payload?.output_text==="string")return payload.output_text;
  for(const item of payload?.output||[])for(const part of item?.content||[])if(part?.type==="output_text"&&typeof part.text==="string")return part.text;
  return "";
}

Deno.serve(async(req)=>{
  let job:any=null;
  try{
    if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
    if(req.method!=="POST")return new Response(JSON.stringify({ok:false,error:"Method not allowed"}),{status:405,headers:{...cors,"Content-Type":"application/json"}});
    if(!openaiKey)throw new Error("OPENAI_API_KEY is not configured");

    const authorization=req.headers.get("Authorization")||"";
    if(authorization.startsWith("Bearer ")){
      const token=authorization.slice(7);
      const {data:userData}=await supabase.auth.getUser(token);
      if(userData?.user){
        const {data:member}=await supabase.from("discord_users").select("is_commissioner,is_active,is_banned").eq("auth_user_id",userData.user.id).limit(1).maybeSingle();
        if(!member?.is_commissioner||member.is_active===false||member.is_banned===true)throw new Error("Commissioner access required");
      }
    }

    const {data:pending,error:jobError}=await supabase.from("league_news_jobs").select("*").eq("status","pending").order("created_at").limit(1).maybeSingle();
    if(jobError)throw jobError;
    if(!pending)return new Response(JSON.stringify({ok:true,processed:0,message:"No queued newsroom jobs"}),{headers:{...cors,"Content-Type":"application/json"}});
    const {data:claimed,error:claimError}=await supabase.from("league_news_jobs").update({status:"processing",attempts:Number(pending.attempts||0)+1,last_error:null}).eq("id",pending.id).eq("status","pending").select("*").maybeSingle();
    if(claimError)throw claimError;
    if(!claimed)return new Response(JSON.stringify({ok:true,processed:0,message:"Job was claimed by another worker"}),{headers:{...cors,"Content-Type":"application/json"}});
    job=claimed;

    const [teamResult,gameResult,standingResult,rankingResult]=await Promise.all([
      supabase.from("teams").select("id,name,abbreviation,conference"),
      supabase.from("game_results").select("id,season_year,week,team_1_id,team_2_id,team_1_score,team_2_score,team_1_rank,team_2_rank").eq("season_year",job.season_year).eq("week",job.week_label).order("created_at",{ascending:false}).limit(16),
      supabase.from("team_standings").select("*").limit(40),
      supabase.from("commissioner_rankings").select("rank,team_id").order("rank").limit(25)
    ]);
    const teams=teamResult.data||[];const names=new Map(teams.map((team:any)=>[String(team.id),team.name]));
    const games=(gameResult.data||[]).map((game:any)=>({
      id:game.id,week:game.week,team_1:names.get(String(game.team_1_id))||"Unknown",team_2:names.get(String(game.team_2_id))||"Unknown",
      team_1_score:game.team_1_score,team_2_score:game.team_2_score,team_1_rank:game.team_1_rank,team_2_rank:game.team_2_rank
    }));
    const standings=(standingResult.data||[]).slice(0,32);
    const rankings=(rankingResult.data||[]).map((row:any)=>({rank:row.rank,team:names.get(String(row.team_id))||"Unknown"}));
    const facts={event_type:job.job_type,season_year:job.season_year,week:job.week_label,source:job.source_payload,games,standings,commissioner_top_25:rankings};
    const instructions=`You are the CFB Elite 27 Newsroom, an energetic but credible college-football league reporter. Write only from supplied facts. Never invent scores, rankings, records, quotes, injuries, motives or events. If facts are sparse, write a concise preview explaining what is known. Use polished ESPN/Bleacher Report energy without imitating a specific writer. No gambling encouragement; sportsbook references are league points-game analysis only. Return one article for a game result or week advance and up to three distinct articles for a weekly digest. Keep each body between 120 and 450 words. Avoid profanity and personal attacks.`;
    const apiResponse=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Authorization":`Bearer ${openaiKey}`,"Content-Type":"application/json"},body:JSON.stringify({
      model,store:false,reasoning:{effort:"low"},instructions,input:`Create commissioner-review drafts from this verified league data:\n${JSON.stringify(facts)}`,
      text:{format:{type:"json_schema",name:"cfb_elite_newsroom",strict:true,schema}},max_output_tokens:2600
    })});
    const payload=await apiResponse.json();
    if(!apiResponse.ok)throw new Error(payload?.error?.message||`OpenAI request failed (${apiResponse.status})`);
    if(payload.status!=="completed")throw new Error(`OpenAI response was ${payload.status||"incomplete"}`);
    const raw=outputText(payload);if(!raw)throw new Error("OpenAI returned no newsroom text");
    const parsed=JSON.parse(raw);const articles=Array.isArray(parsed.articles)?parsed.articles:[];
    if(!articles.length)throw new Error("OpenAI returned no newsroom articles");
    const rows=articles.map((article:any)=>({job_id:job.id,season_year:job.season_year,week_label:job.week_label,category:article.category,headline:String(article.headline).slice(0,140),dek:String(article.dek||"").slice(0,280),body:String(article.body).slice(0,3600),factual_summary:facts,status:"draft",ai_model:model,ai_response_id:payload.id}));
    const {error:insertError}=await supabase.from("league_news_articles").insert(rows);if(insertError)throw insertError;
    await supabase.from("league_news_jobs").update({status:"completed",processed_at:new Date().toISOString()}).eq("id",job.id);
    return new Response(JSON.stringify({ok:true,processed:1,articles:rows.length,job_id:job.id}),{headers:{...cors,"Content-Type":"application/json"}});
  }catch(error){
    if(job?.id)await supabase.from("league_news_jobs").update({status:"failed",last_error:error instanceof Error?error.message:String(error),processed_at:new Date().toISOString()}).eq("id",job.id);
    return new Response(JSON.stringify({ok:false,error:error instanceof Error?error.message:String(error)}),{status:500,headers:{...cors,"Content-Type":"application/json"}});
  }
});
