// Water and lighting from the approved ocean preview.
export const reefFragmentShader = `precision highp float;
uniform sampler2D scene;
uniform vec2 resolution;
uniform vec2 imageSize;
uniform vec2 pointer;
uniform float time;
uniform float strength;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){
vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);
}
void main(){
vec2 uv=gl_FragCoord.xy/resolution;
float viewportAspect=resolution.x/resolution.y;
float imageAspect=imageSize.x/imageSize.y;
vec2 cover=vec2(min(1.,viewportAspect/imageAspect),min(1.,imageAspect/viewportAspect));
vec2 p=(uv-.5)*cover*.977+.5;
float openWater=(1.-smoothstep(.19,.49,abs(p.x-.5)))*smoothstep(.14,.52,p.y);
float surface=smoothstep(.65,1.,p.y);
// Waves travel across the surface; foreground rocks receive only tiny refraction.
vec2 travel=vec2(p.x-time*.022,p.y+time*.009);
vec2 flow=vec2(sin(travel.y*62.+time*.85+sin(travel.x*31.+time*.42)),cos(travel.x*53.-time*.7+sin(travel.y*42.+time*.48)));
float refractionMask=smoothstep(.22,.55,p.y);
p+=flow*(surface*.0048+openWater*.0015)*refractionMask*strength;
p+=pointer*vec2(.0025,.0016);
vec3 color=texture2D(scene,p).rgb;
// Reveal the seabed texture without moving or washing out foreground rocks.
float seabed=1.-smoothstep(.16,.46,p.y);
color*=1.+seabed*.24;
float depth=1.-uv.y;
float angle=atan((uv.x-.53-.045*sin(time*.27))*viewportAspect,depth+.23);
float ray=pow(.5+.5*sin(angle*32.+sin(angle*11.+time*.52)*1.8-time*.48),10.);
ray+=.45*pow(.5+.5*sin(angle*53.-time*.65),16.);
float light=exp(-depth*1.9)*(.78+.22*sin(time*.68+angle*9.));
// Soft shafts sweep independently of the static light in the source image.
color+=vec3(.12,.34,.45)*ray*light*.70*strength;
vec2 waterCoord=vec2(p.x*8.,p.y*13.)+vec2(-time*.20,time*.075);
float turbulence=noise(waterCoord)+.45*noise(waterCoord*2.1+time*.07);
float shimmer=pow(.5+.5*sin(turbulence*18.+p.y*24.-time*.9),12.);
float surfaceLight=smoothstep(.70,.99,p.y);
// Keep a few water rings close to the surface instead of covering the reef.
float shimmerGaps=smoothstep(.22,.65,noise(waterCoord*.55+vec2(5.,2.)));
color+=vec3(.15,.42,.48)*shimmer*surfaceLight*mix(.45,1.,shimmerGaps)*.31*strength;
// Broad translucent currents make lateral flow visible below the surface too.
float currentPhase=uv.y*19.+uv.x*4.5-time*.72+noise(vec2(uv.x*4.-time*.12,uv.y*3.))*3.;
float current=pow(.5+.5*sin(currentPhase),9.);
float centerQuiet=1.-.55*(1.-smoothstep(.15,.42,abs(uv.x-.5)))*(1.-smoothstep(.15,.38,abs(uv.y-.52)));
color+=vec3(.035,.13,.17)*current*sin(depth*3.14159)*centerQuiet*.44*strength;
color*=1.+sin(time*.65+p.x*7.+turbulence)*.045*strength;
gl_FragColor=vec4(color,1.);
}`;
