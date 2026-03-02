import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useTheme } from "./ThemeContext";
import { generateQRMatrix } from "./qrEncoder";

// ─────────────────────────────────────────────────────────────────
//  QR VALUE BUILDERS
// ─────────────────────────────────────────────────────────────────
function buildQRValue(type, f) {
  switch (type) {
    case "url":    return f.url    || "https://example.com";
    case "text":   return f.text   || "Hello World";
    case "email":  return `mailto:${f.email||""}?subject=${encodeURIComponent(f.subject||"")}&body=${encodeURIComponent(f.body||"")}`;
    case "phone":  return `tel:${f.phone||""}`;
    case "sms":    return `SMSTO:${f.phone||""}:${f.message||""}`;
    case "wifi":   return `WIFI:T:${f.wifiSec||"WPA"};S:${f.ssid||""};P:${f.password||""};;`;
    case "vcard":  return `BEGIN:VCARD\nVERSION:3.0\nFN:${f.name||""}\nTEL:${f.phone||""}\nEMAIL:${f.email||""}\nORG:${f.org||""}\nURL:${f.url||""}\nEND:VCARD`;
    case "crypto": return `${f.cryptoType||"bitcoin"}:${f.walletAddress||""}${f.amount?`?amount=${f.amount}`:""}`;
    case "geo":    return `geo:${f.lat||""},${f.lng||""}`;
    case "event":  return `BEGIN:VEVENT\nSUMMARY:${f.eventTitle||""}\nDTSTART:${(f.dtstart||"").replace(/[-:T]/g,"")}\nDTEND:${(f.dtend||"").replace(/[-:T]/g,"")}\nLOCATION:${f.location||""}\nEND:VEVENT`;
    default:       return f.text || "";
  }
}

// ─────────────────────────────────────────────────────────────────
//  QR RENDERER  — draws onto a canvas from a boolean matrix
//  Finder patterns + timing + alignment are ALWAYS square (norm)
//  Custom shapes apply ONLY to data modules
// ─────────────────────────────────────────────────────────────────
function drawDataModule(ctx, shape, x, y, w, h) {
  const cx = x + w / 2, cy = y + h / 2, r = w / 2;
  switch (shape) {
    case "round":
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); break;
    case "dots":
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.72, 0, Math.PI * 2); ctx.fill(); break;
    case "diamond":
      ctx.beginPath();
      ctx.moveTo(cx, y); ctx.lineTo(x+w, cy); ctx.lineTo(cx, y+h); ctx.lineTo(x, cy);
      ctx.closePath(); ctx.fill(); break;
    case "rounded":
      ctx.beginPath(); ctx.roundRect(x, y, w, h, w * 0.3); ctx.fill(); break;
    case "extra-rounded":
      ctx.beginPath(); ctx.roundRect(x, y, w, h, w * 0.48); ctx.fill(); break;
    case "classy":
      ctx.beginPath(); ctx.roundRect(x, y, w, h, w * 0.15); ctx.fill(); break;
    default:
      ctx.fillRect(x, y, w, h);
  }
}

