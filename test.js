node -e "
import dotenv from 'dotenv';
dotenv.config();
const https = require('https');
const key = process.env.OPENAI_API_KEY;
const body = JSON.stringify({model:'gpt-4o-mini',max_tokens:10,messages:[{role:'user',content:'say hi'}]});
const req = https.request({hostname:'api.openai.com',path:'/v1/chat/completions',method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+key,'Content-Length':Buffer.byteLength(body)}},res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>console.log(d))});
req.write(body);req.end();
"