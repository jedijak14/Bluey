import { chromium, expect } from '@playwright/test';
import packed from '@sparticuz/chromium';
const browser=await chromium.launch({executablePath:await packed.executablePath(),args:packed.args.filter(x=>!x.includes('disable-web-security') && !x.includes('single-process') && !x.includes('allow-running-insecure-content')),headless:true});
try {
 const page=await browser.newPage({viewport:{width:1320,height:900},reducedMotion:'reduce'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.bluey={connection:async()=>({endpoint:location.origin,token:'test'}),window:()=>{},onCommand:()=>()=>{}};});
 let channel;
 await page.routeWebSocket('**/api/ws',socket=>{channel=socket;socket.onMessage(raw=>{const p=JSON.parse(raw);if(p.type==='auth') socket.send(JSON.stringify({type:'ready'}));if(p.type==='mood')socket.send(JSON.stringify({type:'face',face:{mood:p.mood,gazeX:0,gazeY:0,talk:0}}));});});
 await page.route('**/api/config',route=>route.fulfill({json:{provider:'ollama',model:'test-model',base_url:'http://127.0.0.1:11434',setup_complete:true}}));
 await page.route('**/api/privacy',route=>route.fulfill({json:{computer_use:false,screen_recording:false,live_viewing:false}}));
 await page.goto(process.env.BLUEY_PREVIEW_URL || 'http://127.0.0.1:5173');
 await expect(page.getByRole('region',{name:'Windows companion dashboard'})).toBeVisible();
 await expect(page.getByText('Big ideas.',{exact:false})).toHaveCount(0);
 await expect(page.getByText('Engine connected',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Sleep',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Taking a little rest.'})).toBeVisible();
 await page.getByRole('button',{name:'Wake up',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Small companion. Real tools.'})).toBeVisible();
 await page.getByRole('button',{name:'On my screen Read, point, and explain'}).click();
 await expect(page.getByRole('textbox',{name:'Message Bluey'})).toHaveValue(/Ask before reading/);
 await page.screenshot({path:'artifacts/windows-dashboard.png'});
 expect(errors).toEqual([]);
 console.log('Native-specific dashboard, sleep/wake events, prompt actions and absence of web marketing hero passed (browser fixture).');
} finally {await browser.close();}