function renderQRToCanvas(canvas, matrix, opts) {
  const {
    size         = 500,
    moduleShape  = "square",
    fgColor      = "#000000",
    bgColor      = "#ffffff",
    gradient     = null,
    eyeColor     = null,
    logoSrc      = null,
    logoSize     = 0.22,
    logoBR       = 8,
    quietZone    = 4,
    cornerRadius = 0,
  } = opts;

  const N      = matrix.length;
  const ctx    = canvas.getContext("2d");
  canvas.width = canvas.height = size;

  // Clip canvas to corner radius
  ctx.save();
  if (cornerRadius > 0) {
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, cornerRadius);
    ctx.clip();
  }

  // Background
  const realBg = bgColor === "transparent" ? "#ffffff" : bgColor;
  if (bgColor === "transparent") ctx.clearRect(0, 0, size, size);
  else { ctx.fillStyle = bgColor; ctx.fillRect(0, 0, size, size); }

  // Module metrics
  const total = N + quietZone * 2;
  const mSz   = size / total;
  const off   = quietZone * mSz;
  const ec    = eyeColor || fgColor;

  // Gradient
  let dataFill = fgColor;
  if (gradient?.colors?.length >= 2) {
    try {
      const grd = gradient.type === "radial"
        ? ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size * 0.72)
        : ctx.createLinearGradient(0, 0, size, size);
      gradient.colors.forEach((col, i) => grd.addColorStop(i / (gradient.colors.length - 1), col));
      dataFill = grd;
    } catch (_) { dataFill = fgColor; }
  }

  // Build guard set — cells that must be drawn square
  const guardSet = new Set();

  // Finder patterns: top-left (0,0), top-right (0,N-7), bottom-left (N-7,0)
  [[0,0],[0,N-7],[N-7,0]].forEach(([fr,fc]) => {
    for (let dr = -1; dr <= 7; dr++)
      for (let dc = -1; dc <= 7; dc++) {
        const rr = fr+dr, cc = fc+dc;
        if (rr >= 0 && rr < N && cc >= 0 && cc < N) guardSet.add(`${rr},${cc}`);
      }
  });
  // Timing strips (row 6, col 6)
  for (let i = 8; i < N - 8; i++) { guardSet.add(`6,${i}`); guardSet.add(`${i},6`); }
  // Alignment patterns
  const ALIGN = {2:[18],3:[22],4:[26],5:[30],6:[34],7:[22,38],8:[24,42],9:[26,46],10:[28,50]};
  const aPos  = ALIGN[N < 25 ? 0 : Math.floor((N-17)/4)] || [];
  const aCentres = aPos.length ? [6,...aPos] : [];
  aCentres.forEach(ar => aCentres.forEach(ac => {
    if ((ar<9&&ac<9)||(ar<9&&ac>N-10)||(ar>N-10&&ac<9)) return;
    for (let dr=-2;dr<=2;dr++) for (let dc=-2;dc<=2;dc++) guardSet.add(`${ar+dr},${ac+dc}`);
  }));

  // ── Draw data modules (custom shape) ──
  ctx.fillStyle = dataFill;
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (!matrix[r][c]) continue;
      if (guardSet.has(`${r},${c}`)) continue;
      const pad = mSz * 0.06;
      drawDataModule(ctx, moduleShape, off+c*mSz+pad, off+r*mSz+pad, mSz-pad*2, mSz-pad*2);
    }
  }

  // ── Draw finder patterns — always perfect squares ──
  [[0,0],[0,N-7],[N-7,0]].forEach(([fr,fc]) => {
    const ox = off + fc * mSz, oy = off + fr * mSz, fw = mSz * 7;
    ctx.fillStyle = ec;     ctx.fillRect(ox,       oy,       fw,     fw    );  // outer
    ctx.fillStyle = realBg; ctx.fillRect(ox+mSz,   oy+mSz,   mSz*5,  mSz*5 );  // gap
    ctx.fillStyle = ec;     ctx.fillRect(ox+mSz*2, oy+mSz*2, mSz*3,  mSz*3 );  // inner
  });

  // ── Draw timing strips ──
  for (let i = 8; i < N - 8; i++) {
    const pad = mSz * 0.05;
    if (matrix[6][i]) { ctx.fillStyle=ec; ctx.fillRect(off+i*mSz+pad, off+6*mSz+pad, mSz-pad*2, mSz-pad*2); }
    if (matrix[i][6]) { ctx.fillStyle=ec; ctx.fillRect(off+6*mSz+pad, off+i*mSz+pad, mSz-pad*2, mSz-pad*2); }
  }

  // ── Draw alignment patterns ──
  aCentres.forEach(ar => aCentres.forEach(ac => {
    if ((ar<9&&ac<9)||(ar<9&&ac>N-10)||(ar>N-10&&ac<9)) return;
    const ox=off+(ac-2)*mSz, oy=off+(ar-2)*mSz;
    ctx.fillStyle=ec;     ctx.fillRect(ox,       oy,       mSz*5, mSz*5);
    ctx.fillStyle=realBg; ctx.fillRect(ox+mSz,   oy+mSz,   mSz*3, mSz*3);
    ctx.fillStyle=ec;     ctx.fillRect(ox+mSz*2, oy+mSz*2, mSz,   mSz  );
  }));

  ctx.restore();
  return logoSrc ? drawLogo(ctx, logoSrc, size, logoSize, logoBR, realBg) : Promise.resolve();
}

function drawLogo(ctx, logoSrc, size, logoSize, logoBR, realBg) {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => {
      const ls = size * Math.min(logoSize, 0.3);
      const lx = (size-ls)/2, ly = (size-ls)/2;
      ctx.save();
      ctx.beginPath(); ctx.roundRect(lx-6,ly-6,ls+12,ls+12,logoBR+4); ctx.fillStyle=realBg; ctx.fill();
      ctx.beginPath(); ctx.roundRect(lx,ly,ls,ls,logoBR); ctx.clip();
      ctx.drawImage(img,lx,ly,ls,ls);
      ctx.restore(); res();
    };
    img.onerror = res;
    img.src = logoSrc;
  });
}

// ─────────────────────────────────────────────────────────────────
//  3D BACKGROUND  — QR scan ring + floating grid
// ─────────────────────────────────────────────────────────────────
const THREEJS_CDN = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
const _scriptPromises = {};
function loadScript(src) {
  if (_scriptPromises[src]) return _scriptPromises[src];
  if (document.querySelector(`script[src="${src}"]`)) {
    _scriptPromises[src] = Promise.resolve();
    return _scriptPromises[src];
  }
  _scriptPromises[src] = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
  return _scriptPromises[src];
}

