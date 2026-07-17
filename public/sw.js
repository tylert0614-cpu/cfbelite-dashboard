const APP_NAME="CFBElite Social";
self.addEventListener("push",(event)=>{
  let payload={};
  try{payload=event.data?event.data.json():{};}catch{payload={body:event.data?.text()||"New league activity"};}
  const channel=payload.channel_name||payload.channel||payload.data?.channel_name||"CFBElite Social";
  const author=payload.author_name||payload.author||payload.data?.author_name||"League Update";
  const body=payload.body||payload.message||"You have a new league notification.";
  const title=payload.title||`${author} • ${channel}`;
  const options={
    body,
    icon:payload.icon||payload.avatar_url||"/cfbelite27-logo.png",
    badge:payload.badge||"/cfbelite27-logo.png",
    image:payload.image||undefined,
    tag:payload.tag||`${payload.type||"social"}-${payload.channel_id||channel}`,
    renotify:payload.renotify!==false,
    timestamp:payload.timestamp?new Date(payload.timestamp).getTime():Date.now(),
    vibrate:[160,70,160],
    requireInteraction:Boolean(payload.require_interaction),
    silent:Boolean(payload.silent),
    data:{url:payload.url||payload.target_url||payload.data?.url||"/",channel,author,...(payload.data||{})},
    actions:[{action:"open",title:"Open"},{action:"dismiss",title:"Dismiss"}],
  };
  event.waitUntil(self.registration.showNotification(title,options));
});
self.addEventListener("notificationclick",(event)=>{
  event.notification.close();
  if(event.action==="dismiss")return;
  const url=event.notification.data?.url||"/";
  event.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then((windows)=>{
    const exact=windows.find((client)=>client.url===new URL(url,self.location.origin).href);
    const app=exact||windows.find((client)=>client.url.startsWith(self.location.origin));
    if(app){return app.focus().then(()=>app.navigate(url));}
    return clients.openWindow(url);
  }));
});
