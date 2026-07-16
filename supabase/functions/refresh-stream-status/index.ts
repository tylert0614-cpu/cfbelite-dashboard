import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders={"Content-Type":"application/json"};
const supabase=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function appToken(url:string,clientId?:string,clientSecret?:string){
  if(!clientId||!clientSecret)return null;
  const body=new URLSearchParams({client_id:clientId,client_secret:clientSecret,grant_type:"client_credentials"});
  const response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body});
  if(!response.ok)throw new Error(`Token request failed (${response.status})`);
  return (await response.json()).access_token as string;
}

Deno.serve(async()=>{
  try{
    const {data:profiles,error}=await supabase.from("stream_profiles").select("*").eq("enabled",true);
    if(error)throw error;
    const twitchProfiles=(profiles||[]).filter((row)=>row.platform==="twitch");
    const kickProfiles=(profiles||[]).filter((row)=>row.platform==="kick");
    const twitchClientId=Deno.env.get("TWITCH_CLIENT_ID");
    const twitchToken=twitchProfiles.length?await appToken("https://id.twitch.tv/oauth2/token",twitchClientId,Deno.env.get("TWITCH_CLIENT_SECRET")):null;
    const kickToken=kickProfiles.length?await appToken("https://id.kick.com/oauth/token",Deno.env.get("KICK_CLIENT_ID"),Deno.env.get("KICK_CLIENT_SECRET")):null;
    const youtubeKey=Deno.env.get("YOUTUBE_API_KEY");
    let checked=0;let live=0;let alerts=0;
    for(const profile of profiles||[]){
      const {data:previous}=await supabase.from("live_stream_status").select("is_live").eq("profile_id",profile.id).maybeSingle();
      let status:any={profile_id:profile.id,is_live:false,viewer_count:0,checked_at:new Date().toISOString(),last_error:null};
      try{
        if(profile.platform==="twitch"){
          if(!twitchToken||!twitchClientId)throw new Error("Twitch credentials are not configured");
          const response=await fetch(`https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(profile.channel_key)}`,{headers:{Authorization:`Bearer ${twitchToken}`,"Client-Id":twitchClientId}});
          if(!response.ok)throw new Error(`Twitch returned ${response.status}`);const stream=(await response.json()).data?.[0];
          if(stream)status={...status,is_live:true,stream_title:stream.title,category_name:stream.game_name,thumbnail_url:String(stream.thumbnail_url||"").replace("{width}","640").replace("{height}","360"),viewer_count:stream.viewer_count||0,started_at:stream.started_at};
        }else if(profile.platform==="youtube"){
          if(!youtubeKey)throw new Error("YouTube API key is not configured");
          const response=await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&eventType=live&channelId=${encodeURIComponent(profile.channel_key)}&maxResults=1&key=${encodeURIComponent(youtubeKey)}`);
          if(!response.ok)throw new Error(`YouTube returned ${response.status}`);const video=(await response.json()).items?.[0];
          if(video)status={...status,is_live:true,stream_title:video.snippet?.title,thumbnail_url:video.snippet?.thumbnails?.high?.url||video.snippet?.thumbnails?.medium?.url,live_video_id:video.id?.videoId,started_at:video.snippet?.publishedAt};
        }else if(profile.platform==="kick"){
          if(!kickToken)throw new Error("Kick credentials are not configured");
          const response=await fetch(`https://api.kick.com/public/v1/livestreams?broadcaster_user_id=${encodeURIComponent(profile.channel_key)}&limit=1`,{headers:{Authorization:`Bearer ${kickToken}`,Accept:"application/json"}});
          if(!response.ok)throw new Error(`Kick returned ${response.status}`);const stream=(await response.json()).data?.[0];
          if(stream)status={...status,is_live:true,stream_title:stream.stream_title,category_name:stream.category?.name,thumbnail_url:stream.thumbnail,viewer_count:stream.viewer_count||0,started_at:stream.started_at};
        }
      }catch(platformError){status.last_error=platformError instanceof Error?platformError.message:String(platformError);}
      await supabase.from("live_stream_status").upsert(status,{onConflict:"profile_id"});checked++;if(status.is_live)live++;
      if(status.is_live&&!previous?.is_live){
        const {data:channel}=await supabase.from("league_channels").select("id").eq("slug","streams").single();
        if(channel)await supabase.from("league_channel_messages").insert({channel_id:channel.id,author_discord_user_id:String(profile.discord_user_id),body:`${profile.display_name||"A league member"} is live now on ${String(profile.platform).toUpperCase()}: ${status.stream_title||"CFB Elite action"}`,message_type:"stream_live"});
        const [{data:recipients},{data:preferences}]=await Promise.all([supabase.from("discord_users").select("id,auth_user_id").not("auth_user_id","is",null).eq("is_active",true),supabase.from("notification_preferences").select("auth_user_id,streams_live")]);
        const preferenceMap=new Map((preferences||[]).map((row:any)=>[String(row.auth_user_id),row.streams_live]));
        const notifications=(recipients||[]).filter((row:any)=>preferenceMap.get(String(row.auth_user_id))!==false&&String(row.id)!==String(profile.discord_user_id)).map((row:any)=>({auth_user_id:row.auth_user_id,discord_user_id:String(row.id),notification_type:"stream_live",title:`${profile.display_name||"A coach"} is live`,body:status.stream_title||`Watch now on ${profile.platform}`,target_tab:"redZone",target_id:String(profile.id),actor_discord_user_id:String(profile.discord_user_id)}));
        if(notifications.length)await supabase.from("app_notifications").insert(notifications);alerts+=notifications.length;
      }
    }
    return new Response(JSON.stringify({ok:true,checked,live,alerts}),{headers:corsHeaders});
  }catch(error){return new Response(JSON.stringify({ok:false,error:error instanceof Error?error.message:String(error)}),{status:500,headers:corsHeaders});}
});
