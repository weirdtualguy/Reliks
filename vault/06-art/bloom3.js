cv.fill(cv.hsl(700,300,60));
for(let i=0;i<8;i++){cv.color(cv.hsl(560+i*50,420,90+i*26));cv.rect(0,i*128,1024,128)}
cv.sym(6,()=>{const x=rng.int(80,300),y=rng.int(200,480);cv.color(rng.pick([0xdc2828,0xff8fa3,0x7bd05f]));cv.line(512,512,512+x,512-y,rng.int(6,22));cv.circle(512+x,512-y,rng.int(10,40));if(rng.f()>.5)cv.ring(512+(x>>1),512-(y>>1),rng.int(20,60))});
cv.mirror(()=>{for(let i=0;i<14;i++){cv.color(rng.pick([0xf5f5f5,0xff8fa3,0x3aa0ff]));cv.dot(rng.int(60,440),rng.int(60,960),rng.int(4,14))}});
cv.color(0xf5f5f5);cv.ring(512,512,60+frame*40);
