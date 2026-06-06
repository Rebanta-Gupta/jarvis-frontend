// ── ORB WEBGL SHADER ──────────────────────────────────────────────────────
// Standalone module. Call initOrb() after DOM is ready.
// Exports: initOrb, setOrbState, orbRenderingEnabled (writable)

const ORB_STATES = {
  idle:      { hue: 0,  hoverI: 0.05, hover: 0,   timeScale: 0.5, label: 'Idle',      sub: 'Say "Hey Jarvis"' },
  listening: { hue: 0,  hoverI: 0.2,  hover: 1.0, timeScale: 1.0, label: 'Listening', sub: 'Go ahead...' },
  thinking:  { hue: 0,  hoverI: 0.2,  hover: 0.8, timeScale: 1.8, label: 'Thinking',  sub: 'Just a moment...' },
  speaking:  { hue: 40, hoverI: 0.25, hover: 1.0, timeScale: 1.3, label: 'Speaking',  sub: '' },
};

let orbRenderingEnabled = true;
let _orbRafId = null;
let _gl = null;
let _uTime, _uRes, _uHue, _uHover, _uRot, _uHoverI, _uBg;
let _curHue = 0, _tgtHue = 0;
let _curHover = 0, _tgtHover = 0;
let _curHoverI = 0.05, _tgtHoverI = 0.05;
let _curRot = 0;
let _timeScale = 0.5, _simT = 0, _lastT = 0;

const VERT = `precision highp float;
attribute vec2 position; attribute vec2 uv; varying vec2 vUv;
void main(){ vUv=uv; gl_Position=vec4(position,0.,1.); }`;

const FRAG = `precision highp float;
uniform float iTime; uniform vec3 iResolution; uniform float hue;
uniform float hover; uniform float rot; uniform float hoverIntensity;
uniform vec3 backgroundColor; varying vec2 vUv;
vec3 rgb2yiq(vec3 c){return vec3(dot(c,vec3(.299,.587,.114)),dot(c,vec3(.596,-.274,-.322)),dot(c,vec3(.211,-.523,.312)));}
vec3 yiq2rgb(vec3 c){return vec3(c.x+.956*c.y+.621*c.z,c.x-.272*c.y-.647*c.z,c.x-1.106*c.y+1.703*c.z);}
vec3 adjustHue(vec3 col,float h){float r=h*3.14159/180.;vec3 y=rgb2yiq(col);float ca=cos(r),sa=sin(r);return yiq2rgb(vec3(y.x,y.y*ca-y.z*sa,y.y*sa+y.z*ca));}
vec3 hash33(vec3 p){p=fract(p*vec3(.1031,.11369,.13787));p+=dot(p,p.yxz+19.19);return -1.+2.*fract(vec3(p.x+p.y,p.x+p.z,p.y+p.z)*p.zyx);}
float snoise3(vec3 p){const float K1=.333333,K2=.166667;vec3 i=floor(p+(p.x+p.y+p.z)*K1);vec3 d0=p-(i-(i.x+i.y+i.z)*K2);vec3 e=step(vec3(0.),d0-d0.yzx);vec3 i1=e*(1.-e.zxy);vec3 i2=1.-e.zxy*(1.-e);vec3 d1=d0-(i1-K2);vec3 d2=d0-(i2-K1);vec3 d3=d0-.5;vec4 h=max(.6-vec4(dot(d0,d0),dot(d1,d1),dot(d2,d2),dot(d3,d3)),0.);vec4 n=h*h*h*h*vec4(dot(d0,hash33(i)),dot(d1,hash33(i+i1)),dot(d2,hash33(i+i2)),dot(d3,hash33(i+1.)));return dot(vec4(31.316),n);}
vec4 extractAlpha(vec3 c){float a=max(max(c.r,c.g),c.b);return vec4(c/(a+1e-5),a);}
const vec3 bc1=vec3(.611765,.262745,.996078),bc2=vec3(.298039,.760784,.913725),bc3=vec3(.062745,.078431,.6);
const float innerRadius=.6,noiseScale=.65;
float light1(float i,float a,float d){return i/(1.+d*a);}
float light2(float i,float a,float d){return i/(1.+d*d*a);}
vec4 draw(vec2 uv){
  vec3 c1=adjustHue(bc1,hue),c2=adjustHue(bc2,hue),c3=adjustHue(bc3,hue);
  float ang=atan(uv.y,uv.x),len=length(uv),inv=len>0.?1./len:0.;
  float bgL=dot(backgroundColor,vec3(.299,.587,.114));
  float n0=snoise3(vec3(uv*noiseScale,iTime*.5))*.5+.5;
  float r0=mix(mix(innerRadius,1.,.4),mix(innerRadius,1.,.6),n0);
  float d0=distance(uv,(r0*inv)*uv);
  float v0=light1(1.,10.,d0)*smoothstep(r0*1.05,r0,len)*mix(smoothstep(r0*.8,r0*.95,len),1.,bgL*.7);
  float cl=cos(ang+iTime*2.)*.5+.5;
  float a2=iTime*-1.;
  float d=distance(uv,vec2(cos(a2),sin(a2))*r0);
  float v1=light2(1.5,5.,d)*light1(1.,50.,d0);
  float v2=smoothstep(1.,mix(innerRadius,1.,n0*.5),len);
  float v3=smoothstep(innerRadius,mix(innerRadius,1.,.5),len);
  vec3 cb=mix(c1,c2,cl);
  vec3 dk=clamp((mix(c3,cb,v0)+v1)*v2*v3,0.,1.);
  vec3 lk=clamp(mix(backgroundColor,(cb+v1)*mix(1.,v2*v3,mix(1.,.1,bgL)),v0),0.,1.);
  return extractAlpha(mix(dk,lk,bgL));
}
void main(){
  vec2 center=iResolution.xy*.5; float size=min(iResolution.x,iResolution.y);
  vec2 uv=(vUv*iResolution.xy-center)/size*2.;
  float s=sin(rot),c=cos(rot);
  uv=vec2(c*uv.x-s*uv.y,s*uv.x+c*uv.y);
  uv.x+=hover*hoverIntensity*.1*sin(uv.y*10.+iTime);
  uv.y+=hover*hoverIntensity*.1*sin(uv.x*10.+iTime);
  vec4 col=draw(uv);
  gl_FragColor=vec4(col.rgb*col.a,col.a);
}`;

