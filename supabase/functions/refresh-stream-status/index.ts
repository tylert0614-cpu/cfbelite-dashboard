import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders={"Content-Type":"application/json","Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
const supabase=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function appToken(url:string,clientId?:string,clientSecret?:string){
  if(!clientId||!clientSecret)return null;
  const body=new URLSearchParams({client_id:clientId,client_secret:clientSecret,grant_type:"client_credentials"});
  const response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body});
  if(!response.ok)throw new Error(`Token request failed (${response.status})`);
  return (await response.json()).access_token as string;
}

function platformChannelSlug(profile:any,platform:string){
  const raw=String(profile.channel_key||profile.channel_url||"").trim();
  if(!raw)return "";
  try{
    const url=new URL(/^https?:\/\//i.test(raw)?raw:`https://${raw}`);
    if(url.hostname.toLowerCase().includes(`${platform}.`))return decodeURIComponent(url.pathname.split("/").filter(Boolean)[0]||"").replace(/^@/,"");
  }catch{/* The value is already a channel name rather than a URL. */}
  return raw.replace(/^@/,"").replace(/^\/+|\/+$/g,"").split(/[/?#]/)[0];
}

function youtubeHint(profile:any){
  const raw=String(profile.channel_key||profile.channel_url||"").trim();
  const channelMatch=raw.match(/(?:youtube\.com\/channel\/)?(UC[\w-]{20,})/i);
  if(channelMatch)return {channelId:channelMatch[1],handle:null,username:null};
  const handleMatch=raw.match(/(?:youtube\.com\/)?@([\w.-]+)/i);
  if(handleMatch)return {channelId:null,handle:handleMatch[1],username:null};
  const userMatch=raw.match(/youtube\.com\/(?:user|c)\/([\w.-]+)/i);
  if(userMatch)return {channelId:null,handle:null,username:userMatch[1]};
  if(raw.startsWith("@"))return {channelId:null,handle:raw.slice(1),username:null};
  return {channelId:null,handle:null,username:raw.replace(/^\/+|\/+$/g,"")};
}

async function resolveYoutubeChannel(profile:any,key:string,previous:any){
  const resolvedKey=`${String(profile.channel_key||"").trim()}|${String(profile.channel_url||"").trim()}`;
  if(previous?.youtube_channel_id&&previous?.youtube_uploads_playlist_id&&previous?.youtube_resolved_key===resolvedKey){
    return {channelId:previous.youtube_channel_id,uploadsPlaylistId:previous.youtube_uploads_playlist_id,resolvedKey};
  }
  const hint=youtubeHint(profile);
  const parameter=hint.channelId?`id=${encodeURIComponent(hint.channelId)}`:hint.handle?`forHandle=${encodeURIComponent(hint.handle)}`:`forUsername=${encodeURIComponent(hint.username||"")}`;
  const response=await fetch(`https://www.googleapis.com/youtube/v3/channels?part=id,contentDetails&${parameter}&maxResults=1&key=${encodeURIComponent(key)}`);
  if(!response.ok)throw new Error(`YouTube channel lookup returned ${response.status}`);
  const channel=(await response.json()).items?.[0];
  const channelId=channel?.id;
  const uploadsPlaylistId=channel?.contentDetails?.relatedPlaylists?.uploads;
  if(!channelId)throw new Error("YouTube channel was not found. Use the channel ID beginning with UC or the @handle.");
  if(!uploadsPlaylistId)throw new Error("YouTube uploads playlist was not available for this channel.");
  return {channelId:String(channelId),uploadsPlaylistId:String(uploadsPlaylistId),resolvedKey};
}

async function youtubeLiveStatus(profile:any,key:string,previous:any){
  const resolved=await resolveYoutubeChannel(profile,key,previous);
  const playlistResponse=await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${encodeURIComponent(resolved.uploadsPlaylistId)}&maxResults=10&key=${encodeURIComponent(key)}`);
  if(!playlistResponse.ok)throw new Error(`YouTube uploads lookup returned ${playlistResponse.status}`);
  const videoIds=((await playlistResponse.json()).items||[]).map((item:any)=>item.contentDetails?.videoId).filter(Boolean);
  if(!videoIds.length)return {...resolved,video:null};
  const videoResponse=await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails&id=${encodeURIComponent(videoIds.join(","))}&key=${encodeURIComponent(key)}`);
  if(!videoResponse.ok)throw new Error(`YouTube video lookup returned ${videoResponse.status}`);
  const videos=(await videoResponse.json()).items||[];
  const video=videos.find((item:any)=>item.snippet?.liveBroadcastContent==="live"||(item.liveStreamingDetails?.actualStartTime&&!item.liveStreamingDetails?.actualEndTime));
  return {...resolved,video:video||null};
}

Deno.serve(async(request)=>{
  if(request.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
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
      const {data:previous}=await supabase.from("live_stream_status").select("is_live,youtube_channel_id,youtube_uploads_playlist_id,youtube_resolved_key").eq("profile_id",profile.id).maybeSingle();
      let status:any={profile_id:profile.id,is_live:false,viewer_count:0,checked_at:new Date().toISOString(),last_error:null};
      try{
        if(profile.platform==="twitch"){
          if(!twitchToken||!twitchClientId)throw new Error("Twitch credentials are not configured");
          const twitchSlug=platformChannelSlug(profile,"twitch");
          if(!twitchSlug)throw new Error("Twitch channel name is missing");
          const response=await fetch(`https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(twitchSlug)}`,{headers:{Authorization:`Bearer ${twitchToken}`,"Client-Id":twitchClientId}});
          if(!response.ok)throw new Error(`Twitch returned ${response.status}`);const stream=(await response.json()).data?.[0];
          if(stream)status={...status,is_live:true,stream_title:stream.title,category_name:stream.game_name,thumbnail_url:String(stream.thumbnail_url||"").replace("{width}","640").replace("{height}","360"),viewer_count:stream.viewer_count||0,started_at:stream.started_at};
        }else if(profile.platform==="youtube"){
          if(!youtubeKey)throw new Error("YouTube API key is not configured");
          const youtube=await youtubeLiveStatus(profile,youtubeKey,previous);
          status={...status,youtube_channel_id:youtube.channelId,youtube_uploads_playlist_id:youtube.uploadsPlaylistId,youtube_resolved_key:youtube.resolvedKey};
          const video=youtube.video;
          if(video)status={...status,is_live:true,stream_title:video.snippet?.title,thumbnail_url:video.snippet?.thumbnails?.high?.url||video.snippet?.thumbnails?.medium?.url,live_video_id:video.id,viewer_count:Number(video.liveStreamingDetails?.concurrentViewers||0),started_at:video.liveStreamingDetails?.actualStartTime||video.snippet?.publishedAt};
        }else if(profile.platform==="kick"){
          if(!kickToken)throw new Error("Kick credentials are not configured");
          const kickSlug=platformChannelSlug(profile,"kick");
          if(!kickSlug)throw new Error("Kick channel name is missing");
          const response=await fetch(`https://api.kick.com/public/v1/channels?slug=${encodeURIComponent(kickSlug)}`,{headers:{Authorization:`Bearer ${kickToken}`,Accept:"application/json"}});
          if(!response.ok)throw new Error(`Kick returned ${response.status}`);const channel=(await response.json()).data?.[0];
          const stream=channel?.stream;
          if(stream?.is_live)status={...status,is_live:true,stream_title:channel.stream_title,category_name:channel.category?.name,thumbnail_url:stream.thumbnail,viewer_count:stream.viewer_count||0,started_at:stream.start_time};
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