function QRBackground({ isDark }) {
  const mountRef = useRef();
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let animId;
    loadScript(THREEJS_CDN).then(() => {
      const THREE = window.THREE;
      if (!THREE || !mount) return;
      const W = window.innerWidth, H = window.innerHeight;
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(55, W/H, 0.1, 200);
      camera.position.set(0, 0, 22);
      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
      renderer.setSize(W, H);
      renderer.setClearColor(0x000000, 0);
      mount.appendChild(renderer.domElement);

      const ac = isDark ? 0x3b82f6 : 0x2563eb;
      const al = isDark ? 0x1e3a5f : 0xbfdbfe;
      const op = isDark ? 0.20 : 0.11;

      // Outer scan ring
      const ring1 = new THREE.Mesh(
        new THREE.TorusGeometry(7, 0.16, 16, 120),
        new THREE.MeshPhongMaterial({ color:ac, emissive:ac, emissiveIntensity:0.35, transparent:true, opacity:op })
      );
      scene.add(ring1);

      // Inner ring (90° rotated)
      const ring2 = new THREE.Mesh(
        new THREE.TorusGeometry(7, 0.08, 12, 80),
        new THREE.MeshPhongMaterial({ color:al, emissive:al, emissiveIntensity:0.2, transparent:true, opacity:op*0.55 })
      );
      ring2.rotation.x = Math.PI/2;
      scene.add(ring2);

      // Horizontal scan line (like a laser)
      const scanMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(15, 0.04),
        new THREE.MeshBasicMaterial({ color:ac, transparent:true, opacity:0.55, side:THREE.DoubleSide })
      );
      scene.add(scanMesh);

      // Floating dot grid (QR-module style)
      const dotGeo = new THREE.SphereGeometry(0.055, 6, 6);
      const dotMat = new THREE.MeshPhongMaterial({ color:ac, transparent:true, opacity:isDark?0.38:0.20 });
      const dots = [];
      for (let i=-9;i<=9;i+=2.8) for (let j=-9;j<=9;j+=2.8) {
        if (Math.random()>0.45) {
          const d = new THREE.Mesh(dotGeo, dotMat);
          d.position.set(i+(Math.random()-.5)*.6, j+(Math.random()-.5)*.6, -9+Math.random()*2);
          d.userData = { baseY:d.position.y, phase:Math.random()*Math.PI*2, spd:0.007+Math.random()*0.005 };
          scene.add(d); dots.push(d);
        }
      }

      // Corner bracket wireframes
      const edgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(3.0, 3.0, 0.06));
      const edgeMat = new THREE.LineBasicMaterial({ color:ac, transparent:true, opacity:op*1.5 });
      [[-9,6],[9,6],[-9,-6],[9,-6]].forEach(([tx,ty]) => {
        const l = new THREE.LineSegments(edgeGeo.clone(), edgeMat.clone());
        l.position.set(tx,ty,-5); scene.add(l);
      });

      scene.add(new THREE.AmbientLight(0xffffff, 0.5));
      const dl = new THREE.DirectionalLight(ac, 1.5); dl.position.set(5,10,8); scene.add(dl);

      const onResize = () => {
        renderer.setSize(window.innerWidth, window.innerHeight);
        camera.aspect = window.innerWidth/window.innerHeight;
        camera.updateProjectionMatrix();
      };
      window.addEventListener("resize", onResize);

      let t = 0;
      const animate = () => {
        animId = requestAnimationFrame(animate); t += 0.007;
        ring1.rotation.x = Math.sin(t*.35)*.3; ring1.rotation.y = t*.18;
        ring2.rotation.y = t*.13; ring2.rotation.z = Math.cos(t*.28)*.2;
        scanMesh.position.y = Math.sin(t*1.1)*6;
        scanMesh.material.opacity = 0.35 + 0.25*Math.abs(Math.cos(t*1.1));
        dots.forEach(d => { d.position.y = d.userData.baseY + Math.sin(t*d.userData.spd*10+d.userData.phase)*.45; });
        renderer.render(scene, camera);
      };
      animate();

      mount._dispose = () => {
        cancelAnimationFrame(animId);
        window.removeEventListener("resize", onResize);
        if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
        renderer.dispose();
      };
    }).catch(()=>{});
    return () => { mount._dispose?.(); mount._dispose = null; };
  }, [isDark]);

  return <div ref={mountRef} style={{ position:"fixed",inset:0,zIndex:0,pointerEvents:"none",overflow:"hidden" }} />;
}

