self.addEventListener("push",(event)=>{
  const payload=event.data?.json?.()||{};
  event.waitUntil(self.registration.showNotification(payload.title||"CFB Elite 27",{
    body:payload.body||"There is something new in the league.",
    icon:"/app-icon-192.png",
    badge:"/app-icon-192.png",
    tag:payload.tag||payload.type||"cfb-elite",
    renotify:Boolean(payload.renotify),
    data:{url:payload.url||"/",targetTab:payload.targetTab||null},
    vibrate:[90,45,90]
  }));
});
self.addEventListener("notificationclick",(event)=>{
  event.notification.close();
  const url=new URL(event.notification.data?.url||"/",self.location.origin).href;
  event.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then((windows)=>{
    const existing=windows.find((client)=>client.url.startsWith(self.location.origin));
    if(existing){existing.focus();existing.postMessage({type:"OPEN_TAB",tab:event.notification.data?.targetTab});return existing;}
    return clients.openWindow(url);
  }));
});
self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",(event)=>event.waitUntil(self.clients.claim()));
