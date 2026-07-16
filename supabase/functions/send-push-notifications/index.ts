import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const supabase=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const publicKey=Deno.env.get("VAPID_PUBLIC_KEY")!;
const privateKey=Deno.env.get("VAPID_PRIVATE_KEY")!;
webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT")||"mailto:commissioner@example.com",publicKey,privateKey);

Deno.serve(async()=>{
  try{
    if(!publicKey||!privateKey)throw new Error("VAPID keys are not configured");
    const {data:notifications,error}=await supabase.from("app_notifications").select("*").is("push_sent_at",null).gte("created_at",new Date(Date.now()-24*60*60*1000).toISOString()).order("created_at").limit(200);
    if(error)throw error;let delivered=0;let failed=0;
    for(const notification of notifications||[]){
      const [{data:preference},{data:subscriptions}]=await Promise.all([supabase.from("notification_preferences").select("push_enabled").eq("auth_user_id",notification.auth_user_id).maybeSingle(),supabase.from("push_subscriptions").select("*").eq("auth_user_id",notification.auth_user_id)]);
      if(preference?.push_enabled){
        for(const subscription of subscriptions||[]){
          try{await webpush.sendNotification({endpoint:subscription.endpoint,keys:{p256dh:subscription.p256dh,auth:subscription.auth_secret}},JSON.stringify({title:notification.title,body:notification.body,type:notification.notification_type,targetTab:notification.target_tab,url:"/"}));delivered++;}
          catch(pushError:any){failed++;if(pushError?.statusCode===404||pushError?.statusCode===410)await supabase.from("push_subscriptions").delete().eq("id",subscription.id);}
        }
      }
      await supabase.from("app_notifications").update({push_sent_at:new Date().toISOString()}).eq("id",notification.id);
    }
    return new Response(JSON.stringify({ok:true,notifications:notifications?.length||0,delivered,failed}),{headers:{"Content-Type":"application/json"}});
  }catch(error){return new Response(JSON.stringify({ok:false,error:error instanceof Error?error.message:String(error)}),{status:500,headers:{"Content-Type":"application/json"}});}
});