// ─────────────────────────────────────────────────────────────────
//  UI PRIMITIVES
// ─────────────────────────────────────────────────────────────────
export function ThemeToggle() {
  const { theme, toggle, c } = useTheme();
  return (
    <button onClick={toggle} title="Toggle theme" style={{ position:"fixed",top:16,right:16,zIndex:400,width:40,height:40,borderRadius:"50%",background:c.card,border:`1px solid ${c.border}`,cursor:"pointer",fontSize:17,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 2px 10px ${c.shadow}`,transition:"background 0.3s,border-color 0.3s" }}>
      {theme==="dark"?"☀️":"🌙"}
    </button>
  );
}

const Card = ({ children, style: x={} }) => {
  const { c } = useTheme();
  return <div style={{ background:c.card,border:`1px solid ${c.border}`,borderRadius:14,padding:"15px 16px",boxShadow:`0 1px 4px ${c.shadow}`,transition:"background 0.3s,border-color 0.3s",...x }}>{children}</div>;
};
const Sec = ({children}) => { const {c}=useTheme(); return <p style={{margin:"0 0 11px",fontSize:10.5,fontWeight:700,color:c.textMuted,textTransform:"uppercase",letterSpacing:"0.1em"}}>{children}</p>; };
const Lbl = ({children}) => { const {c}=useTheme(); return <p style={{margin:"0 0 4px",fontSize:10.5,fontWeight:600,color:c.textMuted,textTransform:"uppercase",letterSpacing:"0.07em"}}>{children}</p>; };

const Inp = ({label,value,onChange,placeholder,type="text"}) => {
  const {c}=useTheme();
  return (
    <div style={{marginBottom:9}}>
      {label&&<Lbl>{label}</Lbl>}
      <input type={type} value={value} placeholder={placeholder} onChange={e=>onChange(e.target.value)}
        onFocus={e=>(e.target.style.borderColor=c.accent)} onBlur={e=>(e.target.style.borderColor=c.border)}
        style={{width:"100%",padding:"8px 11px",borderRadius:8,border:`1px solid ${c.border}`,background:c.input,color:c.text,fontSize:13,outline:"none",boxSizing:"border-box",transition:"border-color 0.15s"}} />
    </div>
  );
};
const Sel = ({label,value,onChange,options}) => {
  const {c}=useTheme();
  return (
    <div style={{marginBottom:9}}>
      {label&&<Lbl>{label}</Lbl>}
      <select value={value} onChange={e=>onChange(e.target.value)} style={{width:"100%",padding:"8px 11px",borderRadius:8,border:`1px solid ${c.border}`,background:c.input,color:c.text,fontSize:13,outline:"none",boxSizing:"border-box",cursor:"pointer"}}>
        {options.map(o=><option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
};
const Rng = ({label,value,onChange,min,max,unit=""}) => {
  const {c}=useTheme();
  return (
    <div style={{marginBottom:12}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
        <Lbl>{label}</Lbl>
        <span style={{fontSize:11,fontWeight:700,color:c.accent}}>{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} value={value} onChange={e=>onChange(+e.target.value)} style={{width:"100%",accentColor:c.accent,cursor:"pointer"}} />
    </div>
  );
};
const Clr = ({label,value,onChange}) => {
  const {c}=useTheme();
  return (
    <div style={{flex:1,minWidth:0}}>
      <Lbl>{label}</Lbl>
      <div style={{display:"flex",gap:5,alignItems:"center"}}>
        <input type="color" value={value} onChange={e=>onChange(e.target.value)} style={{width:32,height:32,borderRadius:6,border:`1px solid ${c.border}`,padding:2,cursor:"pointer",background:c.input,flexShrink:0}} />
        <input type="text" value={value} onChange={e=>{if(/^#[0-9a-fA-F]{0,6}$/.test(e.target.value))onChange(e.target.value);}} style={{flex:1,padding:"5px 7px",borderRadius:6,border:`1px solid ${c.border}`,background:c.input,color:c.text,fontSize:11,fontFamily:"monospace",outline:"none",minWidth:0}} />
      </div>
    </div>
  );
};
const Chip = ({label,active,onClick}) => {
  const {c}=useTheme();
  const icons={url:"🔗",text:"📝",email:"✉️",phone:"📞",sms:"💬",wifi:"📶",vcard:"👤",crypto:"₿",geo:"📍",event:"📅"};
  return <button onClick={onClick} style={{padding:"5px 11px",borderRadius:7,cursor:"pointer",fontSize:11.5,fontWeight:500,border:`1px solid ${active?c.accent:c.border}`,background:active?c.accentSoft:"transparent",color:active?c.accent:c.textSub,transition:"all 0.15s",display:"flex",alignItems:"center",gap:4,whiteSpace:"nowrap"}}><span style={{fontSize:11}}>{icons[label]||"•"}</span>{label}</button>;
};
const ShapeBtn = ({id,label,active,onClick}) => {
  const {c}=useTheme();
  const sv={square:{borderRadius:2},rounded:{borderRadius:"28%"},"extra-rounded":{borderRadius:"50%"},round:{borderRadius:"50%"},dots:{borderRadius:"50%",transform:"scale(0.68)"},diamond:{transform:"rotate(45deg) scale(0.65)",borderRadius:2},classy:{borderRadius:"14%"}};
  return <button onClick={onClick} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5,padding:"9px 5px",borderRadius:9,cursor:"pointer",fontSize:10.5,fontWeight:600,border:`1.5px solid ${active?c.accent:c.border}`,background:active?c.accentSoft:"transparent",color:active?c.accent:c.textSub,transition:"all 0.15s"}}><span style={{display:"block",width:19,height:19,background:active?c.accent:c.textMuted,flexShrink:0,...(sv[id]||{})}} />{label}</button>;
};

function TypeFields({type,fields,onChange}) {
  const f=(k,l,p,t="text")=><Inp key={k} label={l} value={fields[k]||""} onChange={v=>onChange(k,v)} placeholder={p} type={t} />;
  const s=(k,l,opts)=><Sel key={k} label={l} value={fields[k]||opts[0]} onChange={v=>onChange(k,v)} options={opts} />;
  switch(type) {
    case "url":    return f("url","URL","https://example.com");
    case "text":   return f("text","Text","Your message…");
    case "email":  return <>{f("email","Email","you@example.com")}{f("subject","Subject","Hello")}{f("body","Body","…")}</>;
    case "phone":  return f("phone","Phone","+33612345678");
    case "sms":    return <>{f("phone","Phone","+33612345678")}{f("message","Message","SMS text")}</>;
    case "wifi":   return <>{f("ssid","Network","MyWifi")}{f("password","Password","••••")}{s("wifiSec","Security",["WPA","WEP","nopass"])}</>;
    case "vcard":  return <>{f("name","Full Name","Jean Dupont")}{f("phone","Phone","+336")}{f("email","Email","j@ex.com")}{f("org","Company","Acme")}{f("url","Website","https://")}</>;
    case "crypto": return <>{s("cryptoType","Currency",["bitcoin","ethereum","litecoin","monero","solana"])}{f("walletAddress","Wallet","1A1z…")}{f("amount","Amount","0.001")}</>;
    case "geo":    return <>{f("lat","Latitude","48.8566")}{f("lng","Longitude","2.3522")}</>;
    case "event":  return <>{f("eventTitle","Title","Team Meeting")}{f("dtstart","Start","","datetime-local")}{f("dtend","End","","datetime-local")}{f("location","Location","Paris")}</>;
    default:       return null;
  }
}

// ─────────────────────────────────────────────────────────────────
//  SCAN OVERLAY  (animated QR spinner while rendering)
// ─────────────────────────────────────────────────────────────────
function ScanOverlay() {
  const {c}=useTheme();
  const dots=[1,1,1,0,1,1,1,1,0,1,0,1,0,1,1,0,1,0,1,0,1,0,0,0,1,0,0,0,1,0,1,0,1,0,1,1,0,1,0,1,0,1,1,1,1,0,1,1,1];
  return (
    <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",background:`${c.card}cc`,backdropFilter:"blur(6px)",flexDirection:"column",gap:14,zIndex:10}}>
      <div style={{position:"relative",width:84,height:84}}>
        {[{top:0,left:0,borderTop:`2.5px solid ${c.accent}`,borderLeft:`2.5px solid ${c.accent}`},{top:0,right:0,borderTop:`2.5px solid ${c.accent}`,borderRight:`2.5px solid ${c.accent}`},{bottom:0,left:0,borderBottom:`2.5px solid ${c.accent}`,borderLeft:`2.5px solid ${c.accent}`},{bottom:0,right:0,borderBottom:`2.5px solid ${c.accent}`,borderRight:`2.5px solid ${c.accent}`}].map((s,i)=>(
          <div key={i} style={{position:"absolute",width:16,height:16,...s,borderRadius:2}} />
        ))}
        <div style={{position:"absolute",inset:10,display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:1.5,padding:2}}>
          {dots.map((v,i)=><div key={i} style={{borderRadius:1,background:v?c.accent:"transparent",opacity:v?.7:0,animation:v?`qrC ${1.1+(i%5)*.15}s ${(i%7)*.05}s ease-in-out infinite alternate`:"none"}} />)}
        </div>
        <div style={{position:"absolute",left:8,right:8,height:1.5,borderRadius:1,background:`linear-gradient(to right,transparent,${c.accent},transparent)`,boxShadow:`0 0 7px ${c.accent}`,animation:"sLn 1.5s ease-in-out infinite"}} />
      </div>
      <span style={{fontSize:11,color:c.textMuted,fontWeight:600,letterSpacing:"0.12em",textTransform:"uppercase",animation:"fT 1.5s ease-in-out infinite"}}>Generating…</span>
      <style>{`@keyframes sLn{0%{top:8px;opacity:0}8%{opacity:1}92%{opacity:1}100%{top:76px;opacity:0}}@keyframes qrC{from{opacity:.25;transform:scale(.8)}to{opacity:.8;transform:scale(1)}}@keyframes fT{0%,100%{opacity:.4}50%{opacity:1}}`}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
//  QR GENERATOR PAGE
// ─────────────────────────────────────────────────────────────────
export function QRGeneratorPage() {
  const {theme,c}=useTheme();
  const canvasRef=useRef();
  const debRef=useRef();
  const [rendering,setRendering]=useState(false);
  const [ready,setReady]=useState(false);
  const [errMsg,setErrMsg]=useState("");

  const [contentType,setContentType]=useState("url");
  const [fields,setFields]=useState({url:"https://example.com"});
  const upd=useCallback((k,v)=>setFields(f=>({...f,[k]:v})),[]);

  const [fgColor,    setFg]     =useState("#000000");
  const [bgColor,    setBg]     =useState("#ffffff");
  const [bgTransp,   setTransp] =useState(false);
  const [eyeColor,   setEye]    =useState("#000000");
  const [moduleShape,setShape]  =useState("square");
  const [cornerR,    setCornerR]=useState(0);
  const [quietZ,     setQuietZ] =useState(4);
  const [useGrad,    setUseGrad]=useState(false);
  const [gradType,   setGradT]  =useState("linear");
  const [grad1,      setGrad1]  =useState("#3b82f6");
  const [grad2,      setGrad2]  =useState("#8b5cf6");
  const [logoSrc,    setLogo]   =useState(null);
  const [logoSz,     setLogoSz] =useState(22);
  const [logoBR,     setLogoBR] =useState(8);

  const qrValue=useMemo(()=>buildQRValue(contentType,fields),[contentType,fields]);

  const doRender=useCallback(async()=>{
    if(!canvasRef.current) return;
    setRendering(true); setErrMsg("");
    try {
      // generateQRMatrix runs synchronously — pure JS, no CDN
      const matrix=generateQRMatrix(qrValue);
      if(!matrix) throw new Error("Matrix generation failed");
      await renderQRToCanvas(canvasRef.current, matrix, {
        size:500, moduleShape, fgColor,
        bgColor: bgTransp?"transparent":bgColor,
        gradient: useGrad?{type:gradType,colors:[grad1,grad2]}:null,
        eyeColor, logoSrc, logoSize:logoSz/100, logoBR,
        cornerRadius:cornerR, quietZone:quietZ,
      });
      setReady(true);
    } catch(e) {
      console.error("QR render:",e);
      setErrMsg("Render failed: "+e.message);
    }
    setRendering(false);
  },[qrValue,moduleShape,fgColor,bgColor,bgTransp,eyeColor,useGrad,gradType,grad1,grad2,logoSrc,logoSz,logoBR,cornerR,quietZ]);

  useEffect(()=>{
    clearTimeout(debRef.current);
    debRef.current=setTimeout(doRender,300);
    return()=>clearTimeout(debRef.current);
  },[doRender]);

  const download=(fmt)=>{
    if(!canvasRef.current||!ready) return;
    if(fmt==="base64"){navigator.clipboard.writeText(canvasRef.current.toDataURL("image/png")).then(()=>alert("✅ Base64 copied!"));return;}
    const a=document.createElement("a");
    a.download=`qrcode.${fmt}`;
    a.href=canvasRef.current.toDataURL({jpg:"image/jpeg",webp:"image/webp"}[fmt]||"image/png",0.96);
    a.click();
  };

  const SHAPES=[{id:"square",label:"Square"},{id:"rounded",label:"Rounded"},{id:"extra-rounded",label:"Bubble"},{id:"round",label:"Circle"},{id:"dots",label:"Dots"},{id:"diamond",label:"Diamond"},{id:"classy",label:"Classy"}];
  const CTYPES=["url","text","email","phone","sms","wifi","vcard","crypto","geo","event"];

  return (
    <div style={{minHeight:"100vh",background:c.bg,paddingBottom:48,transition:"background 0.3s",position:"relative"}}>
      <QRBackground isDark={theme==="dark"} />
      <header style={{position:"relative",zIndex:2,textAlign:"center",padding:"22px 60px 20px 16px"}}>
        <div style={{display:"inline-flex",alignItems:"center",gap:7,background:c.accentSoft,border:`1px solid ${c.accent}33`,borderRadius:100,padding:"4px 13px",marginBottom:10}}>
          <span style={{fontSize:12}}>⬛</span>
          <span style={{fontSize:11,fontWeight:700,color:c.accent,letterSpacing:"0.09em",textTransform:"uppercase"}}>QR Studio</span>
        </div>
        <h1 style={{margin:"0 0 5px",fontSize:"clamp(1.4rem,4vw,1.9rem)",fontWeight:800,color:c.text,letterSpacing:"-0.03em",transition:"color 0.3s"}}>QR Code Generator</h1>
        <p style={{margin:0,color:c.textSub,fontSize:13,transition:"color 0.3s"}}>Real-time preview · Customizable shapes & colors · Multiple export formats</p>
      </header>

      <main style={{position:"relative",zIndex:2,display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:12,padding:"0 14px 14px",maxWidth:920,margin:"0 auto",alignItems:"start"}}>
        {/* LEFT */}
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <Card>
            <Sec>Content Type</Sec>
            <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:12}}>
              {CTYPES.map(t=><Chip key={t} label={t} active={contentType===t} onClick={()=>setContentType(t)} />)}
            </div>
            <TypeFields type={contentType} fields={fields} onChange={upd} />
          </Card>

          <Card>
            <Sec>Module Shape</Sec>
            <p style={{margin:"0 0 10px",fontSize:12,color:c.textMuted,lineHeight:1.5}}>Shapes apply only to data modules. Corner squares always stay standard.</p>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(82px,1fr))",gap:6}}>
              {SHAPES.map(sh=><ShapeBtn key={sh.id} id={sh.id} label={sh.label} active={moduleShape===sh.id} onClick={()=>setShape(sh.id)} />)}
            </div>
          </Card>

          <Card>
            <Sec>Colors</Sec>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))",gap:10,marginBottom:11}}>
              <Clr label="Modules"    value={fgColor}  onChange={setFg}  />
              <Clr label="Eye frames" value={eyeColor} onChange={setEye} />
              <Clr label="Background" value={bgColor}  onChange={setBg}  />
            </div>
            <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,color:c.textSub,cursor:"pointer",marginBottom:12}}>
              <input type="checkbox" checked={bgTransp} onChange={e=>setTransp(e.target.checked)} style={{accentColor:c.accent}} />
              Transparent background
            </label>
            <div style={{borderRadius:9,background:c.card2,border:`1px solid ${c.border}`,padding:11}}>
              <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,fontWeight:600,color:c.text,cursor:"pointer"}}>
                <input type="checkbox" checked={useGrad} onChange={e=>setUseGrad(e.target.checked)} style={{accentColor:c.accent}} />
                Gradient on modules
              </label>
              {useGrad&&<div style={{marginTop:11}}><Sel label="Type" value={gradType} onChange={setGradT} options={["linear","radial"]} /><div style={{display:"flex",gap:10}}><Clr label="Color 1" value={grad1} onChange={setGrad1} /><Clr label="Color 2" value={grad2} onChange={setGrad2} /></div></div>}
            </div>
          </Card>

          <Card>
            <Sec>Layout</Sec>
            <Rng label="Corner Radius" value={cornerR} onChange={setCornerR} min={0} max={60} unit="px" />
            <Rng label="Quiet Zone"    value={quietZ}  onChange={v=>setQuietZ(Math.max(4,v))} min={4} max={8} />
          </Card>

          <Card>
            <Sec>Central Logo</Sec>
            <Lbl>Upload image</Lbl>
            <input type="file" accept="image/*" onChange={e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>setLogo(ev.target.result);r.readAsDataURL(f);}} style={{fontSize:12,color:c.textSub,width:"100%",marginBottom:logoSrc?11:0}} />
            {logoSrc&&<><Rng label="Logo Size" value={logoSz} onChange={setLogoSz} min={10} max={30} unit="%" /><Rng label="Logo Radius" value={logoBR} onChange={setLogoBR} min={0} max={50} unit="px" /><button onClick={()=>setLogo(null)} style={{fontSize:12,color:c.danger,background:"none",border:"none",cursor:"pointer",padding:0}}>✕ Remove logo</button></>}
          </Card>
        </div>

        {/* RIGHT */}
        <div>
          <Card style={{position:"sticky",top:68}}>
            <Sec>Live Preview</Sec>
            <div style={{position:"relative",borderRadius:10,overflow:"hidden",border:`1px solid ${c.border}`,background:theme==="dark"?"#0d1117":"#ebebeb",aspectRatio:"1/1",marginBottom:12}}>
              <canvas ref={canvasRef} style={{display:"block",width:"100%",height:"100%"}} />
              {rendering&&<ScanOverlay />}
              {ready&&!rendering&&(
                <div style={{position:"absolute",top:9,right:9,display:"flex",alignItems:"center",gap:5,background:c.card,border:`1px solid ${c.border}`,borderRadius:20,padding:"3px 9px",fontSize:10,fontWeight:700,color:c.success}}>
                  <span style={{width:6,height:6,borderRadius:"50%",background:c.success,display:"inline-block",animation:"pulse 2s ease-in-out infinite"}} />LIVE
                </div>
              )}
              {errMsg&&<div style={{position:"absolute",bottom:10,left:10,right:10,background:`${c.danger}22`,border:`1px solid ${c.danger}`,borderRadius:8,padding:"8px 12px",fontSize:12,color:c.danger}}>⚠ {errMsg}</div>}
            </div>
            <Lbl>Export</Lbl>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:7,marginBottom:7}}>
              {["PNG","JPG","WebP","Base64"].map(fmt=>(
                <button key={fmt} onClick={()=>download(fmt.toLowerCase())} disabled={!ready} style={{padding:"8px 0",borderRadius:7,background:ready?c.accentSoft:c.card2,border:`1px solid ${ready?c.accent:c.border}`,color:ready?c.accent:c.textMuted,fontSize:11,fontWeight:700,cursor:ready?"pointer":"not-allowed",transition:"all 0.15s"}}>{fmt}</button>
              ))}
            </div>
            <p style={{margin:0,fontSize:11,color:c.textMuted,textAlign:"center"}}>500 × 500 px · error correction H</p>
          </Card>
        </div>
      </main>

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}*{box-sizing:border-box}body{margin:0}::-webkit-scrollbar{width:5px}::-webkit-scrollbar-thumb{background:${c.border};border-radius:3px}`}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
//  404 ERROR PAGE
// ─────────────────────────────────────────────────────────────────
export function ErrorPage() {
  const {theme,c}=useTheme();
  const floatRef=useRef();
  useEffect(()=>{
    let t=0,id;
    const run=()=>{t+=0.01;if(floatRef.current)floatRef.current.style.transform=`translateY(${Math.sin(t)*10}px)`;id=requestAnimationFrame(run);};
    run(); return()=>cancelAnimationFrame(id);
  },[]);

  const mini=[1,1,1,0,1,1,1,1,0,1,0,1,0,1,1,0,1,0,1,0,1,0,0,0,0,0,0,0,1,0,1,0,1,0,1,1,0,1,0,1,0,1,1,1,1,0,1,1,1];
  const orbs=[{size:64,bottom:"10%",left:"5%",delay:"0s",dur:"6s"},{size:48,bottom:"25%",left:"18%",delay:"1.2s",dur:"5.5s"},{size:56,bottom:"5%",right:"8%",delay:"0.6s",dur:"7s"},{size:40,bottom:"30%",right:"20%",delay:"2s",dur:"5s"},{size:72,bottom:"15%",left:"42%",delay:"1.8s",dur:"6.5s"}];

  return (
    <div style={{minHeight:"100vh",maxHeight:"100vh",overflow:"hidden",background:c.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"24px 20px",position:"relative",transition:"background 0.3s"}}>
      <QRBackground isDark={theme==="dark"} />
      <div style={{position:"absolute",inset:0,overflow:"hidden",pointerEvents:"none",zIndex:1}}>
        {orbs.map((o,i)=>(
          <div key={i} style={{position:"absolute",width:o.size,height:o.size,bottom:o.bottom,left:o.left,right:o.right,borderRadius:10,border:`1px solid ${c.border}`,background:c.card,opacity:0.4,display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:1,padding:5,animation:`floatUp ${o.dur} ${o.delay} ease-in-out infinite alternate`}}>
            {mini.map((v,j)=><div key={j} style={{background:v?c.accent:"transparent",borderRadius:1}} />)}
          </div>
        ))}
      </div>
      <div style={{position:"relative",zIndex:2,textAlign:"center",width:"100%",maxWidth:440}}>
        <div ref={floatRef} style={{display:"flex",justifyContent:"center",marginBottom:24}}>
          <div style={{position:"relative",width:"min(130px,36vw)",height:"min(130px,36vw)"}}>
            {[{top:0,left:0,borderTop:`2px solid ${c.accent}`,borderLeft:`2px solid ${c.accent}`},{top:0,right:0,borderTop:`2px solid ${c.accent}`,borderRight:`2px solid ${c.accent}`},{bottom:0,left:0,borderBottom:`2px solid ${c.accent}`,borderLeft:`2px solid ${c.accent}`},{bottom:0,right:0,borderBottom:`2px solid ${c.accent}`,borderRight:`2px solid ${c.accent}`}].map((s,i)=><div key={i} style={{position:"absolute",width:14,height:14,...s}} />)}
            <div style={{width:"100%",height:"100%",borderRadius:12,background:c.card,border:`1px solid ${c.border}`,padding:"11%",display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:"4%",boxShadow:`0 8px 32px ${c.shadow}`}}>
              {mini.map((v,i)=><div key={i} style={{borderRadius:2,background:v?c.accent:"transparent",animation:v?`qrP ${1.4+(i%5)*.2}s ${(i%7)*.07}s ease-in-out infinite alternate`:"none"}} />)}
            </div>
            <div style={{position:"absolute",left:"8%",right:"8%",height:2,background:`linear-gradient(to right,transparent,${c.accent},transparent)`,borderRadius:1,animation:"sc 2.6s ease-in-out infinite"}} />
          </div>
        </div>
        <div style={{fontSize:"clamp(4rem,18vw,7rem)",fontWeight:900,lineHeight:1,color:c.accent,letterSpacing:"-0.04em",marginBottom:8,userSelect:"none",textShadow:`0 0 60px ${c.accentSoft}`,transition:"color 0.3s"}}>404</div>
        <h1 style={{margin:"0 0 8px",fontSize:"clamp(1rem,3vw,1.25rem)",fontWeight:700,color:c.text,transition:"color 0.3s"}}>Page not found</h1>
        <p style={{margin:"0 0 26px",color:c.textSub,fontSize:14,lineHeight:1.7,padding:"0 8px",transition:"color 0.3s"}}>Oops! This QR code leads nowhere. The page you're looking for doesn't exist.</p>
        <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
          <a href="/" style={{padding:"11px 24px",borderRadius:10,textDecoration:"none",background:c.accent,color:"#fff",fontSize:14,fontWeight:600,boxShadow:`0 4px 14px ${c.accent}44`}}>← Go back home</a>
          <a href="/#contact" style={{padding:"11px 24px",borderRadius:10,textDecoration:"none",background:c.card,color:c.text,fontSize:14,fontWeight:600,border:`1px solid ${c.border}`,transition:"background 0.3s,color 0.3s"}}>Contact support</a>
        </div>
      </div>
      <style>{`@keyframes qrP{from{opacity:.45;transform:scale(.88)}to{opacity:1;transform:scale(1)}}@keyframes sc{0%{top:10%;opacity:0}8%{opacity:1}92%{opacity:1}100%{top:86%;opacity:0}}@keyframes floatUp{from{transform:translateY(0) rotate(-2deg)}to{transform:translateY(-28px) rotate(2deg)}}*{box-sizing:border-box}body{margin:0}`}</style>
    </div>
  );
}

export default QRGeneratorPage;