function _mkShader(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  return s;
}

function _mkBuf(gl, data, attr, size, prog) {
  const b = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, attr);
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
}

function _lerp(a, b, k) { return a + (b - a) * k; }

function _orbFrame(ts) {
  _orbRafId = requestAnimationFrame(_orbFrame);
  if (!orbRenderingEnabled) return;

  const dt = Math.min((ts - _lastT) * 0.001, 0.05);
  _lastT = ts;

  _curHue    = _lerp(_curHue,    _tgtHue,    0.03);
  _curHover  = _lerp(_curHover,  _tgtHover,  0.04);
  _curHoverI = _lerp(_curHoverI, _tgtHoverI, 0.03);
  if (_tgtHover > 0.5) _curRot += dt * 0.3;
  _simT += dt * _timeScale;

  const gl = _gl;
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.uniform1f(_uTime,  _simT);
  gl.uniform1f(_uHue,   _curHue);
  gl.uniform1f(_uHover, _curHover);
  gl.uniform1f(_uRot,   _curRot);
  gl.uniform1f(_uHoverI, _curHoverI);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function initOrb() {
  const canvas = document.getElementById('orbCanvas');
  if (!canvas) return;

  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false });
  if (!gl) { console.warn('[Orb] WebGL not supported'); return; }
  _gl = gl;

  gl.clearColor(0, 0, 0, 0);

  const prog = gl.createProgram();
  gl.attachShader(prog, _mkShader(gl, gl.VERTEX_SHADER,   VERT));
  gl.attachShader(prog, _mkShader(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  gl.useProgram(prog);

  _mkBuf(gl, new Float32Array([-1,-1, 3,-1, -1,3]), 'position', 2, prog);
  _mkBuf(gl, new Float32Array([ 0, 0, 2, 0,  0,2]), 'uv',       2, prog);

  _uTime  = gl.getUniformLocation(prog, 'iTime');
  _uRes   = gl.getUniformLocation(prog, 'iResolution');
  _uHue   = gl.getUniformLocation(prog, 'hue');
  _uHover = gl.getUniformLocation(prog, 'hover');
  _uRot   = gl.getUniformLocation(prog, 'rot');
  _uHoverI= gl.getUniformLocation(prog, 'hoverIntensity');
  _uBg    = gl.getUniformLocation(prog, 'backgroundColor');

  gl.uniform3f(_uBg, 0, 0, 0);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  // Sync resolution uniform to actual canvas size
  function syncRes() {
    const size = canvas.offsetWidth || canvas.width;
    canvas.width  = size;
    canvas.height = size;
    gl.viewport(0, 0, size, size);
    gl.uniform3f(_uRes, size, size, 1);
  }
  syncRes();
  window.addEventListener('resize', syncRes);

  setOrbState('idle');
  requestAnimationFrame(_orbFrame);
}

function setOrbState(s) {
  const st = ORB_STATES[s];
  if (!st) return;
  _tgtHue    = st.hue;
  _tgtHover  = st.hover;
  _tgtHoverI = st.hoverI;
  _timeScale = st.timeScale;
  const label = document.getElementById('orbLabel');
  const sub   = document.getElementById('orbSub');
  if (label) label.textContent = st.label;
  if (sub)   sub.textContent   = st.sub;
}